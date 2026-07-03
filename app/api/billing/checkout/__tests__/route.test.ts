import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---- mocks (must be declared before importing the route) ----

const mockSessionsCreate = vi.fn();

// Keep the REAL buildIdempotencyKey so these tests exercise the actual key
// derivation (the Codex review finding was precisely about its semantics);
// only the Stripe client is stubbed.
vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>();
  return {
    ...actual,
    getStripeClient: () => ({
      checkout: { sessions: { create: mockSessionsCreate } },
    }),
  };
});

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/tenant/current-tenant", () => ({
  getCurrentTenantForUser: vi.fn(),
}));

vi.mock("@/lib/affiliate/tracking", () => ({
  getAffiliateTracking: vi.fn(),
}));

vi.mock("@/lib/affiliate/find-affiliate-by-code", () => ({
  findAffiliateByCode: vi.fn(),
}));

vi.mock("@/lib/affiliate/find-or-create-referral", () => ({
  findOrCreateReferral: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";
import { getAffiliateTracking } from "@/lib/affiliate/tracking";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockGetCurrentTenantForUser = vi.mocked(getCurrentTenantForUser);
const mockGetAffiliateTracking = vi.mocked(getAffiliateTracking);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: null,
    } as any);
    mockGetCurrentTenantForUser.mockResolvedValue({
      tenant_id: "tenant-1",
    } as any);
    mockGetAffiliateTracking.mockResolvedValue({
      affiliateCode: null,
      visitorToken: null,
    });

    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: "plan-1", price_id: "price_123" },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any);

    mockSessionsCreate.mockResolvedValue({ url: "https://stripe.test/session" });
  });

  it("passes an idempotencyKey scoped to user + plan + attempt_id", async () => {
    const res = await POST(
      makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
    );

    expect(res.status).toBe(200);
    expect(mockSessionsCreate).toHaveBeenCalledTimes(1);

    const [, requestOptions] = mockSessionsCreate.mock.calls[0];
    // See [[stripe_checkout_idempotency_key_missing]] — a retried/duplicated
    // client request must not create a second Checkout Session.
    expect(requestOptions).toEqual({
      idempotencyKey: "checkout:user-1:plan-1:attempt-abc",
    });
  });

  it("derives an identical key for a retry of the same attempt (time-independent)", async () => {
    // Regression test for the Codex review finding: the key previously
    // contained a minute bucket, so a retry after a timeout that crossed a
    // minute boundary produced a different key and a duplicate session.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-03T12:00:59.000Z"));
      await POST(
        makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
      );

      vi.setSystemTime(new Date("2026-07-03T12:01:01.000Z")); // crosses the old bucket boundary
      await POST(
        makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
      );

      const keys = mockSessionsCreate.mock.calls.map(
        ([, options]) => options.idempotencyKey
      );
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a stable user+plan key when attempt_id is omitted", async () => {
    const res = await POST(makeRequest({ membership_plan_id: "plan-1" }));

    expect(res.status).toBe(200);
    const [, requestOptions] = mockSessionsCreate.mock.calls[0];
    expect(requestOptions).toEqual({
      idempotencyKey: "checkout:user-1:plan-1",
    });
  });

  it("returns 400 without calling Stripe when attempt_id has an invalid format", async () => {
    const res = await POST(
      makeRequest({
        membership_plan_id: "plan-1",
        attempt_id: "bad key with spaces!",
      })
    );

    expect(res.status).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 without calling Stripe when membership_plan_id is missing", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });
});
