import { describe, it, expect, vi } from "vitest";
import { createRateLimiter, type BucketLimiter } from "../rate-limit";

// These tests exercise createRateLimiter() directly with
// getBucketLimiter returning null (no Redis-backed limiter configured),
// which drives the in-memory fallback path — the same contract every
// generate-* route in saas-builder relies on via lib/rate-limit.ts.
// See [[saas_builder_ai_endpoint_no_rate_limit]].

const noBuckets = {};

describe("createRateLimiter — in-memory fallback (fail-open, default)", () => {
  it("allows requests up to the limit within the window", async () => {
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
    });
    const key = `test-user:${Math.random()}`;
    expect(await rl.check(key, 3, 60_000)).toBe(true);
    expect(await rl.check(key, 3, 60_000)).toBe(true);
    expect(await rl.check(key, 3, 60_000)).toBe(true);
  });

  it("denies requests beyond the limit within the window", async () => {
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
    });
    const key = `test-user:${Math.random()}`;
    await rl.check(key, 2, 60_000);
    await rl.check(key, 2, 60_000);

    expect(await rl.check(key, 2, 60_000)).toBe(false);
  });

  it("tracks limits independently per key", async () => {
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
    });
    const keyA = `generate:${Math.random()}`;
    const keyB = `generate:${Math.random()}`;

    await rl.check(keyA, 1, 60_000);
    expect(await rl.check(keyA, 1, 60_000)).toBe(false);
    // A different user's key must not be affected by keyA's usage.
    expect(await rl.check(keyB, 1, 60_000)).toBe(true);
  });

  it("resets the count after the window elapses", async () => {
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
    });
    const key = `test-user:${Math.random()}`;
    expect(await rl.check(key, 1, 20)).toBe(true);
    expect(await rl.check(key, 1, 20)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(await rl.check(key, 1, 20)).toBe(true);
  });

  it("logs a warning exactly once when no limiter is available", async () => {
    const warn = vi.fn();
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
      logger: { warn },
    });

    await rl.check(`a:${Math.random()}`, 1, 60_000);
    await rl.check(`b:${Math.random()}`, 1, 60_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/in-memory/i);
  });
});

describe("createRateLimiter — onUnavailable: fail-closed", () => {
  it("denies every request instead of falling back to memory", async () => {
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
      onUnavailable: "fail-closed",
    });
    const key = `login:${Math.random()}`;

    expect(await rl.check(key, 5, 60_000)).toBe(false);
    expect(await rl.check(key, 5, 60_000)).toBe(false);
  });

  it("logs a warning that names the fail-closed policy", async () => {
    const warn = vi.fn();
    const rl = createRateLimiter({
      buckets: noBuckets,
      getBucketLimiter: () => null,
      onUnavailable: "fail-closed",
      logger: { warn },
    });

    await rl.check(`login:${Math.random()}`, 5, 60_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/fail.?closed/i);
  });
});

describe("createRateLimiter — Redis-backed bucket (dependency-injected)", () => {
  function fakeLimiter(sequence: boolean[]): BucketLimiter {
    let i = 0;
    return {
      limit: vi.fn(async () => ({
        success: sequence[Math.min(i++, sequence.length - 1)],
      })),
    };
  }

  it("defers to the injected limiter for a configured bucket, not the local map", async () => {
    const limiter = fakeLimiter([true, true, false]);
    const rl = createRateLimiter({
      buckets: { login: { limit: 5, window: "60 s", prefix: "rl:login" } },
      getBucketLimiter: () => limiter,
    });

    expect(await rl.check("login:1.2.3.4", 5, 60_000)).toBe(true);
    expect(await rl.check("login:1.2.3.4", 5, 60_000)).toBe(true);
    expect(await rl.check("login:1.2.3.4", 5, 60_000)).toBe(false);
    expect(limiter.limit).toHaveBeenCalledTimes(3);
  });

  it("only resolves a bucket's limiter once (cached across calls)", async () => {
    const limiter = fakeLimiter([true, true, true]);
    const getBucketLimiter = vi.fn(() => limiter);
    const rl = createRateLimiter({
      buckets: { login: { limit: 5, window: "60 s", prefix: "rl:login" } },
      getBucketLimiter,
    });

    await rl.check("login:1.2.3.4", 5, 60_000);
    await rl.check("login:5.6.7.8", 5, 60_000);

    expect(getBucketLimiter).toHaveBeenCalledTimes(1);
  });

  it("falls back to memory for keys whose prefix matches no configured bucket", async () => {
    const rl = createRateLimiter({
      buckets: { login: { limit: 5, window: "60 s", prefix: "rl:login" } },
      getBucketLimiter: () => {
        throw new Error("should not be called for an unconfigured bucket");
      },
    });

    const key = `unknown-bucket:${Math.random()}`;
    expect(await rl.check(key, 2, 60_000)).toBe(true);
    expect(await rl.check(key, 2, 60_000)).toBe(true);
    expect(await rl.check(key, 2, 60_000)).toBe(false);
  });
});
