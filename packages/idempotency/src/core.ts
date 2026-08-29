import { IdempotencyClaimLostError, IdempotencyInProgressError } from "./types";
import type { IdempotencyStore, RunIdempotentOptions } from "./types";
import { startHeartbeat } from "./heartbeat";

export const DEFAULT_SCOPE = "system";
/** Default claim TTL: how long a claim is considered "still legitimately
 * running" before a later caller may treat it as abandoned and reclaim
 * it. Pick a larger value per call site when the wrapped work can
 * legitimately run longer — see [[redis_nx_lock_ttl_too_short]] for what
 * happens when a TTL is guessed too short instead of derived from the
 * wrapped function's actual p99 duration. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface IdempotencyDefaults {
  scope?: string;
  ttlMs?: number;
}

export interface Idempotency {
  /**
   * Runs `fn()` for a given (scope, key), replaying a completed prior
   * call's return value instead of re-running `fn` for a retried request.
   * Throws `IdempotencyInProgressError` if another call for the same
   * (scope, key) is currently mid-flight (caller decides how to surface
   * that — HTTP 409, log-and-skip, etc.).
   *
   * A heartbeat renews the claim's TTL (every `heartbeatIntervalMs`,
   * default `ttlMs / 3`) for as long as `fn` is running, so a `ttlMs`
   * guess that turns out too short does not silently let a second caller
   * reclaim the key while `fn` is still genuinely in flight — see
   * [[redis_nx_lock_ttl_too_short]].
   *
   * If `fn` throws, the claim is released (not completed) so a genuine
   * retry can attempt the side effect again — a failed attempt must never
   * permanently poison the key.
   *
   * If `fn` SUCCEEDS but this package cannot durably record that (the
   * heartbeat detects the claim was reclaimed out from under it, or
   * `store.complete()` itself fails, e.g. a DB outage), this throws
   * `IdempotencyClaimLostError` instead of either silently returning the
   * result (which would hide that a concurrent duplicate run may already
   * be in flight) or releasing the claim (which would let a retry
   * actually re-run `fn` and double the side effect it just ran) — see
   * that error's doc for why both of those alternatives are wrong.
   * `IdempotencyClaimLostError.result` carries `fn`'s successful result
   * when available, for callers that want to recover it despite the
   * bookkeeping failure.
   */
  withIdempotency<T>(
    key: string,
    fn: () => Promise<T>,
    opts?: RunIdempotentOptions
  ): Promise<T>;

  /**
   * Convenience wrapper for the Stripe use case named in the design doc:
   * "Stripe 呼び出しには idempotencyKey を自動伝播". Runs the DB-level
   * idempotency guard AND hands the exact same key to the callback so it
   * can pass it through as the Stripe request option — one key, used for
   * both layers, instead of the caller re-deriving (and risking a
   * mismatch) a second key for the Stripe call:
   *
   * ```ts
   * await idempotency.withStripeCall(key, (idempotencyKey) =>
   *   stripe.checkout.sessions.create(params, { idempotencyKey })
   * );
   * ```
   */
  withStripeCall<T>(
    key: string,
    fn: (idempotencyKey: string) => Promise<T>,
    opts?: RunIdempotentOptions
  ): Promise<T>;

  readonly store: IdempotencyStore;
}

/**
 * Builds the `withIdempotency` / `withStripeCall` helpers bound to a given
 * `IdempotencyStore`. Dependency-injected (rather than a module-level
 * singleton) so call sites can share one store instance across a request
 * and tests can inject `InMemoryIdempotencyStore()`.
 */
export function createIdempotency(
  store: IdempotencyStore,
  defaults: IdempotencyDefaults = {}
): Idempotency {
  async function withIdempotency<T>(
    key: string,
    fn: () => Promise<T>,
    opts: RunIdempotentOptions = {}
  ): Promise<T> {
    if (!key || !key.trim()) {
      throw new Error("withIdempotency requires a non-empty key");
    }
    const scope = opts.scope ?? defaults.scope ?? DEFAULT_SCOPE;
    const ttlMs = opts.ttlMs ?? defaults.ttlMs ?? DEFAULT_TTL_MS;
    const heartbeatIntervalMs =
      opts.heartbeatIntervalMs ?? Math.max(1, Math.floor(ttlMs / 3));

    const claimResult = await store.claim(scope, key, ttlMs);

    if (claimResult.kind === "completed") {
      return claimResult.body as T;
    }
    if (claimResult.kind === "in_progress") {
      throw new IdempotencyInProgressError(scope, key);
    }

    // claimResult.kind === "own"
    const { token } = claimResult;

    // Heartbeat: keep renewing the claim's TTL for as long as fn is
    // running, mirroring lock.ts's withLock. `claimLost` is set the
    // moment a renewal is confirmed to have failed (token no longer
    // matches). `store.complete()` below (token-guarded) is the actual
    // final ownership fence regardless of what the heartbeat observed —
    // `claimLost` only lets us skip straight to `IdempotencyClaimLostError`
    // without bothering to call `complete()` at all when we already know
    // it would report `false`. `heartbeat.stop()` (not a bare
    // `clearInterval`) waits for any in-flight renewal to settle before
    // this function reads `claimLost`, closing the race Codex review
    // gpt-5.6-sol (2026-08-30 round 2) found in the sibling `withLock`
    // implementation this mirrors: `clearInterval` alone only stops
    // FUTURE ticks, not one already in flight, so a lagging renewal could
    // otherwise resolve `false` moments after we'd already decided
    // `claimLost` was still `false`.
    let claimLost = false;
    const heartbeat = startHeartbeat(heartbeatIntervalMs, async () => {
      const stillOwned = await store.extend(scope, key, token, ttlMs);
      if (!stillOwned) claimLost = true;
      // A rejected extend() call (e.g. transient DB error) is NOT itself
      // proof of claim loss — an error means "unknown", so it is
      // deliberately not treated as `claimLost = true` here (that would
      // produce false positives, throwing IdempotencyClaimLostError for
      // successful runs on every transient hiccup). A genuinely lost
      // claim will be caught by a subsequent heartbeat tick or by the
      // final `store.complete()` check below.
    });

    let result: T;
    try {
      result = await fn();
    } catch (err) {
      await heartbeat.stop();
      // fn itself failed — nothing to protect, safe (and necessary) to
      // release so a genuine retry can attempt the side effect again.
      // Token-guarded, so a no-op if we'd already lost the claim.
      await store.release(scope, key, token);
      throw err;
    }
    await heartbeat.stop();

    // fn succeeded. Record completion — but if the heartbeat already
    // detected we'd lost the claim, don't bother; either way, a
    // `complete()` that reports it didn't apply (or itself throws) means
    // the same thing: this package cannot promise the result will be
    // replayed rather than re-run, and must say so distinctly rather
    // than silently returning success or releasing (which would invite a
    // duplicate run of a side effect that already happened).
    if (claimLost) {
      throw new IdempotencyClaimLostError(scope, key, result);
    }
    let applied: boolean;
    try {
      applied = await store.complete(scope, key, 200, result, token);
    } catch (completeErr) {
      throw new IdempotencyClaimLostError(scope, key, result, { cause: completeErr });
    }
    if (!applied) {
      throw new IdempotencyClaimLostError(scope, key, result);
    }
    return result;
  }

  async function withStripeCall<T>(
    key: string,
    fn: (idempotencyKey: string) => Promise<T>,
    opts: RunIdempotentOptions = {}
  ): Promise<T> {
    return withIdempotency(key, () => fn(key), opts);
  }

  return { withIdempotency, withStripeCall, store };
}
