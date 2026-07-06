/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/billing/stripe", () => ({
  getStripeClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getStripeClient } from "@/lib/billing/stripe";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockGetStripeClient = vi.mocked(getStripeClient);

const DB_ERROR = fakePostgresError({
  message: 'permission denied for relation "subscriptions_billing_internal"',
  code: "42501",
});
const FORBIDDEN = ["subscriptions_billing_internal", "permission denied", "42501"];

describe("POST /api/billing/portal — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com", displayName: null } as any);
    mockGetStripeClient.mockReturnValue({
      billingPortal: { sessions: { create: vi.fn() } },
    } as any);
  });

  it("does not leak the DB error when loading the subscription fails", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: DB_ERROR }),
              }),
            }),
          }),
        }),
      }),
    } as any);

    const res = await POST();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to load subscription" });
  });

  it("does not leak an unexpected thrown error (e.g. Stripe portal session failure)", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: { stripe_customer_id: "cus_123" },
                    error: null,
                  }),
              }),
            }),
          }),
        }),
      }),
    } as any);
    mockGetStripeClient.mockReturnValue({
      billingPortal: {
        sessions: {
          create: vi.fn().mockRejectedValue(
            new Error(
              'StripeConnectionError: relation "billing_portal_cache" does not exist'
            )
          ),
        },
      },
    } as any);

    const res = await POST();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["billing_portal_cache", "StripeConnectionError"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create portal session" });
  });
});
