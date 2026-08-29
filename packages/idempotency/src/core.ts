import { IdempotencyInProgressError } from "./types";
import type { IdempotencyStore, RunIdempotentOptions } from "./types";

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
   * Runs `fn()` at most once for a given (scope, key): a concurrent or
   * retried call with the same key replays the first call's return value
   * instead of re-running `fn`. Throws `IdempotencyInProgressError` if
   * another call for the same (scope, key) is currently mid-flight
   * (caller decides how to surface that — HTTP 409, log-and-skip, etc.).
   *
   * If `fn` throws, the claim is released (not completed) so a genuine
   * retry can attempt the side effect again — a failed attempt must never
   * permanently poison the key.
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

    const claim = await store.claim(scope, key, ttlMs);

    if (claim.kind === "completed") {
      return claim.body as T;
    }
    if (claim.kind === "in_progress") {
      throw new IdempotencyInProgressError(scope, key);
    }

    // claim.kind === "own"
    try {
      const result = await fn();
      await store.complete(scope, key, 200, result, claim.token);
      return result;
    } catch (err) {
      await store.release(scope, key, claim.token);
      throw err;
    }
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
