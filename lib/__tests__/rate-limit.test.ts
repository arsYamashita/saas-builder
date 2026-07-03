import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "../rate-limit";

// No UPSTASH_REDIS_REST_URL/TOKEN is set in the test environment, so
// rateLimit() exercises the in-memory fallback path. This still verifies
// the public contract (allow up to `limit` requests per window, then
// deny) that every generate-* route now relies on.
// See [[saas_builder_ai_endpoint_no_rate_limit]].

describe("rateLimit", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows requests up to the limit within the window", async () => {
    const key = `test-user:${Math.random()}`;
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
    expect(await rateLimit(key, 3, 60_000)).toBe(true);
  });

  it("denies requests beyond the limit within the window", async () => {
    const key = `test-user:${Math.random()}`;
    await rateLimit(key, 2, 60_000);
    await rateLimit(key, 2, 60_000);

    expect(await rateLimit(key, 2, 60_000)).toBe(false);
  });

  it("tracks limits independently per key", async () => {
    const keyA = `generate:${Math.random()}`;
    const keyB = `generate:${Math.random()}`;

    await rateLimit(keyA, 1, 60_000);
    expect(await rateLimit(keyA, 1, 60_000)).toBe(false);
    // A different user's key must not be affected by keyA's usage.
    expect(await rateLimit(keyB, 1, 60_000)).toBe(true);
  });

  it("resets the count after the window elapses", async () => {
    const key = `test-user:${Math.random()}`;
    expect(await rateLimit(key, 1, 20)).toBe(true);
    expect(await rateLimit(key, 1, 20)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(await rateLimit(key, 1, 20)).toBe(true);
  });
});
