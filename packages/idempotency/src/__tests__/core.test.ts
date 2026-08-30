import { describe, it, expect, vi } from "vitest";
import { createIdempotency } from "../core";
import { InMemoryIdempotencyStore } from "../store";
import { IdempotencyClaimLostError, IdempotencyInProgressError } from "../types";
import type { ClaimOutcome, IdempotencyStore } from "../types";

/** A fully-scriptable fake `IdempotencyStore` for exercising the
 * claim-loss paths (heartbeat-detected loss, `complete()` returning
 * false, `complete()` throwing) that are awkward to trigger through
 * `InMemoryIdempotencyStore`'s real timing. */
function makeScriptedStore(overrides: Partial<IdempotencyStore> = {}): IdempotencyStore {
  return {
    claim: overrides.claim ?? (async () => ({ kind: "own", token: "token-1" }) as ClaimOutcome),
    complete: overrides.complete ?? (async () => true),
    release: overrides.release ?? (async () => {}),
    extend: overrides.extend ?? (async () => true),
  };
}

describe("withIdempotency", () => {
  it("runs fn exactly once for repeated calls with the same key", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    const sideEffect = vi.fn(async () => ({ orderId: "order-1" }));

    const first = await idempotency.withIdempotency("key-1", sideEffect);
    // Second call happens only after the first has fully completed
    // (sequential retry) — must replay, not re-run.
    const second = await idempotency.withIdempotency("key-1", sideEffect);

    expect(sideEffect).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ orderId: "order-1" });
    expect(second).toEqual({ orderId: "order-1" });
  });

  it("throws IdempotencyInProgressError for a concurrent call with the same key", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstCall = idempotency.withIdempotency("key-1", async () => {
      await gate;
      return "done";
    });

    // Give the first call a chance to claim before the second one starts.
    await new Promise((r) => setTimeout(r, 0));

    await expect(idempotency.withIdempotency("key-1", async () => "should-not-run")).rejects.toBeInstanceOf(
      IdempotencyInProgressError
    );

    releaseFirst();
    await expect(firstCall).resolves.toBe("done");
  });

  it("releases the claim on failure so a genuine retry can succeed", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    let attempt = 0;
    const flaky = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient failure");
      return "ok-on-retry";
    };

    await expect(idempotency.withIdempotency("key-1", flaky)).rejects.toThrow("transient failure");
    const result = await idempotency.withIdempotency("key-1", flaky);

    expect(result).toBe("ok-on-retry");
    expect(attempt).toBe(2);
  });

  it("rejects an empty key", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    await expect(idempotency.withIdempotency("", async () => "x")).rejects.toThrow(/non-empty key/);
  });

  it("different scopes with the same key do not interfere (tenant isolation)", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    const fnA = vi.fn(async () => "tenant-a-result");
    const fnB = vi.fn(async () => "tenant-b-result");

    const a = await idempotency.withIdempotency("shared-key", fnA, { scope: "tenant-a" });
    const b = await idempotency.withIdempotency("shared-key", fnB, { scope: "tenant-b" });

    expect(a).toBe("tenant-a-result");
    expect(b).toBe("tenant-b-result");
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
  });

  describe("claim loss (fn succeeded but ownership could not be durably recorded)", () => {
    it("throws IdempotencyClaimLostError (not a silent success, not a release) when complete() reports it did not apply", async () => {
      const store = makeScriptedStore({ complete: async () => false });
      const idempotency = createIdempotency(store);

      const err = await idempotency
        .withIdempotency("key-1", async () => ({ orderId: "order-1" }))
        .catch((e) => e);

      expect(err).toBeInstanceOf(IdempotencyClaimLostError);
      expect((err as IdempotencyClaimLostError).result).toEqual({ orderId: "order-1" });
    });

    it("throws IdempotencyClaimLostError (with the DB error as .cause) when complete() itself throws", async () => {
      const dbError = new Error("connection reset");
      const store = makeScriptedStore({
        complete: async () => {
          throw dbError;
        },
      });
      const idempotency = createIdempotency(store);

      const err = await idempotency
        .withIdempotency("key-1", async () => "the-result")
        .catch((e) => e);

      expect(err).toBeInstanceOf(IdempotencyClaimLostError);
      expect((err as IdempotencyClaimLostError).result).toBe("the-result");
      expect((err as Error).cause).toBe(dbError);
    });

    it("does NOT release the claim when complete() fails (a retry must not re-run the already-succeeded fn)", async () => {
      const release = vi.fn(async () => {});
      const store = makeScriptedStore({ complete: async () => false, release });
      const idempotency = createIdempotency(store);

      await idempotency.withIdempotency("key-1", async () => "result").catch(() => {});

      expect(release).not.toHaveBeenCalled();
    });

    it("throws IdempotencyClaimLostError when the heartbeat detects the claim was reclaimed mid-flight, even though complete() itself would report success", async () => {
      vi.useFakeTimers();
      try {
        let extendCalls = 0;
        const store = makeScriptedStore({
          extend: async () => {
            extendCalls += 1;
            return false; // every heartbeat tick reports loss
          },
          complete: async () => true, // would otherwise look like a clean success
        });
        const idempotency = createIdempotency(store);

        const promise = idempotency.withIdempotency(
          "key-1",
          async () => {
            await vi.advanceTimersByTimeAsync(400); // outlives one heartbeat tick
            return "result";
          },
          { ttlMs: 300 } // heartbeatIntervalMs defaults to 100
        );

        const err = await promise.catch((e) => e);
        expect(err).toBeInstanceOf(IdempotencyClaimLostError);
        expect(extendCalls).toBeGreaterThan(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("withStripeCall", () => {
  it("propagates the same idempotency key to the wrapped Stripe call", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    const stripeCreate = vi.fn(async (idempotencyKey: string) => ({
      id: "sess_1",
      idempotencyKeyUsed: idempotencyKey,
    }));

    const result = await idempotency.withStripeCall("checkout:user-1:plan-a", stripeCreate);

    expect(stripeCreate).toHaveBeenCalledWith("checkout:user-1:plan-a");
    expect(result.idempotencyKeyUsed).toBe("checkout:user-1:plan-a");
  });

  it("does not call the Stripe callback twice for a repeated key (dedupes the underlying side effect)", async () => {
    const idempotency = createIdempotency(new InMemoryIdempotencyStore());
    const stripeCreate = vi.fn(async (idempotencyKey: string) => ({ id: "sess_1", idempotencyKey }));

    await idempotency.withStripeCall("checkout:user-1:plan-a", stripeCreate);
    const replay = await idempotency.withStripeCall("checkout:user-1:plan-a", stripeCreate);

    expect(stripeCreate).toHaveBeenCalledTimes(1);
    expect(replay).toEqual({ id: "sess_1", idempotencyKey: "checkout:user-1:plan-a" });
  });
});
