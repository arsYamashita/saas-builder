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

  it("produces the same key for the same parts within the same time bucket", () => {
    vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
    const a = buildIdempotencyKey(["user-1", "plan-a"]);

    vi.setSystemTime(new Date("2026-07-03T00:00:30.000Z")); // +30s, same 60s bucket
    const b = buildIdempotencyKey(["user-1", "plan-a"]);

    expect(a).toBe(b);
  });

  it("produces a different key once the time bucket rolls over", () => {
    vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
    const a = buildIdempotencyKey(["user-1", "plan-a"]);

    vi.setSystemTime(new Date("2026-07-03T00:01:01.000Z")); // +61s, next 60s bucket
    const b = buildIdempotencyKey(["user-1", "plan-a"]);

    expect(a).not.toBe(b);
  });

  it("produces different keys for different scoping parts", () => {
    vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));

    const a = buildIdempotencyKey(["user-1", "plan-a"]);
    const b = buildIdempotencyKey(["user-2", "plan-a"]);
    const c = buildIdempotencyKey(["user-1", "plan-b"]);

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("respects a custom bucket size", () => {
    vi.setSystemTime(new Date("2026-07-03T00:00:00.000Z"));
    const a = buildIdempotencyKey(["user-1"], 1000);

    vi.setSystemTime(new Date("2026-07-03T00:00:01.500Z")); // +1.5s, next 1s bucket
    const b = buildIdempotencyKey(["user-1"], 1000);

    expect(a).not.toBe(b);
  });

  it("throws when given no non-empty parts", () => {
    expect(() => buildIdempotencyKey([])).toThrow();
    expect(() => buildIdempotencyKey(["", "  "])).toThrow();
  });

  it("throws on a non-positive bucketMs", () => {
    expect(() => buildIdempotencyKey(["user-1"], 0)).toThrow();
    expect(() => buildIdempotencyKey(["user-1"], -5)).toThrow();
  });
});
