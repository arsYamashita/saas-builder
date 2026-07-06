import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildIdempotencyKey } from "../idempotency";

// See [[stripe_checkout_idempotency_key_missing]] — this helper exists so
// every Stripe mutation call site can pass a stable idempotencyKey instead
// of re-deriving one (or forgetting to) per route.

describe("buildIdempotencyKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is a pure function of its parts — stable across time", () => {
    vi.setSystemTime(new Date("2026-07-03T12:00:59.000Z"));
    const a = buildIdempotencyKey(["checkout", "user-1", "plan-a", "attempt-1"]);

    vi.setSystemTime(new Date("2026-07-03T12:01:01.000Z")); // crosses minute boundary
    const b = buildIdempotencyKey(["checkout", "user-1", "plan-a", "attempt-1"]);

    vi.setSystemTime(new Date("2026-07-04T09:30:00.000Z")); // much later
    const c = buildIdempotencyKey(["checkout", "user-1", "plan-a", "attempt-1"]);

    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it("produces different keys for different scoping parts", () => {
    const a = buildIdempotencyKey(["checkout", "user-1", "plan-a", "attempt-1"]);
    const b = buildIdempotencyKey(["checkout", "user-2", "plan-a", "attempt-1"]);
    const c = buildIdempotencyKey(["checkout", "user-1", "plan-b", "attempt-1"]);
    const d = buildIdempotencyKey(["checkout", "user-1", "plan-a", "attempt-2"]);

    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  it("drops empty parts (e.g. an omitted attempt id) without failing", () => {
    expect(buildIdempotencyKey(["checkout", "user-1", "plan-a", ""])).toBe(
      "checkout:user-1:plan-a"
    );
  });

  it("joins parts deterministically in order", () => {
    expect(buildIdempotencyKey(["checkout", "u1", "p1", "a1"])).toBe(
      "checkout:u1:p1:a1"
    );
  });

  it("throws when given no non-empty parts", () => {
    expect(() => buildIdempotencyKey([])).toThrow();
    expect(() => buildIdempotencyKey(["", "  "])).toThrow();
  });
});
