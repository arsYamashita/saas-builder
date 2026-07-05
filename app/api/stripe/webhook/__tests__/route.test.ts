import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/tests/helpers/mock-supabase";

// ---- mocks (must be declared before importing the route) ----

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
}));

const mockHeadersGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: mockHeadersGet }),
}));

vi.mock("@/lib/affiliate/mark-referral-converted", () => ({
  markReferralConverted: vi.fn(),
}));
vi.mock("@/lib/affiliate/commission", () => ({
  createCommission: vi.fn(),
}));

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { markReferralConverted } from "@/lib/affiliate/mark-referral-converted";
import { createCommission } from "@/lib/affiliate/commission";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockMarkReferralConverted = vi.mocked(markReferralConverted);
const mockCreateCommission = vi.mocked(createCommission);

/**
 * Minimal in-memory fake of the admin Supabase client, scoped to exactly
 * the tables/queries `upsertSubscriptionFromStripeSubscription` touches.
 * Used only by the redelivery test below, where the generic
 * `createMockSupabaseClient` helper (single canned response per test) isn't
 * expressive enough to model "the second call sees what the first call
 * wrote".
 */
function createFakeWebhookSupabase() {
  const subscriptions: Array<Record<string, unknown>> = [];
  const commissions: Array<Record<string, unknown>> = [];
  const referrals = [
    { id: "referral-1", affiliate_id: "affiliate-1", status: "pending" },
  ];
  const affiliates = [
    { id: "affiliate-1", commission_type: "percentage", commission_value: 10 },
  ];

  return {
    __commissions: commissions,
    from(table: string) {
      if (table === "subscriptions") {
        return {
          upsert: (row: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                const idx = subscriptions.findIndex(
                  (s) => s.stripe_subscription_id === row.stripe_subscription_id
                );
                const record =
                  idx >= 0
                    ? { ...subscriptions[idx], ...row }
                    : { id: `sub-row-${subscriptions.length + 1}`, ...row };
                if (idx >= 0) subscriptions[idx] = record;
                else subscriptions.push(record);
                return { data: record, error: null };
              },
            }),
          }),
        };
      }
      if (table === "commissions") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data:
                  commissions.find((c) => c.subscription_id === val) ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "referrals") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data: referrals.find((r) => r.id === val) ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "affiliates") {
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              maybeSingle: async () => ({
                data: affiliates.find((a) => a.id === val) ?? null,
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`createFakeWebhookSupabase: unexpected table "${table}"`);
    },
  };
}

function makeRequest(body = "{}") {
  return new Request("https://example.com/api/stripe/webhook", {
    method: "POST",
    body,
  });
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    mockCreateAdminClient.mockReturnValue(
      createMockSupabaseClient({
        selectData: null,
        mutationData: { id: "sub-row-1" },
      }) as any
    );
  });

  it("returns 400 when the stripe-signature header is missing", async () => {
    mockHeadersGet.mockReturnValue(null);

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Missing stripe-signature/);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification fails (does not retry)", async () => {
    mockHeadersGet.mockReturnValue("bad-signature");
    mockConstructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature");
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/signature verification failed/i);
  });

  it("returns 400 (not 500) when subscription metadata is missing tenant_id/app_user_id", async () => {
    mockHeadersGet.mockReturnValue("valid-signature");
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          status: "active",
          metadata: {}, // no tenant_id / app_user_id
          items: { data: [{ price: { id: "price_1" } }] },
          customer: "cus_123",
        },
      },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/missing tenant_id or app_user_id/i);
  });

  it("returns 500 (so Stripe retries) on a transient DB error during processing", async () => {
    mockHeadersGet.mockReturnValue("valid-signature");
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          status: "active",
          metadata: { tenant_id: "tenant-1", app_user_id: "user-1" },
          items: { data: [{ price: { id: "price_1" } }] },
          customer: "cus_123",
        },
      },
    });
    mockCreateAdminClient.mockReturnValue(
      createMockSupabaseClient({ error: "connection reset" }) as any
    );

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/Webhook processing failed/);
  });

  it("returns 200 and processes a valid subscription.updated event", async () => {
    mockHeadersGet.mockReturnValue("valid-signature");
    mockConstructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          status: "active",
          metadata: { tenant_id: "tenant-1", app_user_id: "user-1" },
          items: { data: [{ price: { id: "price_1" } }] },
          customer: "cus_123",
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          cancel_at_period_end: false,
        },
      },
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  // See [[affiliate_commission_idempotency_missing]] — Stripe's
  // at-least-once delivery means the exact same event can hit this route
  // twice. The second delivery must not create a second commission row.
  it("does not create a duplicate commission when the same subscription.updated event is redelivered", async () => {
    mockHeadersGet.mockReturnValue("valid-signature");
    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_123",
          status: "active",
          metadata: {
            tenant_id: "tenant-1",
            app_user_id: "user-1",
            referral_id: "referral-1",
          },
          items: { data: [{ price: { id: "price_1", unit_amount: 5000 } }] },
          customer: "cus_123",
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          cancel_at_period_end: false,
        },
      },
    };
    mockConstructEvent.mockReturnValue(event);

    const fakeSupabase = createFakeWebhookSupabase();
    mockCreateAdminClient.mockReturnValue(fakeSupabase as any);

    // createCommission is mocked at module level — give it a real (fake-DB
    // backed) implementation for this test so the second call can observe
    // the first call's write, mirroring the real upsert/ON CONFLICT
    // behavior verified in isolation by lib/affiliate/__tests__/commission.test.ts.
    mockCreateCommission.mockImplementation(async (args) => {
      const already = fakeSupabase.__commissions.find(
        (c) =>
          c.subscription_id === args.subscriptionId &&
          c.affiliate_id === args.affiliateId
      );
      if (already) return null;
      const row = {
        id: `commission-${fakeSupabase.__commissions.length + 1}`,
        subscription_id: args.subscriptionId,
        affiliate_id: args.affiliateId,
        amount: args.amount,
      };
      fakeSupabase.__commissions.push(row);
      return row;
    });

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);

    const second = await POST(makeRequest());
    expect(second.status).toBe(200);

    expect(fakeSupabase.__commissions).toHaveLength(1);
    expect(mockMarkReferralConverted).toHaveBeenCalledTimes(1);
  });
});
