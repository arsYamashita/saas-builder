import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { acquireLock, releaseLock, extendLock, withLock, LockContentionError, LockLostError } from "../lock";
import type { RedisLike } from "../lock";

/** A minimal in-memory RedisLike double, independent of the module's own
 * local fallback, so these tests exercise the exported primitives against
 * a controllable clock. */
function makeFakeRedis(): RedisLike {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    async set(key, value, opts) {
      const now = Date.now();
      const entry = store.get(key);
      if (entry && entry.expiresAt > now) return null;
      store.set(key, { value, expiresAt: now + opts.px });
      return "OK";
    },
    async eval(script, keys, args) {
      const [key] = keys;
      const entry = store.get(key);
      const now = Date.now();
      const isLive = entry && entry.expiresAt > now;
      // RELEASE_SCRIPT and EXTEND_SCRIPT both start by comparing GET to ARGV[1].
      if (script.includes("del")) {
        if (isLive && entry!.value === args[0]) {
          store.delete(key);
          return 1;
        }
        return 0;
      }
      if (script.includes("pexpire")) {
        if (isLive && entry!.value === args[0]) {
          entry!.expiresAt = now + Number(args[1]);
          return 1;
        }
        return 0;
      }
      return 0;
    },
  };
}

describe("acquireLock / releaseLock / extendLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("acquires an unheld key and returns a token", async () => {
    const redis = makeFakeRedis();
    const token = await acquireLock(redis, "lock:1", 10_000);
    expect(token).toBeTruthy();
  });

  it("fails to acquire an already-held key", async () => {
    const redis = makeFakeRedis();
    await acquireLock(redis, "lock:1", 10_000);
    const second = await acquireLock(redis, "lock:1", 10_000);
    expect(second).toBeNull();
  });

  it("succeeds acquiring again after the TTL naturally expires", async () => {
    const redis = makeFakeRedis();
    await acquireLock(redis, "lock:1", 1_000);
    vi.advanceTimersByTime(1_001);
    const second = await acquireLock(redis, "lock:1", 10_000);
    expect(second).toBeTruthy();
  });

  it("releaseLock is a compare-and-delete: a stale token cannot release the new owner's lock", async () => {
    const redis = makeFakeRedis();
    const staleToken = await acquireLock(redis, "lock:1", 1_000);
    vi.advanceTimersByTime(1_001);
    const freshToken = await acquireLock(redis, "lock:1", 10_000);

    await releaseLock(redis, "lock:1", staleToken!);

    // The new owner's lock must still be held — released only by its own token.
    const thirdAttempt = await acquireLock(redis, "lock:1", 10_000);
    expect(thirdAttempt).toBeNull();

    await releaseLock(redis, "lock:1", freshToken!);
    const fourthAttempt = await acquireLock(redis, "lock:1", 10_000);
    expect(fourthAttempt).toBeTruthy();
  });

  it("extendLock renews the TTL only for the current token holder", async () => {
    const redis = makeFakeRedis();
    const token = await acquireLock(redis, "lock:1", 1_000);

    vi.advanceTimersByTime(900);
    const extended = await extendLock(redis, "lock:1", token!, 5_000);
    expect(extended).toBe(true);

    // Without the extension this would have expired at +1000ms; the
    // extension pushed expiry to (now=900) + 5000 = 5900ms.
    vi.advanceTimersByTime(1_500); // total elapsed: 2400ms, past the original 1000ms TTL
    const stillHeld = await acquireLock(redis, "lock:1", 10_000);
    expect(stillHeld).toBeNull(); // someone else still can't acquire it
  });

  it("extendLock refuses to renew for a token that no longer owns the key", async () => {
    const redis = makeFakeRedis();
    const staleToken = await acquireLock(redis, "lock:1", 1_000);
    vi.advanceTimersByTime(1_001);
    await acquireLock(redis, "lock:1", 10_000); // someone else reclaims

    const extended = await extendLock(redis, "lock:1", staleToken!, 5_000);
    expect(extended).toBe(false);
  });
});

describe("withLock", () => {
  it("runs fn and releases the lock afterward", async () => {
    const redis = makeFakeRedis();
    const result = await withLock("job:1", async () => "done", { redis, ttlMs: 5_000 });
    expect(result).toBe("done");

    // Lock must be released — a fresh acquire should succeed immediately.
    const token = await acquireLock(redis, "job:1", 5_000);
    expect(token).toBeTruthy();
  });

  it("throws LockContentionError when the lock is already held", async () => {
    const redis = makeFakeRedis();
    await acquireLock(redis, "job:1", 60_000);

    await expect(withLock("job:1", async () => "x", { redis, ttlMs: 5_000 })).rejects.toBeInstanceOf(
      LockContentionError
    );
  });

  it("releases the lock even when fn throws", async () => {
    const redis = makeFakeRedis();
    await expect(
      withLock(
        "job:1",
        async () => {
          throw new Error("boom");
        },
        { redis, ttlMs: 5_000 }
      )
    ).rejects.toThrow("boom");

    const token = await acquireLock(redis, "job:1", 5_000);
    expect(token).toBeTruthy();
  });

  it("heartbeat keeps a long-running fn's lock alive past the initial ttlMs (the redis_nx_lock_ttl_too_short fix)", async () => {
    vi.useFakeTimers();
    try {
      const redis = makeFakeRedis();
      let secondAcquireResult: string | null | undefined;

      const longRunning = withLock(
        "job:1",
        async () => {
          // Simulate work that outlives the initial 1000ms TTL guess.
          // Advance past two heartbeat intervals (default ttlMs/3 ≈ 333ms)
          // without extendLock, the original TTL would have expired at
          // +1000ms and a second caller could have acquired it.
          await vi.advanceTimersByTimeAsync(2_500);
          secondAcquireResult = await acquireLock(redis, "job:1", 5_000);
          return "finished";
        },
        { redis, ttlMs: 1_000 }
      );

      const result = await longRunning;

      expect(result).toBe("finished");
      // While fn was still running (2.5s in, past the original 1s TTL),
      // the heartbeat must have kept the lock held.
      expect(secondAcquireResult).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws LockLostError (not a silent success) when the heartbeat detects the lock was stolen mid-flight", async () => {
    vi.useFakeTimers();
    try {
      const redis: RedisLike = {
        set: async () => "OK", // acquireLock always "succeeds" once
        eval: async () => 0, // every compare-and-extend / release reports "not owner" (lost)
      };

      const promise = withLock(
        "job:1",
        async () => {
          await vi.advanceTimersByTimeAsync(400); // outlives the first heartbeat tick
          return "finished";
        },
        { redis, ttlMs: 300 } // heartbeatIntervalMs defaults to 100
      );

      const err = await promise.catch((e) => e);
      expect(err).toBeInstanceOf(LockLostError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fires fn's AbortSignal the moment the heartbeat detects lock loss", async () => {
    vi.useFakeTimers();
    try {
      let sawAbort = false;
      const redis: RedisLike = {
        set: async () => "OK",
        eval: async () => 0, // lock "lost" on the very first heartbeat tick
      };

      const promise = withLock(
        "job:1",
        async (signal) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
          });
          await vi.advanceTimersByTimeAsync(400);
          return "finished";
        },
        { redis, ttlMs: 300 }
      );

      await promise.catch(() => {});
      expect(sawAbort).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT throw LockLostError when the lock is held for the whole run (no false positives)", async () => {
    const redis = makeFakeRedis();
    const result = await withLock("job:1", async () => "clean-run", { redis, ttlMs: 60_000 });
    expect(result).toBe("clean-run");
  });
});
