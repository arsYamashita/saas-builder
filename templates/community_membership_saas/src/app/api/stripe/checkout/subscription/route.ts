// POST /api/stripe/checkout/subscription
// Guard: requireAuth + requireTenantMember
// Audit: なし (subscription.created は webhook 側で記録)
//
// body: { tenantId, planId, successUrl, cancelUrl, attemptId? }
//
// Uses the hardened @/lib/payments module (not a local Stripe client) for
// idempotency-key support per docs/rules/06-api-rules.md, "Payments
// (Stripe) — Security Baseline". See [[stripe_checkout_idempotency_key_missing]].

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { getStripeClient, buildIdempotencyKey } from "@/lib/payments";

const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request) {
  try {
    const authUser = await requireAuth();
    const body = await req.json();
    const { tenantId, planId, successUrl, cancelUrl, attemptId } = body;

    if (!tenantId || !planId) {
      throw new GuardError(400, "tenantId and planId are required");
    }

    if (attemptId !== undefined && !ATTEMPT_ID_PATTERN.test(attemptId)) {
      throw new GuardError(400, "attemptId must match [A-Za-z0-9_-]{1,64}");
    }

    await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    // プラン取得
    const { data: plan, error: planError } = await supabase
      .from("membership_plans")
      .select("id, stripe_price_id, stripe_price_id_yearly, name")
      .eq("id", planId)
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .single();

    if (planError || !plan) {
      throw new GuardError(404, "Plan not found");
    }

    if (!plan.stripe_price_id) {
      throw new GuardError(400, "Plan has no Stripe price configured");
    }

    // 既存 active subscription チェック
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", authUser.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingSub) {
      throw new GuardError(409, "Already has an active subscription");
    }

    const stripe = getStripeClient();

    // Stable parts only — no time component (Stripe keys stay valid 24h).
    // attemptId (client-minted, reused across retries) distinguishes
    // genuinely separate purchase attempts; degrades gracefully without it.
    const idempotencyKey = buildIdempotencyKey([
      "checkout",
      "subscription",
      authUser.id,
      tenantId,
      planId,
      attemptId ?? "",
    ]);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success`,
        cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel`,
        metadata: {
          tenant_id: tenantId,
          app_user_id: authUser.id,
          plan_id: planId,
        },
        subscription_data: {
          metadata: {
            tenant_id: tenantId,
            app_user_id: authUser.id,
            plan_id: planId,
          },
        },
      },
      { idempotencyKey }
    );

    return Response.json({ url: session.url });
  } catch (error) {
    return handleGuardError(error);
  }
}
