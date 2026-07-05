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

  // Codex P2 regression: release must be compare-and-delete, never a blind
  // delete — a stale token must not free a lock it no longer owns.

  it("does not release the lock when the token does not match", async () => {
    const key = `steplock-test:${Math.random()}`;
    const token = await acquireStepLock(key);
    expect(token).not.toBeNull();

    await releaseStepLock(key, "not-the-owner-token");

    // Lock must still be held by the original owner.
    const second = await acquireStepLock(key);
    expect(second).toBeNull();

    // The real owner can still release it afterwards.
    await releaseStepLock(key, token!);
    const third = await acquireStepLock(key);
    expect(third).not.toBeNull();
  });

  it("a stale token from an expired lock cannot release the new owner's lock", async () => {
    const key = `steplock-test:${Math.random()}`;

    // First owner acquires with a short TTL and never releases.
    const staleToken = await acquireStepLock(key, 10);
    expect(staleToken).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Second owner acquires after expiry.
    const newToken = await acquireStepLock(key, 60_000);
    expect(newToken).not.toBeNull();

    // The first owner's delayed release (exactly the GET-expire-DEL race)
    // must be a no-op against the new owner's lock.
    await releaseStepLock(key, staleToken!);

    const intruder = await acquireStepLock(key);
    expect(intruder).toBeNull();

    // Cleanup: the actual owner releases normally.
    await releaseStepLock(key, newToken!);
  });
});
