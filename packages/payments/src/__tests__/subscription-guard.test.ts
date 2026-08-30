import { describe, it, expect, vi } from "vitest";
import {
  assertNoConflictingActiveSubscription,
  reserveSubscriptionCheckoutSlot,
  releaseSubscriptionCheckoutSlot,
  releaseSubscriptionCheckoutSlotForUser,
  SubscriptionConflictError,
  CONFLICTING_SUBSCRIPTION_STATUSES,
  DEFAULT_CHECKOUT_RESERVATION_TTL_SECONDS,
  type SubscriptionConflictCheckClient,
  type SubscriptionReservationClient,
} from "../subscription-guard";

// See [[stripe_recurring_subscription_missing_conflict_guard]].

function makeClient(result: {
  data: { id: string; status: string } | null;
  error: { message: string } | null;
}) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const inFn = vi.fn().mockReturnValue({ maybeSingle });
  const eq2 = vi.fn().mockReturnValue({ in: inFn });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  const from = vi.fn().mockReturnValue({ select });

  return {
    client: { from } as unknown as SubscriptionConflictCheckClient,
    from,
    select,
    eq1,
    eq2,
    inFn,
    maybeSingle,
  };
}

describe("assertNoConflictingActiveSubscription", () => {
  it("resolves silently when no conflicting subscription exists", async () => {
    const { client, from, eq1, eq2, inFn } = makeClient({ data: null, error: null });

    await expect(
      assertNoConflictingActiveSubscription(client, {
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).resolves.toBeUndefined();

    expect(from).toHaveBeenCalledWith("subscriptions");
    expect(eq1).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(eq2).toHaveBeenCalledWith("user_id", "user-1");
    expect(inFn).toHaveBeenCalledWith("status", CONFLICTING_SUBSCRIPTION_STATUSES);
  });

  it("throws SubscriptionConflictError when an active subscription already exists", async () => {
    const { client } = makeClient({
      data: { id: "sub-row-1", status: "active" },
      error: null,
    });

    await expect(
      assertNoConflictingActiveSubscription(client, {
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).rejects.toThrow(SubscriptionConflictError);
  });

  it("throws SubscriptionConflictError when a trialing subscription already exists", async () => {
    const { client } = makeClient({
      data: { id: "sub-row-2", status: "trialing" },
      error: null,
    });

    await expect(
      assertNoConflictingActiveSubscription(client, {
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).rejects.toThrow(SubscriptionConflictError);
  });

  it("surfaces the existing subscription id/status on the error for logging", async () => {
    const { client } = makeClient({
      data: { id: "sub-row-3", status: "past_due" },
      error: null,
    });

    try {
      await assertNoConflictingActiveSubscription(client, {
        tenantId: "tenant-1",
        userId: "user-1",
      });
      expect.fail("expected assertNoConflictingActiveSubscription to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(SubscriptionConflictError);
      const conflictErr = err as SubscriptionConflictError;
      expect(conflictErr.existingSubscriptionId).toBe("sub-row-3");
      expect(conflictErr.existingStatus).toBe("past_due");
    }
  });

  it("throws a plain Error (not SubscriptionConflictError) when the DB query itself fails", async () => {
    const { client } = makeClient({
      data: null,
      error: { message: "connection reset" },
    });

    await expect(
      assertNoConflictingActiveSubscription(client, {
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).rejects.toThrow(/connection reset/);

    await expect(
      assertNoConflictingActiveSubscription(client, {
        tenantId: "tenant-1",
        userId: "user-1",
      })
    ).rejects.not.toBeInstanceOf(SubscriptionConflictError);
  });
});

// See the 2026-08-30 Codex review of PR #60 (instruction 095): a plain
// SELECT-then-create check has a TOCTOU race between concurrent callers.
// These two functions close it with a DB-level atomic reservation instead.
describe("reserveSubscriptionCheckoutSlot / releaseSubscriptionCheckoutSlot", () => {
  function makeRpcClient(result: { data: string | null; error: { message: string } | null }) {
    const rpc = vi.fn().mockResolvedValue(result);
    return { client: { rpc } as unknown as SubscriptionReservationClient, rpc };
  }

  it("returns the reservation id on success, using the default TTL", async () => {
    const { client, rpc } = makeRpcClient({ data: "reservation-1", error: null });

    const result = await reserveSubscriptionCheckoutSlot(client, {
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(result).toEqual({ reservationId: "reservation-1" });
    expect(rpc).toHaveBeenCalledWith("reserve_subscription_checkout_slot", {
      p_tenant_id: "tenant-1",
      p_user_id: "user-1",
      p_attempt_id: null,
      p_ttl_seconds: DEFAULT_CHECKOUT_RESERVATION_TTL_SECONDS,
    });
  });

  it("passes attemptId through as p_attempt_id when provided", async () => {
    const { client, rpc } = makeRpcClient({ data: "reservation-1", error: null });

    await reserveSubscriptionCheckoutSlot(client, {
      tenantId: "tenant-1",
      userId: "user-1",
      attemptId: "attempt-abc",
    });

    expect(rpc).toHaveBeenCalledWith(
      "reserve_subscription_checkout_slot",
      expect.objectContaining({ p_attempt_id: "attempt-abc" })
    );
  });

  it("passes a custom ttlSeconds through to the RPC", async () => {
    const { client, rpc } = makeRpcClient({ data: "reservation-1", error: null });

    await reserveSubscriptionCheckoutSlot(client, {
      tenantId: "tenant-1",
      userId: "user-1",
      ttlSeconds: 60,
    });

    expect(rpc).toHaveBeenCalledWith(
      "reserve_subscription_checkout_slot",
      expect.objectContaining({ p_ttl_seconds: 60 })
    );
  });

  it("throws SubscriptionConflictError when the DB function raises SUBSCRIPTION_CONFLICT (existing subscription OR a concurrent in-flight reservation)", async () => {
    const { client } = makeRpcClient({
      data: null,
      error: { message: 'SUBSCRIPTION_CONFLICT' },
    });

    await expect(
      reserveSubscriptionCheckoutSlot(client, { tenantId: "tenant-1", userId: "user-1" })
    ).rejects.toThrow(SubscriptionConflictError);
  });

  it("throws a plain Error (not SubscriptionConflictError) for any other RPC failure", async () => {
    const { client } = makeRpcClient({
      data: null,
      error: { message: "connection reset" },
    });

    await expect(
      reserveSubscriptionCheckoutSlot(client, { tenantId: "tenant-1", userId: "user-1" })
    ).rejects.toThrow(/connection reset/);
    await expect(
      reserveSubscriptionCheckoutSlot(client, { tenantId: "tenant-1", userId: "user-1" })
    ).rejects.not.toBeInstanceOf(SubscriptionConflictError);
  });

  it("releaseSubscriptionCheckoutSlot calls the release RPC with the reservation id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc } as unknown as SubscriptionReservationClient;

    const result = await releaseSubscriptionCheckoutSlot(client, "reservation-1");

    expect(result).toEqual({ released: true });
    expect(rpc).toHaveBeenCalledWith("release_subscription_checkout_slot", {
      p_reservation_id: "reservation-1",
    });
  });

  it("releaseSubscriptionCheckoutSlot reports failure without throwing (best-effort — TTL is the fallback)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "timeout" } });
    const client = { rpc } as unknown as SubscriptionReservationClient;

    const result = await releaseSubscriptionCheckoutSlot(client, "reservation-1");

    expect(result).toEqual({ released: false, error: "timeout" });
  });

  it("releaseSubscriptionCheckoutSlotForUser calls the by-user release RPC (used by the webhook handler, which never has the reservation id)", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = { rpc } as unknown as SubscriptionReservationClient;

    const result = await releaseSubscriptionCheckoutSlotForUser(client, {
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(result).toEqual({ released: true });
    expect(rpc).toHaveBeenCalledWith("release_subscription_checkout_slot_for_user", {
      p_tenant_id: "tenant-1",
      p_user_id: "user-1",
    });
  });
});
