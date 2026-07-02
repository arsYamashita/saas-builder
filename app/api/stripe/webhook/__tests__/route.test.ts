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
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);

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
});
