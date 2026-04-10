import Stripe from "stripe";
import { headers } from "next/headers";
import { getStripeClient } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { markReferralConverted } from "@/lib/affiliate/mark-referral-converted";
import { createCommission } from "@/lib/affiliate/commission";
import { notify } from "@/lib/notifications/inbox";
import {
  constructStripeEvent,
  getSupabaseServiceClient,
  handleStripeEvent,
} from "@clan/stripe-kit";

// ---------------------------------------------------------------------------
// Affiliate commission side-effect after subscription upsert
// ---------------------------------------------------------------------------

async function handleAffiliateCommission(
  subscription: Stripe.Subscription,
  subscriptionDbId: string,
  fallbackMetadata?: Record<string, string>
) {
  const tenantId =
    subscription.metadata?.tenant_id || fallbackMetadata?.tenant_id || "";
  const userId =
    subscription.metadata?.app_user_id || fallbackMetadata?.app_user_id || "";
  const referralId =
    subscription.metadata?.referral_id || fallbackMetadata?.referral_id || "";

  if (!referralId || subscription.status !== "active" || !tenantId || !userId) {
    return;
  }

  const supabase = createAdminClient();

  const { data: existingCommission } = await supabase
    .from("commissions")
    .select("*")
    .eq("subscription_id", subscriptionDbId)
    .maybeSingle();

  if (existingCommission) return;

  const { data: referral } = await supabase
    .from("referrals")
    .select("*")
    .eq("id", referralId)
    .maybeSingle();

  if (!referral?.affiliate_id) return;

  await markReferralConverted(referralId);

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("*")
    .eq("id", referral.affiliate_id)
    .maybeSingle();

  if (!affiliate) return;

  let amount = 0;
  if (affiliate.commission_type === "fixed") {
    amount = Number(affiliate.commission_value);
  } else {
    const unitAmount = subscription.items.data[0]?.price?.unit_amount ?? 0;
    amount = Math.floor(
      (unitAmount * Number(affiliate.commission_value || 0)) / 100
    );
  }

  if (amount > 0) {
    await createCommission({
      tenantId,
      affiliateId: affiliate.id,
      referralId,
      subscriptionId: subscriptionDbId,
      amount,
    });
  }
}

// ---------------------------------------------------------------------------
// POST /api/stripe/webhook
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const headerList = await headers();
    const signature = headerList.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    // Signature verification via stripe-kit (throws on invalid)
    let event: Stripe.Event;
    try {
      event = constructStripeEvent(body, signature);
    } catch {
      return new Response("Invalid webhook signature", { status: 400 });
    }

    // Idempotency: skip already-processed events
    const supabaseAdmin = createAdminClient();
    const { data: existing } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existing) {
      return new Response("ok", { status: 200 });
    }

    await supabaseAdmin.from("stripe_webhook_events").insert({
      event_id: event.id,
      event_type: event.type,
    });

    // Core subscription sync via stripe-kit
    const stripe = getStripeClient();
    const supabaseKit = getSupabaseServiceClient();
    const result = await handleStripeEvent(event, { supabase: supabaseKit, stripe });

    // Affiliate commission side-effect for checkout.session.completed
    if (
      result.handled &&
      result.action === "subscription_upserted" &&
      event.type === "checkout.session.completed"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription && result.subscriptionId) {
        // Retrieve full subscription object for affiliate logic
        const fullSub = await stripe.subscriptions.retrieve(result.subscriptionId);
        // Fetch the upserted row to get its DB id
        const { data: subRow } = await supabaseAdmin
          .from("subscriptions")
          .select("id")
          .eq("stripe_subscription_id", result.subscriptionId)
          .maybeSingle();

        if (subRow?.id) {
          await handleAffiliateCommission(fullSub, subRow.id, {
            tenant_id: String(session.metadata?.tenant_id ?? ""),
            app_user_id: String(session.metadata?.app_user_id ?? ""),
            referral_id: String(session.metadata?.referral_id ?? ""),
          });
        }
      }
    }

    // Notification side-effects
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const userId =
        invoice.metadata?.app_user_id ??
        invoice.subscription_details?.metadata?.app_user_id;
      const tenantId =
        invoice.metadata?.tenant_id ??
        invoice.subscription_details?.metadata?.tenant_id;
      const amount = invoice.amount_paid;
      if (userId) {
        await notify(
          userId,
          "支払いが完了しました",
          `¥${amount.toLocaleString("ja-JP")} の請求が確認されました`,
          { tenantId, invoiceId: invoice.id }
        );
      }
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const userId =
        invoice.metadata?.app_user_id ??
        invoice.subscription_details?.metadata?.app_user_id;
      const tenantId =
        invoice.metadata?.tenant_id ??
        invoice.subscription_details?.metadata?.tenant_id;
      if (userId) {
        await notify(
          userId,
          "支払いに失敗しました",
          "カード情報を確認してください",
          { tenantId, invoiceId: invoice.id }
        );
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[stripe/webhook]", error);
    return new Response("Webhook processing failed", { status: 400 });
  }
}
