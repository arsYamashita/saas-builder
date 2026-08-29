/**
 * Distributed lock: Redis `SET NX PX` + TTL, with heartbeat-based TTL
 * extension for the duration of the guarded work.
 *
 * Generalizes `lib/step-lock.ts` (which this package's `withLock` is
 * intended to eventually replace call sites of) with the heartbeat
 * mechanism [[redis_nx_lock_ttl_too_short]] asks for: rather than betting
 * the whole lock's safety on correctly guessing a TTL >= the wrapped
 * work's actual duration up front, `withLock` keeps renewing the TTL
 * (`ttlMs / 3` by default) for as long as the wrapped function is still
 * running, and stops as soon as it settles. A short initial TTL guess
 * that turns out to be wrong no longer silently lets a second caller
 * acquire the lock out from under a still-running first caller — the
 * heartbeat catches up before the original TTL would have expired.
 *
 * TTL is still not optional to think about: pass a `ttlMs` at least the
 * p99 duration of the wrapped work (the heartbeat interval derives from
 * it), so a genuinely crashed holder (no heartbeat happening at all) is
 * still detected and reclaimed within a bounded time rather than never.
 */

export interface RedisLike {
  set(
    key: string,
    value: string,
    opts: { nx: true; px: number }
  ): Promise<"OK" | null>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end`;

// Local dev / no-Redis-configured fallback — single instance only, same
// caveat as lib/step-lock.ts's local fallback.
const localLocks = new Map<string, { token: string; expiresAt: number }>();

function makeLocalRedis(): RedisLike {
  return {
    async set(key, value, opts) {
      const now = Date.now();
      const entry = localLocks.get(key);
      if (entry && entry.expiresAt > now) {
        return null;
      }
      localLocks.set(key, { token: value, expiresAt: now + opts.px });
      return "OK";
    },
    async eval(script, keys, args) {
      const [key] = keys;
      const entry = localLocks.get(key);
      if (script === RELEASE_SCRIPT) {
        if (entry && entry.token === args[0]) {
          localLocks.delete(key);
          return 1;
        }
        return 0;
      }
      if (script === EXTEND_SCRIPT) {
        if (entry && entry.token === args[0]) {
          entry.expiresAt = Date.now() + Number(args[1]);
          return 1;
        }
        return 0;
      }
      return 0;
    },
  };
}

export interface AcquireLockResult {
  token: string;
}

/**
 * Attempts to acquire `key`. Returns an opaque token to pass to
 * `releaseLock`/`extendLock` on success, or `null` if already held.
 */
export async function acquireLock(
  redis: RedisLike,
  key: string,
  ttlMs: number
): Promise<string | null> {
  const token = crypto.randomUUID();
  const acquired = await redis.set(key, token, { nx: true, px: ttlMs });
  return acquired ? token : null;
}

/** Atomic compare-and-delete: only releases if `token` still owns the lock. */
export async function releaseLock(
  redis: RedisLike,
  key: string,
  token: string
): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, [key], [token]);
}

/** Atomic compare-and-extend: only renews the TTL if `token` still owns
 * the lock. Returns `false` if the lock was lost (expired and possibly
 * reclaimed by someone else) — the caller should treat that as "I no
 * longer safely hold this lock" and abort the guarded work if possible. */
export async function extendLock(
  redis: RedisLike,
  key: string,
  token: string,
  ttlMs: number
): Promise<boolean> {
  const result = await redis.eval(EXTEND_SCRIPT, [key], [token, String(ttlMs)]);
  return result === 1;
}

export class LockContentionError extends Error {
  constructor(readonly key: string) {
    super(`could not acquire lock for key=${key} (already held)`);
    this.name = "LockContentionError";
  }
}

/**
 * Thrown by `withLock()` when the heartbeat confirms the lock was lost
 * (a compare-and-extend returned `false` — someone else's TTL-based
 * reclaim won) while `fn` was still running (Codex review gpt-5.6-sol,
 * 2026-08-30 High: an earlier revision silently discarded this signal
 * and returned `fn`'s result as if the lock had been held the whole
 * time). `fn` is passed an `AbortSignal` that this fires the instant loss
 * is detected, so a cooperative `fn` (e.g. `fetch(url, { signal })`) can
 * actually stop — but `withLock` cannot forcibly cancel a `fn` that
 * doesn't check the signal, so this error means "the lock was lost;
 * `fn`'s side effects may have completed anyway, may have been aborted
 * partway, or may still be racing another holder" — treat it as unknown
 * outcome requiring investigation, not as "safe to retry" or "definitely
 * failed".
 */
export class LockLostError extends Error {
  constructor(readonly key: string, options?: { cause?: unknown }) {
    super(
      `lock for key=${key} was lost (reclaimed by another caller) while fn() was still running`,
      options
    );
    this.name = "LockLostError";
  }
}

export interface WithLockOptions {
  /** Redis client. Omit to use an in-process, single-instance fallback
   * (local dev only — see module doc). */
  redis?: RedisLike;
  /** Initial (and per-heartbeat renewed) TTL. Should be >= the p99
   * duration of `fn` — see module doc and [[redis_nx_lock_ttl_too_short]]. */
  ttlMs: number;
  /** How often to renew the TTL while `fn` is running. Default:
   * `ttlMs / 3` (mirrors the conventional Redlock guidance of renewing
   * well before expiry so a slow renewal round-trip doesn't itself cause
   * an expiry). */
  heartbeatIntervalMs?: number;
}

/**
 * Acquires `key`, runs `fn` while periodically extending the lock's TTL
 * (heartbeat) so a long-running `fn` never has its lock expire out from
 * under it just because the initial `ttlMs` guess was conservative, then
 * releases the lock. Throws `LockContentionError` if the lock is already
 * held by someone else, or `LockLostError` if the heartbeat detects the
 * lock was reclaimed while `fn` was still running.
 *
 * `fn` receives an `AbortSignal` fired the moment lock loss is detected —
 * a cooperative `fn` should check/pass it along (e.g. into `fetch`) so it
 * can actually stop rather than keep running unprotected. `withLock`
 * cannot force a non-cooperative `fn` to stop; see `LockLostError`'s doc
 * for what the error does and does not tell you in that case.
 */
export async function withLock<T>(
  key: string,
  fn: (signal: AbortSignal) => Promise<T>,
  opts: WithLockOptions
): Promise<T> {
  const redis = opts.redis ?? makeLocalRedis();
  const ttlMs = opts.ttlMs;
  const heartbeatIntervalMs = opts.heartbeatIntervalMs ?? Math.max(1, Math.floor(ttlMs / 3));

  const token = await acquireLock(redis, key, ttlMs);
  if (!token) {
    throw new LockContentionError(key);
  }

  let lost = false;
  const abortController = new AbortController();

  const heartbeat = setInterval(() => {
    extendLock(redis, key, token, ttlMs).then(
      (stillHeld) => {
        if (!stillHeld) {
          lost = true;
          abortController.abort(new LockLostError(key));
        }
      },
      () => {
        // A failed/erroring renewal attempt (transient Redis error) is
        // NOT itself proof of loss — unlike a confirmed `false` return —
        // so it deliberately does not set `lost` (that would produce
        // false-positive LockLostError throws on every transient
        // hiccup). A genuine loss will be caught by a subsequent
        // heartbeat tick.
      }
    );
  }, heartbeatIntervalMs);
  // Node-specific: don't let the heartbeat keep the process alive on its
  // own (no-op / unsupported in browser and Deno, guarded defensively).
  const maybeUnref = (heartbeat as unknown as { unref?: () => void }).unref;
  if (typeof maybeUnref === "function") {
    maybeUnref.call(heartbeat);
  }

  let result: T;
  try {
    result = await fn(abortController.signal);
  } catch (err) {
    clearInterval(heartbeat);
    await releaseLock(redis, key, token);
    if (lost) {
      throw new LockLostError(key, { cause: err });
    }
    throw err;
  }
  clearInterval(heartbeat);
  await releaseLock(redis, key, token);
  if (lost) {
    throw new LockLostError(key);
  }
  return result;
}
