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
import { findAffiliateByCode } from "@/lib/affiliate/find-affiliate-by-code";
import { findOrCreateReferral } from "@/lib/affiliate/find-or-create-referral";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockGetCurrentTenantForUser = vi.mocked(getCurrentTenantForUser);
const mockGetAffiliateTracking = vi.mocked(getAffiliateTracking);
const mockFindAffiliateByCode = vi.mocked(findAffiliateByCode);
const mockFindOrCreateReferral = vi.mocked(findOrCreateReferral);

const KEY_PATTERN = /^checkout:user-1:plan-1:attempt-abc:[0-9a-f]{16}$/;

function sentKeys(): string[] {
  return mockSessionsCreate.mock.calls.map(
    ([, options]) => options.idempotencyKey as string
  );
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Builds a fake admin client that routes `.from(table)` to the plan-lookup
 * chain (`membership_plans`, `.select().eq().eq().single()`) and `.rpc(fn)`
 * to the atomic checkout-slot reservation/release functions. See
 * [[stripe_recurring_subscription_missing_conflict_guard]] and
 * supabase/migrations/0019_subscription_checkout_reservations.sql.
 */
function makeAdminClient(opts?: {
  plan?: { data: unknown; error: unknown };
  hasConflict?: boolean;
}) {
  const plan = opts?.plan ?? {
    data: { id: "plan-1", price_id: "price_123" },
    error: null,
  };
  const hasConflict = opts?.hasConflict ?? false;

  const rpc = vi.fn(async (fn: string) => {
    if (fn === "reserve_subscription_checkout_slot") {
      return hasConflict
        ? { data: null, error: { message: "SUBSCRIPTION_CONFLICT" } }
        : { data: "reservation-1", error: null };
    }
    if (fn === "release_subscription_checkout_slot") {
      return { data: null, error: null };
    }
    throw new Error(`unexpected rpc in test: ${fn}`);
  });

  return {
    from: (table: string) => {
      if (table === "membership_plans") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => plan,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    },
    rpc,
  } as any;
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

    mockCreateAdminClient.mockReturnValue(makeAdminClient());

    mockSessionsCreate.mockResolvedValue({ url: "https://stripe.test/session" });
  });

  it("returns 409 without calling Stripe when the reservation RPC reports a conflict (existing subscription OR a concurrent in-flight reservation)", async () => {
    mockCreateAdminClient.mockReturnValue(makeAdminClient({ hasConflict: true }));

    const res = await POST(
      makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
    );

    expect(res.status).toBe(409);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("reserves the checkout slot via the atomic RPC before calling Stripe (closes the TOCTOU race a plain SELECT check has)", async () => {
    const client = makeAdminClient();
    mockCreateAdminClient.mockReturnValue(client);

    await POST(makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" }));

    expect(client.rpc).toHaveBeenCalledWith(
      "reserve_subscription_checkout_slot",
      expect.objectContaining({ p_tenant_id: "tenant-1", p_user_id: "user-1" })
    );
  });

  it("forwards attempt_id to the reservation RPC as p_attempt_id, so a retry of the same attempt can be recognized instead of rejected (Codex review round 2 finding)", async () => {
    const client = makeAdminClient();
    mockCreateAdminClient.mockReturnValue(client);

    await POST(makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" }));

    expect(client.rpc).toHaveBeenCalledWith(
      "reserve_subscription_checkout_slot",
      expect.objectContaining({ p_attempt_id: "attempt-abc" })
    );
  });

  it("releases the reservation when Stripe Checkout Session creation fails, instead of blocking the user for the full TTL", async () => {
    const client = makeAdminClient();
    mockCreateAdminClient.mockReturnValue(client);
    mockSessionsCreate.mockRejectedValue(new Error("stripe down"));

    const res = await POST(
      makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-abc" })
    );

    expect(res.status).toBe(500);
    expect(client.rpc).toHaveBeenCalledWith("release_subscription_checkout_slot", {
      p_reservation_id: "reservation-1",
    });
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
    expect(requestOptions.idempotencyKey).toMatch(KEY_PATTERN);
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

  it("falls back to a stable user+plan+payload key when attempt_id is omitted", async () => {
    const res = await POST(makeRequest({ membership_plan_id: "plan-1" }));

    expect(res.status).toBe(200);
    const [, requestOptions] = mockSessionsCreate.mock.calls[0];
    expect(requestOptions.idempotencyKey).toMatch(
      /^checkout:user-1:plan-1:[0-9a-f]{16}$/
    );
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

  describe("idempotency key covers the payload sent to Stripe (196)", () => {
    function withReferral(referralId: string, affiliateId = "aff-1") {
      mockGetAffiliateTracking.mockResolvedValue({
        affiliateCode: "CODE1",
        visitorToken: "visitor-1",
      });
      mockFindAffiliateByCode.mockResolvedValue({ id: affiliateId } as any);
      mockFindOrCreateReferral.mockResolvedValue({ id: referralId } as any);
    }

    const body = { membership_plan_id: "plan-1", attempt_id: "attempt-abc" };

    it("uses a different key when only the referral cookie changes within one attempt", async () => {
      await POST(makeRequest(body));

      withReferral("ref-1");
      await POST(makeRequest(body));

      const keys = sentKeys();
      expect(keys).toHaveLength(2);
      expect(keys[0]).not.toBe(keys[1]);
      expect(keys[1]).toMatch(KEY_PATTERN);
    });

    it("uses a different key when only the plan price_id changes", async () => {
      await POST(makeRequest(body));

      mockCreateAdminClient.mockReturnValue(
        makeAdminClient({
          plan: { data: { id: "plan-1", price_id: "price_456" }, error: null },
        })
      );
      await POST(makeRequest(body));

      const keys = sentKeys();
      expect(keys[0]).not.toBe(keys[1]);
    });

    it("uses the same key when the content is identical (a retry stays deduplicated)", async () => {
      withReferral("ref-1");
      await POST(makeRequest(body));
      await POST(makeRequest(body));

      const keys = sentKeys();
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    });

    it("uses the same key when only the metadata key order differs", async () => {
      await POST(makeRequest(body));
      const first = mockSessionsCreate.mock.calls[0][0];

      // Re-order metadata keys in the params the route sends on the second
      // call by building the same logical params in reverse order, then
      // hash both with the package helper the route uses.
      const { hashPayload } = await import("@/lib/payments");
      const reordered = {
        ...first,
        metadata: Object.fromEntries(Object.entries(first.metadata).reverse()),
      };
      expect(Object.keys(reordered.metadata)).not.toEqual(Object.keys(first.metadata));
      expect(hashPayload(reordered)).toBe(hashPayload(first));
      expect(sentKeys()[0].endsWith(`:${hashPayload(first)}`)).toBe(true);
    });

    it("hashes exactly the params object that is sent to Stripe", async () => {
      withReferral("ref-1");
      await POST(makeRequest(body));

      const [params, options] = mockSessionsCreate.mock.calls[0];
      const { hashPayload } = await import("@/lib/payments");
      expect(options.idempotencyKey).toBe(
        `checkout:user-1:plan-1:attempt-abc:${hashPayload(params)}`
      );
    });

    it("returns 409 checkout_retry_required and logs (without key or email) on a Stripe idempotency_error, and still releases the reservation", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const client = makeAdminClient();
      mockCreateAdminClient.mockReturnValue(client);
      mockSessionsCreate.mockRejectedValue(
        Object.assign(
          new Error(
            "Keys for idempotent requests can only be used with the same parameters"
          ),
          { type: "StripeIdempotencyError", rawType: "idempotency_error" }
        )
      );

      const res = await POST(makeRequest(body));

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "checkout_retry_required",
        message: "もう一度お試しください",
      });
      expect(client.rpc).toHaveBeenCalledWith("release_subscription_checkout_slot", {
        p_reservation_id: "reservation-1",
      });
      const logged = errorSpy.mock.calls.find(
        (c) => c[0] === "[billing/checkout] stripe idempotency_error"
      );
      expect(logged).toBeDefined();
      const dump = JSON.stringify(errorSpy.mock.calls);
      expect(dump).not.toContain("user@example.com");
      expect(dump).not.toContain("checkout:user-1");
      errorSpy.mockRestore();
    });

    it("keeps a generic Stripe failure as the 500 response", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockSessionsCreate.mockRejectedValue(new Error("stripe down"));
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(500);
    });
  });

  describe("double-subscription guard still holds when the key changes (196)", () => {
    /**
     * Stateful stand-in for the reserve/release SQL functions in
     * supabase/migrations/0019_subscription_checkout_reservations.sql
     * (one live reservation per tenant+user; same non-null attempt_id gets
     * the same reservation back; other attempts or an active subscription
     * raise SUBSCRIPTION_CONFLICT).
     */
    function makeStatefulClient(opts: { activeSubscription?: boolean } = {}) {
      let live: { id: string; attempt: string | null } | null = null;
      let n = 0;
      const rpc = vi.fn(async (fn: string, args: any) => {
        if (fn === "reserve_subscription_checkout_slot") {
          if (live) {
            if (args.p_attempt_id !== null && live.attempt === args.p_attempt_id) {
              return { data: live.id, error: null };
            }
            return { data: null, error: { message: "SUBSCRIPTION_CONFLICT" } };
          }
          if (opts.activeSubscription) {
            return { data: null, error: { message: "SUBSCRIPTION_CONFLICT" } };
          }
          live = { id: `reservation-${++n}`, attempt: args.p_attempt_id };
          return { data: live.id, error: null };
        }
        if (fn === "release_subscription_checkout_slot") {
          if (live && live.id === args.p_reservation_id) live = null;
          return { data: null, error: null };
        }
        throw new Error(`unexpected rpc: ${fn}`);
      });
      const base = makeAdminClient();
      return { from: base.from, rpc } as any;
    }

    const body = { membership_plan_id: "plan-1", attempt_id: "attempt-abc" };

    it("a different attempt is rejected with 409 while a reservation is live, even if its payload (and so its key) differs", async () => {
      mockCreateAdminClient.mockReturnValue(makeStatefulClient());
      expect((await POST(makeRequest(body))).status).toBe(200);

      mockGetAffiliateTracking.mockResolvedValue({
        affiliateCode: "CODE1",
        visitorToken: "visitor-1",
      });
      mockFindAffiliateByCode.mockResolvedValue({ id: "aff-1" } as any);
      mockFindOrCreateReferral.mockResolvedValue({ id: "ref-1" } as any);

      const res = await POST(
        makeRequest({ membership_plan_id: "plan-1", attempt_id: "attempt-xyz" })
      );
      expect(res.status).toBe(409);
      expect(mockSessionsCreate).toHaveBeenCalledTimes(1);
    });

    it("rejects with 409 before Stripe when an active subscription exists", async () => {
      mockCreateAdminClient.mockReturnValue(
        makeStatefulClient({ activeSubscription: true })
      );
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(409);
      expect(mockSessionsCreate).not.toHaveBeenCalled();
    });

    it("KNOWN GAP (documented, not fixed here): the same attempt with a changed payload shares one reservation and can create a second Checkout Session", async () => {
      mockCreateAdminClient.mockReturnValue(makeStatefulClient());
      await POST(makeRequest(body));

      mockGetAffiliateTracking.mockResolvedValue({
        affiliateCode: "CODE1",
        visitorToken: "visitor-1",
      });
      mockFindAffiliateByCode.mockResolvedValue({ id: "aff-1" } as any);
      mockFindOrCreateReferral.mockResolvedValue({ id: "ref-1" } as any);
      const res = await POST(makeRequest(body));

      // 0019 treats the same attempt_id as a retry and hands back the same
      // reservation, so the reservation does not stop this second session.
      expect(res.status).toBe(200);
      expect(mockSessionsCreate).toHaveBeenCalledTimes(2);
      const keys = sentKeys();
      expect(keys[0]).not.toBe(keys[1]);
    });
  });
});
