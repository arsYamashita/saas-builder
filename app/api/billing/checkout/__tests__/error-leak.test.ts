/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 * Business-logic coverage (idempotency key derivation) lives in
 * ./route.test.ts; this file is scoped to the "does the response leak
 * internal error detail" question.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/payments", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments")>();
  return {
    ...actual,
    getStripeClient: () => ({ checkout: { sessions: { create: vi.fn() } } }),
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

describe("POST /api/billing/checkout — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      displayName: null,
    } as any);
    mockGetCurrentTenantForUser.mockResolvedValue({ tenant_id: "tenant-1" } as any);
    mockGetAffiliateTracking.mockResolvedValue({ affiliateCode: null, visitorToken: null });
  });

  it("does not leak the DB error when the plan lookup fails (serverErrorResponse path)", async () => {
    const dbError = fakePostgresError({
      message: 'permission denied for relation "membership_plans_internal_cost"',
      code: "42501",
    });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: dbError }),
            }),
          }),
        }),
      }),
    } as any);

    const res = await POST(
      makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
    );

    expect(res.status).toBe(404);
    const text = await res.text();
    assertNoLeak(text, [
      "membership_plans_internal_cost",
      "permission denied",
      "42501",
    ]);
    expect(JSON.parse(text).error).toBe("Plan not found");
    expect(typeof JSON.parse(text).errorId).toBe("string");
  });

  it("does not leak an unexpected thrown error (e.g. Stripe session-create failure)", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { id: "plan-1", price_id: "price_123" },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    } as any);

    vi.spyOn(
      await import("@/lib/payments"),
      "createCheckoutSession"
    ).mockRejectedValue(
      new Error(
        'StripeInvalidRequestError: relation "checkout_sessions_cache" does not exist'
      )
    );

    const res = await POST(
      makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["checkout_sessions_cache", "StripeInvalidRequestError"]);
    expect(JSON.parse(text).error).toBe("Failed to create checkout session");
  });
});
