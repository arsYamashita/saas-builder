import { NextRequest, NextResponse } from "next/server";
import { getStripeClient, buildIdempotencyKey } from "@/lib/payments";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";
import { getAffiliateTracking } from "@/lib/affiliate/tracking";
import { findAffiliateByCode } from "@/lib/affiliate/find-affiliate-by-code";
import { findOrCreateReferral } from "@/lib/affiliate/find-or-create-referral";

// Client-generated purchase-attempt identifier (UUID or similar).
// Charset/length-restricted so it embeds safely in a Stripe idempotency
// key (Stripe caps keys at 255 chars).
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const membershipPlanId = body.membership_plan_id as string | undefined;
    const attemptId = body.attempt_id as string | undefined;

    if (!membershipPlanId) {
      return NextResponse.json(
        { error: "membership_plan_id is required" },
        { status: 400 }
      );
    }

    if (attemptId !== undefined && !ATTEMPT_ID_PATTERN.test(attemptId)) {
      return NextResponse.json(
        { error: "attempt_id must match [A-Za-z0-9_-]{1,64}" },
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
      .select("*")
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

    // Idempotency key: without it, a client-side retry or network timeout
    // on this endpoint creates a second Checkout Session (and, once paid, a
    // second subscription) for the same purchase attempt.
    // See [[stripe_checkout_idempotency_key_missing]].
    //
    // The key is built ONLY from stable parts — no time component. The
    // client sends attempt_id (a UUID minted once per page mount and reused
    // across retries of that attempt), so retries map to the same key no
    // matter how much time passes, while a fresh visit to the billing page
    // starts a new attempt. Stripe keys stay valid for 24h. If an older
    // client omits attempt_id, the key degrades to user+plan: retries are
    // still deduplicated, and a genuine repeat purchase of the same plan is
    // deduplicated within Stripe's 24h key window (acceptable for
    // subscription checkout, where an immediate same-plan re-purchase is
    // itself almost always a duplicate).
    const idempotencyKey = buildIdempotencyKey([
      "checkout",
      user.id,
      membershipPlanId,
      attemptId ?? "",
    ]);

    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [
          {
            price: plan.price_id,
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
      },
      { idempotencyKey }
    );

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (error) {
    console.error("Create checkout session error:", error);

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
