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

// Local dev fallback: key -> expiresAtMs. Not safe across multiple
// instances — only used when Redis isn't configured at all (local dev).
const localLocks = new Map<string, number>();

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
  const expiresAt = localLocks.get(key);
  if (expiresAt !== undefined && expiresAt > now) {
    return null;
  }
  localLocks.set(key, now + ttlMs);
  return token;
}

/**
 * Releases the lock for `key`, but only if it is still held by `token`.
 * This is a best-effort GET-then-DEL against Redis (not a single atomic
 * compare-and-delete) — the only failure mode of that gap is releasing a
 * lock a hair early right as it was about to expire anyway, since the TTL
 * (not this release call) is what actually bounds lock lifetime. It can
 * never make a lock outlive its TTL.
 */
export async function releaseStepLock(key: string, token: string): Promise<void> {
  if (redis) {
    const current = await redis.get<string>(key);
    if (current === token) {
      await redis.del(key);
    }
    return;
  }

  localLocks.delete(key);
}
