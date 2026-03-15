// POST /api/stripe/checkout/subscription
// Guard: requireAuth + requireTenantMember
// Audit: なし (subscription.created は webhook 側で記録)
//
// body: { tenantId, planId, successUrl, cancelUrl }

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { getStripe } from "@/lib/stripe";

export async function POST(req: Request) {
  try {
    const authUser = await requireAuth();
    const body = await req.json();
    const { tenantId, planId, successUrl, cancelUrl } = body;

    if (!tenantId || !planId) {
      throw new GuardError(400, "tenantId and planId are required");
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

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
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
    });

    return Response.json({ url: session.url });
  } catch (error) {
    return handleGuardError(error);
  }
}
