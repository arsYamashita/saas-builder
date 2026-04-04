import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";
import { getAffiliateTracking } from "@/lib/affiliate/tracking";
import { findAffiliateByCode } from "@/lib/affiliate/find-affiliate-by-code";
import { findOrCreateReferral } from "@/lib/affiliate/find-or-create-referral";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const membershipPlanId = body.membership_plan_id as string | undefined;

    if (!membershipPlanId) {
      return NextResponse.json(
        { error: "membership_plan_id is required" },
        { status: 400 }
      );
    }

    const user = await requireCurrentUser();
    const tenantMembership = await getCurrentTenantForUser();
    const tenantId = tenantMembership.tenant_id;
    const supabase = createAdminClient();
    const stripe = getStripeClient();

    const { data: plan, error: planError } = await supabase
      .from("membership_plans")
      .select(
        `
        *,
        billing_prices (
          id,
          stripe_price_id,
          amount,
          currency,
          interval,
          trial_days,
          status
        )
      `
      )
      .eq("id", membershipPlanId)
      .eq("tenant_id", tenantId)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "Plan not found", details: planError?.message },
        { status: 404 }
      );
    }

    if (!plan.price_id) {
      return NextResponse.json(
        { error: "price_id is not set on the plan" },
        { status: 400 }
      );
    }

    // Resolve the Stripe price ID from the linked billing_prices row
    const billingPrice = Array.isArray(plan.billing_prices)
      ? plan.billing_prices[0]
      : plan.billing_prices;

    const stripePriceId = billingPrice?.stripe_price_id ?? null;

    if (!stripePriceId) {
      return NextResponse.json(
        { error: "Stripe price is not configured for this plan. Please sync billing settings." },
        { status: 400 }
      );
    }

    const { affiliateCode, visitorToken } = await getAffiliateTracking();

    let referralId: string | null = null;
    let affiliateId: string | null = null;

    if (affiliateCode) {
      const affiliate = await findAffiliateByCode(tenantId, affiliateCode);

      if (affiliate) {
        affiliateId = affiliate.id;

        const referral = await findOrCreateReferral({
          tenantId,
          affiliateId: affiliate.id,
          visitorToken,
          referredUserId: user.id,
        });

        referralId = referral.id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=cancel`,
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: {
        tenant_id: tenantId,
        app_user_id: user.id,
        membership_plan_id: membershipPlanId,
        referral_id: referralId ?? "",
        affiliate_id: affiliateId ?? "",
      },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error("Create checkout session error:", error);

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
