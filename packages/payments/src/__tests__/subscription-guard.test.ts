import { describe, it, expect, vi } from "vitest";
import {
  assertNoConflictingActiveSubscription,
  SubscriptionConflictError,
  CONFLICTING_SUBSCRIPTION_STATUSES,
  type SubscriptionConflictCheckClient,
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
