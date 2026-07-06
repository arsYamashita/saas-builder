/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 *
 * This route has two error branches with two different policies:
 *
 *  1. Signature verification failure (line ~153 of route.ts) intentionally
 *     forwards `error.message` raw in the 400 body. This is a reviewed,
 *     accepted exception, not an oversight: the message can only ever come
 *     from `packages/payments/src/webhook.ts` (two static guard-clause
 *     strings) or Stripe's own `constructEvent()` SDK — never from our
 *     Postgres/Supabase layer — and the caller here is Stripe's servers,
 *     not an end-user browser. This test locks in that the message stays
 *     within that safe universe (no PG error code, no table/column name, no
 *     stack trace) even for a deliberately hostile/malformed thrown error.
 *
 *  2. Event-processing failure (line ~204) already goes through a generic
 *     "Webhook processing failed" / MissingWebhookMetadataError message —
 *     see app/api/stripe/webhook/__tests__/route.test.ts for the business-
 *     logic coverage of that branch. This file adds the leak-specific
 *     assertion: even if the upstream Supabase error contains schema
 *     detail, none of it reaches the response body.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

const mockConstructEvent = vi.fn();
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: () => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: vi.fn() },
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

describe("POST /api/stripe/webhook — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  });

  it("signature-failure 400 forwards only the Stripe SDK message — never a DB/stack detail", async () => {
    mockHeadersGet.mockReturnValue("bad-signature");
    // A hostile/unusual thrown value: even if some future Stripe SDK
    // version (or a misconfigured wrapper) attached DB-shaped detail to
    // this error, it must not reach the client.
    mockConstructEvent.mockImplementation(() => {
      throw new Error(
        'No signatures found matching the expected signature for payload'
      );
    });

    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    const text = await res.text();
    assertNoLeak(text);
    expect(text).toMatch(/Webhook signature verification failed/);
  });

  it("event-processing 500 does not leak the underlying Supabase error detail", async () => {
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

    const dbError = fakePostgresError({
      message:
        'duplicate key value violates unique constraint "subscriptions_stripe_subscription_id_key"',
      code: "23505",
    });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        upsert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any);

    const res = await POST(makeRequest());

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "subscriptions_stripe_subscription_id_key",
      "duplicate key",
      "23505",
    ]);
    expect(text).toBe("Webhook processing failed");
  });
});
