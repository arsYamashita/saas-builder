// POST /api/stripe/webhook
// Guard: なし (Stripe 署名検証)
// Audit: subscription.created / subscription.updated / subscription.canceled / purchase.completed

import Stripe from "stripe";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { writeAuditLog } from "@/lib/audit";

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is missing");
  return secret;
}

// ─── Subscription upsert ───

async function upsertSubscription(
  subscription: Stripe.Subscription,
  fallbackMeta?: Record<string, string>
) {
  const supabase = createAdminClient();

  const tenantId =
    subscription.metadata?.tenant_id || fallbackMeta?.tenant_id || "";
  const userId =
    subscription.metadata?.app_user_id || fallbackMeta?.app_user_id || "";
  const planId =
    subscription.metadata?.plan_id || fallbackMeta?.plan_id || null;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? "";

  const { data, error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        plan_id: planId,
        stripe_customer_id: customerId,
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
        canceled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
      },
      { onConflict: "stripe_subscription_id" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }

  return { data, tenantId, userId };
}

// ─── Purchase upsert (冪等) ───

async function upsertPurchase(session: Stripe.Checkout.Session) {
  const supabase = createAdminClient();

  const tenantId = session.metadata?.tenant_id || "";
  const userId = session.metadata?.app_user_id || "";
  const contentId = session.metadata?.content_id || "";

  if (!tenantId || !userId || !contentId) return null;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // 冪等チェック: 同一 payment_intent_id の purchase が存在するか
  if (paymentIntentId) {
    const { data: existing } = await supabase
      .from("purchases")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();

    if (existing) {
      // 既に処理済み — 重複を防ぐ
      return null;
    }
  }

  const { data, error } = await supabase
    .from("purchases")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      content_id: contentId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_checkout_session_id: session.id,
      amount: session.amount_total ?? 0,
      currency: session.currency ?? "jpy",
      status: "completed",
      purchased_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    // UNIQUE 制約違反 (レースコンディション) は冪等として扱う
    if (error.code === "23505") return null;
    throw new Error(`Failed to insert purchase: ${error.message}`);
  }

  return { data, tenantId, userId };
}

// ─── Webhook handler ───

export async function POST(req: Request) {
  try {
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing stripe-signature", { status: 400 });
    }

    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    // ── checkout.session.completed ──
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id
        );
        const result = await upsertSubscription(sub, {
          tenant_id: String(session.metadata?.tenant_id ?? ""),
          app_user_id: String(session.metadata?.app_user_id ?? ""),
          plan_id: String(session.metadata?.plan_id ?? ""),
        });

        if (result.tenantId) {
          await writeAuditLog({
            tenantId: result.tenantId,
            actorUserId: result.userId || null,
            action: "subscription.created",
            resourceType: "subscription",
            resourceId: result.data.id,
            after: result.data,
          });
        }
      }

      if (session.mode === "payment" && session.metadata?.type === "purchase") {
        const result = await upsertPurchase(session);
        if (result?.tenantId) {
          await writeAuditLog({
            tenantId: result.tenantId,
            actorUserId: result.userId || null,
            action: "purchase.completed",
            resourceType: "purchase",
            resourceId: result.data.id,
            after: result.data,
          });
        }
      }
    }

    // ── subscription updated ──
    if (event.type === "customer.subscription.updated") {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscription(sub);

      if (result.tenantId) {
        await writeAuditLog({
          tenantId: result.tenantId,
          actorUserId: result.userId || null,
          action: "subscription.updated",
          resourceType: "subscription",
          resourceId: result.data.id,
          after: result.data,
        });
      }
    }

    // ── subscription deleted ──
    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const result = await upsertSubscription(sub);

      if (result.tenantId) {
        await writeAuditLog({
          tenantId: result.tenantId,
          actorUserId: result.userId || null,
          action: "subscription.canceled",
          resourceType: "subscription",
          resourceId: result.data.id,
          after: result.data,
        });
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown webhook error";
    return new Response(message, { status: 400 });
  }
}
