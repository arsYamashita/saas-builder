import { describe, expect, it, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';
import {
  handleStripeEvent,
  subscriptionToRow,
  HANDLED_EVENT_TYPES,
} from '../webhook';

// Minimal SupabaseClient stub that records upsert calls.
function makeSupabaseStub() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  return {
    client: { from } as unknown as import('@supabase/supabase-js').SupabaseClient,
    upsert,
    from,
  };
}

// Stripe stub that returns a canned subscription on retrieve.
function makeStripeStub(sub: Partial<Stripe.Subscription>) {
  return {
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(sub),
    },
  } as unknown as Stripe;
}

function baseSub(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_123',
    customer: 'cus_abc',
    status: 'active',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { tenant_id: 't_1' },
    items: {
      data: [{ price: { id: 'price_xyz' } }],
    },
    // Newer API places these on items; older on the top level.
    // We carry both so subscriptionToRow can read top-level.
    current_period_start: 1_700_000_000,
    current_period_end: 1_702_592_000,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('HANDLED_EVENT_TYPES', () => {
  it('covers the 4 required events', () => {
    expect(HANDLED_EVENT_TYPES.has('checkout.session.completed')).toBe(true);
    expect(HANDLED_EVENT_TYPES.has('invoice.paid')).toBe(true);
    expect(HANDLED_EVENT_TYPES.has('customer.subscription.updated')).toBe(true);
    expect(HANDLED_EVENT_TYPES.has('customer.subscription.deleted')).toBe(true);
    expect(HANDLED_EVENT_TYPES.size).toBe(4);
  });
});

describe('subscriptionToRow', () => {
  it('maps core fields and converts timestamps to ISO', () => {
    const row = subscriptionToRow(baseSub());
    expect(row.stripe_subscription_id).toBe('sub_123');
    expect(row.stripe_customer_id).toBe('cus_abc');
    expect(row.stripe_price_id).toBe('price_xyz');
    expect(row.status).toBe('active');
    expect(row.cancel_at_period_end).toBe(false);
    expect(row.current_period_start).toBe(new Date(1_700_000_000_000).toISOString());
    expect(row.current_period_end).toBe(new Date(1_702_592_000_000).toISOString());
    expect(row.metadata).toEqual({ tenant_id: 't_1' });
    expect(row.canceled_at).toBeNull();
  });

  it('handles canceled timestamp', () => {
    const row = subscriptionToRow(
      baseSub({ status: 'canceled', canceled_at: 1_703_000_000 })
    );
    expect(row.status).toBe('canceled');
    expect(row.canceled_at).toBe(new Date(1_703_000_000_000).toISOString());
  });

  it('tolerates missing price', () => {
    const row = subscriptionToRow(
      baseSub({ items: { data: [] } } as unknown as Stripe.Subscription)
    );
    expect(row.stripe_price_id).toBeNull();
  });
});

describe('handleStripeEvent routing', () => {
  it('ignores unrelated event types', async () => {
    const { client, upsert } = makeSupabaseStub();
    const result = await handleStripeEvent(
      { type: 'charge.succeeded', data: { object: {} } } as unknown as Stripe.Event,
      { supabase: client }
    );
    expect(result.handled).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('checkout.session.completed (subscription mode) fetches and upserts', async () => {
    const { client, upsert, from } = makeSupabaseStub();
    const stripe = makeStripeStub(baseSub());
    const result = await handleStripeEvent(
      {
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            subscription: 'sub_123',
          },
        },
      } as unknown as Stripe.Event,
      { supabase: client, stripe }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_upserted');
    expect(result.subscriptionId).toBe('sub_123');
    expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_123');
    expect(from).toHaveBeenCalledWith('subscriptions');
    expect(upsert).toHaveBeenCalledOnce();
    const [row, opts] = upsert.mock.calls[0];
    expect(row.stripe_subscription_id).toBe('sub_123');
    expect(opts).toEqual({ onConflict: 'stripe_subscription_id' });
  });

  it('checkout.session.completed (payment mode) is ignored', async () => {
    const { client, upsert } = makeSupabaseStub();
    const stripe = makeStripeStub(baseSub());
    const result = await handleStripeEvent(
      {
        type: 'checkout.session.completed',
        data: { object: { mode: 'payment', subscription: null } },
      } as unknown as Stripe.Event,
      { supabase: client, stripe }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('ignored_checkout_non_subscription');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('invoice.paid with subscription upserts the subscription', async () => {
    const { client, upsert } = makeSupabaseStub();
    const stripe = makeStripeStub(baseSub());
    const result = await handleStripeEvent(
      {
        type: 'invoice.paid',
        data: { object: { subscription: 'sub_123' } },
      } as unknown as Stripe.Event,
      { supabase: client, stripe }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_upserted');
    expect(upsert).toHaveBeenCalledOnce();
  });

  it('invoice.paid without subscription is ignored', async () => {
    const { client, upsert } = makeSupabaseStub();
    const stripe = makeStripeStub(baseSub());
    const result = await handleStripeEvent(
      {
        type: 'invoice.paid',
        data: { object: {} },
      } as unknown as Stripe.Event,
      { supabase: client, stripe }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('ignored_invoice_no_subscription');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('customer.subscription.updated upserts directly from event body', async () => {
    const { client, upsert } = makeSupabaseStub();
    const result = await handleStripeEvent(
      {
        type: 'customer.subscription.updated',
        data: { object: baseSub({ status: 'past_due' }) },
      } as unknown as Stripe.Event,
      { supabase: client }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_upserted');
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].status).toBe('past_due');
  });

  it('customer.subscription.deleted upserts with canceled status', async () => {
    const { client, upsert } = makeSupabaseStub();
    const result = await handleStripeEvent(
      {
        type: 'customer.subscription.deleted',
        data: { object: baseSub({ status: 'canceled' }) },
      } as unknown as Stripe.Event,
      { supabase: client }
    );
    expect(result.handled).toBe(true);
    expect(result.action).toBe('subscription_deleted');
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].status).toBe('canceled');
  });

  it('bubbles up supabase upsert errors', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
    const from = vi.fn().mockReturnValue({ upsert });
    const client = { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
    await expect(
      handleStripeEvent(
        {
          type: 'customer.subscription.updated',
          data: { object: baseSub() },
        } as unknown as Stripe.Event,
        { supabase: client }
      )
    ).rejects.toThrow(/Supabase upsert failed: boom/);
  });
});
