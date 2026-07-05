import { Redis } from "@upstash/redis";

/**
 * Distributed lock guarding concurrent execution of the same generation
 * step rerun (e.g. a double-click or two browser tabs both hitting
 * POST /api/generation-runs/[runId]/rerun-step for the same stepKey at
 * once). Backed by Upstash Redis `SET NX PX`, with an in-memory fallback
 * for local dev without Redis configured — mirrors the fallback pattern in
 * `lib/rate-limit.ts` (single-instance only, not safe across multiple
 * serverless instances, but there is no Redis to be unsafe with in that
 * case anyway).
 *
 * TTL rationale (see [[redis_nx_lock_ttl_too_short]]):
 * The critical section this lock guards is the internal `fetch()` call in
 * rerun-step/route.ts to an AI generation route. None of those routes
 * declare an explicit `export const maxDuration`, so nothing in this repo
 * bounds how long a single healthy call may legitimately run — a short,
 * guessed TTL (the redis_nx_lock_ttl_too_short mistake: 30s under a Stripe
 * call that could exceed it) would risk expiring mid-flight and letting a
 * second concurrent rerun start while the first is still genuinely
 * running. Rather than guess, this TTL is pinned to the same
 * `STUCK_STEP_THRESHOLD_MS` already established in `lib/db/step-review.ts`
 * for lazy stuck-run detection — i.e. "how long can a healthy AI step
 * legitimately take, plus margin" is defined once and reused, so the lock
 * and the stuck-step auto-reset recover in lockstep instead of one
 * mechanism unblocking before the other.
 */
export const STEP_LOCK_TTL_MS = 10 * 60 * 1000;

const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Local dev fallback: key -> { token, expiresAtMs }. Not safe across
// multiple instances — only used when Redis isn't configured at all
// (local dev). The token is stored so release can compare-and-delete,
// mirroring the Redis path.
const localLocks = new Map<string, { token: string; expiresAt: number }>();

/**
 * Attempts to acquire the lock for `key`. Returns an opaque token to pass
 * to `releaseStepLock` on success, or `null` if the lock is already held.
 */
export async function acquireStepLock(
  key: string,
  ttlMs: number = STEP_LOCK_TTL_MS
): Promise<string | null> {
  const token = crypto.randomUUID();

  if (redis) {
    const acquired = await redis.set(key, token, { nx: true, px: ttlMs });
    return acquired ? token : null;
  }

  const now = Date.now();
  const entry = localLocks.get(key);
  if (entry !== undefined && entry.expiresAt > now) {
    return null;
  }
  localLocks.set(key, { token, expiresAt: now + ttlMs });
  return token;
}

/**
 * Atomic compare-and-delete: DEL only if the key still holds `token`, in a
 * single Lua script (the standard Redis unlock pattern). A non-atomic
 * GET-then-DEL has a real race (Codex P2): GET returns our token, the key
 * then expires, ANOTHER request acquires a fresh lock under the same key,
 * and our delayed DEL wipes the new owner's lock — silently disabling the
 * concurrency guard for that request. Executing compare+delete server-side
 * in one script closes that window.
 */
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

/**
 * Releases the lock for `key`, but only if it is still held by `token`.
 * Atomic on both paths: the Redis path runs a compare-and-delete Lua
 * script; the in-memory fallback compares the stored token before
 * deleting (single-threaded event loop makes that check atomic locally).
 * A stale token (lock expired and re-acquired by someone else) is a
 * no-op — it must never release the new owner's lock.
 */
export async function releaseStepLock(key: string, token: string): Promise<void> {
  if (redis) {
    await redis.eval(RELEASE_SCRIPT, [key], [token]);
    return;
  }

  const entry = localLocks.get(key);
  if (entry !== undefined && entry.token === token) {
    localLocks.delete(key);
  }
}
