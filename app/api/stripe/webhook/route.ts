import Stripe from "stripe";
import { headers } from "next/headers";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { markReferralConverted } from "@/lib/affiliate/mark-referral-converted";
import { createCommission } from "@/lib/affiliate/commission";
import { MissingWebhookMetadataError } from "@/lib/billing/webhook-errors";
import { verifyWebhookSignature } from "@/lib/payments";

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
    subscription.metadata?.tenant_id ?? fallbackMetadata?.tenant_id;
  const userId =
    subscription.metadata?.app_user_id ?? fallbackMetadata?.app_user_id;
  const referralId =
    subscription.metadata?.referral_id ?? fallbackMetadata?.referral_id;

  if (!tenantId || !userId) {
    throw new MissingWebhookMetadataError(
      `Stripe webhook: missing tenant_id or app_user_id in metadata (subscription=${subscription.id})`
    );
  }

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
  // 1. Signature verification: isolated try/catch that always returns 400.
  // An invalid/missing signature is never a transient failure, so Stripe
  // should not retry it. See [[stripe_webhook_signature_missing]].
  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
    const webhookSecret = getWebhookSecret();

    const body = await req.text();
    const headerList = await headers();
    const signature = headerList.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    event = verifyWebhookSignature(stripe, body, signature, webhookSecret);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  // 2. Event processing: separate try/catch so transient errors (DB outage,
  // etc.) return 500 and let Stripe retry, while known-permanent errors
  // (missing metadata) return 400. See [[stripe_webhook_transient_error_no_retry]].
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id
        );

        const fallbackMetadata: Record<string, string> = {};
        if (session.metadata?.tenant_id) {
          fallbackMetadata.tenant_id = session.metadata.tenant_id;
        }
        if (session.metadata?.app_user_id) {
          fallbackMetadata.app_user_id = session.metadata.app_user_id;
        }
        if (session.metadata?.referral_id) {
          fallbackMetadata.referral_id = session.metadata.referral_id;
        }

        await upsertSubscriptionFromStripeSubscription(
          subscription,
          fallbackMetadata
        );
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

    if (error instanceof MissingWebhookMetadataError) {
      console.error("[stripe-webhook] missing metadata:", message);
      // 400: configuration error, retrying will not help.
      return new Response(message, { status: 400 });
    }

    console.error("[stripe-webhook] processing error:", message);
    // 500: transient failure (DB outage, etc.) — ask Stripe to retry.
    return new Response("Webhook processing failed", { status: 500 });
  }
}
