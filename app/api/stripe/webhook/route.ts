import Stripe from "stripe";
import { headers } from "next/headers";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { markReferralConverted } from "@/lib/affiliate/mark-referral-converted";
import { createCommission } from "@/lib/affiliate/commission";

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  }
  return secret;
}

async function upsertSubscriptionFromStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackMetadata?: Record<string, string>
) {
  const supabase = createAdminClient();

  const tenantId =
    subscription.metadata?.tenant_id || fallbackMetadata?.tenant_id || "";
  const userId =
    subscription.metadata?.app_user_id || fallbackMetadata?.app_user_id || "";
  const referralId =
    subscription.metadata?.referral_id || fallbackMetadata?.referral_id || "";

  const priceId = subscription.items.data[0]?.price?.id ?? null;

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        stripe_customer_id:
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id,
        stripe_subscription_id: subscription.id,
        status: subscription.status,
        current_period_start: new Date(
          subscription.current_period_start
            ? subscription.current_period_start * 1000
            : Date.now()
        ).toISOString(),
        current_period_end: new Date(
          subscription.current_period_end
            ? subscription.current_period_end * 1000
            : Date.now()
        ).toISOString(),
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      },
      {
        onConflict: "stripe_subscription_id",
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }

  if (
    referralId &&
    subscription.status === "active" &&
    tenantId &&
    userId
  ) {
    const supabase2 = createAdminClient();

    const { data: existingCommission } = await supabase2
      .from("commissions")
      .select("*")
      .eq("subscription_id", data.id)
      .maybeSingle();

    if (!existingCommission) {
      const { data: referral } = await supabase2
        .from("referrals")
        .select("*")
        .eq("id", referralId)
        .maybeSingle();

      if (referral?.affiliate_id) {
        await markReferralConverted(referralId);

        const { data: affiliate } = await supabase2
          .from("affiliates")
          .select("*")
          .eq("id", referral.affiliate_id)
          .maybeSingle();

        if (affiliate) {
          let amount = 0;

          if (affiliate.commission_type === "fixed") {
            amount = Number(affiliate.commission_value);
          } else {
            const unitAmount =
              subscription.items.data[0]?.price?.unit_amount ?? 0;
            amount = Math.floor(
              (unitAmount * Number(affiliate.commission_value || 0)) / 100
            );
          }

          if (amount > 0) {
            await createCommission({
              tenantId,
              affiliateId: affiliate.id,
              referralId,
              subscriptionId: data.id,
              amount,
            });
          }
        }
      }
    }
  }

  return data;
}

export async function POST(req: Request) {
  try {
    const stripe = getStripeClient();
    const webhookSecret = getWebhookSecret();

    const body = await req.text();
    const headerList = await headers();
    const signature = headerList.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id
        );

        await upsertSubscriptionFromStripeSubscription(subscription, {
          tenant_id: String(session.metadata?.tenant_id ?? ""),
          app_user_id: String(session.metadata?.app_user_id ?? ""),
          referral_id: String(session.metadata?.referral_id ?? ""),
        });
      }
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripeSubscription(subscription);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscriptionFromStripeSubscription(subscription);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook error";

    return new Response(message, { status: 400 });
  }
}
