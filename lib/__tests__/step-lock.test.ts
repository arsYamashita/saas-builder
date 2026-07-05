import { describe, it, expect, beforeEach } from "vitest";
import { acquireStepLock, releaseStepLock } from "../step-lock";

// No UPSTASH_REDIS_REST_URL/TOKEN is set in the test environment, so these
// tests exercise the in-memory fallback path (mirrors lib/__tests__/rate-limit.test.ts).
// See [[redis_nx_lock_ttl_too_short]].

describe("step lock", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("acquires a free lock and returns a token", async () => {
    const key = `steplock-test:${Math.random()}`;
    const token = await acquireStepLock(key);
    expect(token).not.toBeNull();
  });

  it("refuses a second acquire while the lock is held", async () => {
    const key = `steplock-test:${Math.random()}`;
    const token1 = await acquireStepLock(key);
    expect(token1).not.toBeNull();

    const token2 = await acquireStepLock(key);
    expect(token2).toBeNull();
  });

  it("allows re-acquiring after release", async () => {
    const key = `steplock-test:${Math.random()}`;
    const token1 = await acquireStepLock(key);
    expect(token1).not.toBeNull();

    await releaseStepLock(key, token1!);

    const token2 = await acquireStepLock(key);
    expect(token2).not.toBeNull();
  });

  it("allows re-acquiring after the TTL expires, even without release", async () => {
    const key = `steplock-test:${Math.random()}`;
    const token1 = await acquireStepLock(key, 10);
    expect(token1).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const token2 = await acquireStepLock(key, 10);
    expect(token2).not.toBeNull();
  });

  it("tracks locks independently per key", async () => {
    const keyA = `steplock-test:${Math.random()}`;
    const keyB = `steplock-test:${Math.random()}`;

    await acquireStepLock(keyA);
    // A different run/step key must not be blocked by keyA's lock.
    const tokenB = await acquireStepLock(keyB);
    expect(tokenB).not.toBeNull();
  });
});
