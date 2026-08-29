import { describe, it, expect, vi } from "vitest";
import { createIdempotency } from "../core";
import { InMemoryIdempotencyStore } from "../store";
import { IdempotencyInProgressError } from "../types";

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
