import Stripe from 'stripe';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const stripeEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
});

const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export function getStripeEnv() {
  return stripeEnvSchema.parse(process.env);
}

export function getSupabaseServiceClient(): SupabaseClient {
  const env = supabaseEnvSchema.parse(process.env);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Verify a Stripe webhook signature and return the typed event.
 * Call this BEFORE parsing the body — the raw body is required.
 */
export function constructStripeEvent(
  rawBody: string | Buffer,
  signature: string,
  stripe?: Stripe
): Stripe.Event {
  const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = getStripeEnv();
  const client = stripe ?? new Stripe(STRIPE_SECRET_KEY);
  return client.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

// -------------------------------------------------------------
// Subscription sync to Supabase `subscriptions` table
// -------------------------------------------------------------

export interface SubscriptionRow {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  stripe_price_id: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
}

function tsToIso(ts: number | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
}

export function subscriptionToRow(sub: Stripe.Subscription): SubscriptionRow {
  const priceId =
    sub.items?.data?.[0]?.price?.id ?? null;
  return {
    stripe_subscription_id: sub.id,
    stripe_customer_id:
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_price_id: priceId,
    status: sub.status,
    current_period_start: tsToIso((sub as unknown as { current_period_start?: number }).current_period_start),
    current_period_end: tsToIso((sub as unknown as { current_period_end?: number }).current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    canceled_at: tsToIso(sub.canceled_at ?? null),
    metadata: (sub.metadata ?? {}) as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };
}

// -------------------------------------------------------------
// Event routing
// -------------------------------------------------------------

export type HandledEventType =
  | 'checkout.session.completed'
  | 'invoice.paid'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted';

export const HANDLED_EVENT_TYPES: ReadonlySet<HandledEventType> = new Set<HandledEventType>([
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export interface HandleEventDeps {
  supabase: SupabaseClient;
  /** Optional Stripe client — required only if the event needs to expand a subscription */
  stripe?: Stripe;
}

export interface HandleEventResult {
  handled: boolean;
  type: string;
  action?:
    | 'subscription_upserted'
    | 'subscription_deleted'
    | 'ignored_checkout_non_subscription'
    | 'ignored_invoice_no_subscription';
  subscriptionId?: string;
}

/**
 * Route a verified Stripe event to the right Supabase sync action.
 * Throws on unexpected shape; returns `{ handled: false }` for ignored event types.
 */
export async function handleStripeEvent(
  event: Stripe.Event,
  deps: HandleEventDeps
): Promise<HandleEventResult> {
  const { supabase, stripe } = deps;

  if (!HANDLED_EVENT_TYPES.has(event.type as HandledEventType)) {
    return { handled: false, type: event.type };
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription' || !session.subscription) {
        return {
          handled: true,
          type: event.type,
          action: 'ignored_checkout_non_subscription',
        };
      }
      const subId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription.id;
      const sub = await fetchSubscription(subId, stripe);
      const row = subscriptionToRow(sub);
      await upsertSubscription(supabase, row);
      return {
        handled: true,
        type: event.type,
        action: 'subscription_upserted',
        subscriptionId: sub.id,
      };
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subRef = (invoice as unknown as { subscription?: string | Stripe.Subscription })
        .subscription;
      if (!subRef) {
        return {
          handled: true,
          type: event.type,
          action: 'ignored_invoice_no_subscription',
        };
      }
      const subId = typeof subRef === 'string' ? subRef : subRef.id;
      const sub = await fetchSubscription(subId, stripe);
      const row = subscriptionToRow(sub);
      await upsertSubscription(supabase, row);
      return {
        handled: true,
        type: event.type,
        action: 'subscription_upserted',
        subscriptionId: sub.id,
      };
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const row = subscriptionToRow(sub);
      await upsertSubscription(supabase, row);
      return {
        handled: true,
        type: event.type,
        action: 'subscription_upserted',
        subscriptionId: sub.id,
      };
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const row = subscriptionToRow(sub);
      // Preserve a record with canceled status rather than hard-deleting.
      await upsertSubscription(supabase, { ...row, status: sub.status || 'canceled' });
      return {
        handled: true,
        type: event.type,
        action: 'subscription_deleted',
        subscriptionId: sub.id,
      };
    }
  }

  return { handled: false, type: event.type };
}

async function fetchSubscription(
  subId: string,
  stripe?: Stripe
): Promise<Stripe.Subscription> {
  const client =
    stripe ?? new Stripe(stripeEnvSchema.parse(process.env).STRIPE_SECRET_KEY);
  return client.subscriptions.retrieve(subId);
}

async function upsertSubscription(
  supabase: SupabaseClient,
  row: SubscriptionRow
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .upsert(row, { onConflict: 'stripe_subscription_id' });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}
