// POST /api/stripe/checkout/purchase
// Guard: requireAuth + requireTenantMember
// Audit: なし (purchase.completed は webhook 側で記録)
//
// body: { tenantId, contentId, successUrl, cancelUrl, attemptId? }
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
    const { tenantId, contentId, successUrl, cancelUrl, attemptId } = body;

    if (!tenantId || !contentId) {
      throw new GuardError(400, "tenantId and contentId are required");
    }

    if (attemptId !== undefined && !ATTEMPT_ID_PATTERN.test(attemptId)) {
      throw new GuardError(400, "attemptId must match [A-Za-z0-9_-]{1,64}");
    }

    await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    // コンテンツ取得
    const { data: content, error: contentError } = await supabase
      .from("contents")
      .select("id, title, price_amount, currency, stripe_price_id, visibility_mode")
      .eq("id", contentId)
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .single();

    if (contentError || !content) {
      throw new GuardError(404, "Content not found");
    }

    if (!content.stripe_price_id && !content.price_amount) {
      throw new GuardError(400, "Content has no price configured");
    }

    // 既存購入チェック
    const { data: existingPurchase } = await supabase
      .from("purchases")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", authUser.id)
      .eq("content_id", contentId)
      .eq("status", "completed")
      .maybeSingle();

    if (existingPurchase) {
      throw new GuardError(409, "Already purchased");
    }

    const stripe = getStripeClient();

    // stripe_price_id がある場合はそれを使い、なければ price_data で動的作成
    const lineItem = content.stripe_price_id
      ? { price: content.stripe_price_id, quantity: 1 }
      : {
          price_data: {
            currency: content.currency || "jpy",
            unit_amount: content.price_amount!,
            product_data: { name: content.title },
          },
          quantity: 1,
        };

    // Stable parts only — no time component (Stripe keys stay valid 24h).
    const idempotencyKey = buildIdempotencyKey([
      "checkout",
      "purchase",
      authUser.id,
      tenantId,
      contentId,
      attemptId ?? "",
    ]);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [lineItem],
        success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success`,
        cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/checkout/cancel`,
        metadata: {
          tenant_id: tenantId,
          app_user_id: authUser.id,
          content_id: contentId,
          type: "purchase",
        },
      },
      { idempotencyKey }
    );

    return Response.json({ url: session.url });
  } catch (error) {
    return handleGuardError(error);
  }
}
