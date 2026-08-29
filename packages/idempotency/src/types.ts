/**
 * Core types for @saas/idempotency.
 *
 * The package is deliberately store-agnostic: `IdempotencyStore` is the
 * only thing production code (Supabase-backed) and tests (in-memory) need
 * to implement / inject. Every higher-level helper (`withIdempotency`,
 * `withRoute`) is built on top of `IdempotencyStore.claim` /
 * `.complete` / `.release` only.
 */

/** A row is scoped by (scope, key). `scope` MUST be tenant-derived (or a
 * fixed system constant for non-tenant callers, e.g. "system") whenever
 * the idempotency key itself is client-supplied — otherwise two different
 * tenants reusing the same client-chosen `Idempotency-Key` value would
 * collide on the same row and one tenant could observe (replay) another
 * tenant's cached response. See README.md "Tenant isolation" section.
 */
export type IdempotencyScope = string;

export type ClaimOutcome =
  /** No prior record (or a stale one was reclaimed) — caller now owns
   * this (scope, key) and MUST call `complete(..., token)` on success or
   * `release(..., token)` on failure, passing back `token` unchanged.
   *
   * `token` is a fencing token minted fresh on every successful claim
   * (including a reclaim of an abandoned one). `complete`/`release` MUST
   * verify the stored token still matches before mutating the row — this
   * is what stops a caller whose TTL has since lapsed (e.g. it stalled
   * long enough for someone else to legitimately reclaim the same
   * (scope, key)) from clobbering the NEW owner's in-flight claim with
   * its own stale result. Without this check, `complete()` would only
   * gate on `status = 'processing'`, and a reclaim also sets
   * `status = 'processing'` — so that check alone cannot tell "my claim"
   * from "someone else's newer claim on the same row" apart. */
  | { kind: "own"; token: string }
  /** A prior attempt already finished. Replay its response verbatim —
   * do NOT re-run the side effect. */
  | { kind: "completed"; status: number; body: unknown }
  /** A prior attempt is still in flight (within its TTL). The caller
   * should surface this as "processing, try again shortly" (HTTP 409)
   * rather than starting a second concurrent execution. */
  | { kind: "in_progress" };

export interface IdempotencyStore {
  /**
   * Atomically claim (scope, key) for processing.
   *
   * Implementations MUST make this safe under concurrent callers: if two
   * callers invoke `claim` for the same (scope, key) at the same instant,
   * at most one may receive `{ kind: "own" }` for a given TTL window —
   * the DB-level guarantee is exactly what root-causes fix in
   * `docs/rules/08-db-rules.md` ("Idempotency Constraints"): a bare
   * check-then-insert has a race window, a real UNIQUE constraint (here:
   * a `(scope, key)` primary key) plus a conditional
   * `INSERT ... ON CONFLICT` / conditional `UPDATE` does not.
   *
   * A `processing` claim older than `ttlMs` (the worker that owned it
   * crashed or the process died mid-request) is treated as abandoned and
   * MAY be reclaimed by a later caller — reclaiming itself must be an
   * atomic conditional operation (e.g. `UPDATE ... WHERE status =
   * 'processing' AND expires_at < now()`), not a read-then-write, or two
   * callers can both believe they reclaimed it.
   */
  claim(scope: IdempotencyScope, key: string, ttlMs: number): Promise<ClaimOutcome>;

  /** Mark a claimed (scope, key) as completed and store the response to
   * replay for future retries. `token` must be the one returned by the
   * `claim()` call that granted ownership — implementations must no-op
   * (or throw) rather than overwrite the row if the stored token has
   * since changed (see `ClaimOutcome["own"].token` doc). */
  complete(
    scope: IdempotencyScope,
    key: string,
    status: number,
    body: unknown,
    token: string
  ): Promise<void>;

  /** Release a claimed (scope, key) WITHOUT marking it completed — used
   * when the wrapped function throws, so a genuine retry (not a
   * duplicate) is allowed to attempt the side effect again instead of
   * being permanently stuck as "in_progress" until TTL expiry. Same
   * token-ownership requirement as `complete()`. */
  release(scope: IdempotencyScope, key: string, token: string): Promise<void>;
}

export interface RunIdempotentOptions {
  scope?: IdempotencyScope;
  /** How long a claim is considered "still legitimately in flight" before
   * a later caller may reclaim it as abandoned. Default: 5 minutes. Pick a
   * value >= the p99 duration of the wrapped function — see
   * [[redis_nx_lock_ttl_too_short]] for what happens when a TTL is
   * guessed too short. */
  ttlMs?: number;
}

/** Thrown by `withIdempotency()` (the non-HTTP wrapper) when another
 * caller currently holds the claim for this (scope, key). Callers decide
 * how to surface this (retry later, 409, skip). */
export class IdempotencyInProgressError extends Error {
  readonly scope: string;
  readonly key: string;

  constructor(scope: string, key: string) {
    super(
      `idempotency claim for scope=${scope} key=${key} is already in progress`
    );
    this.name = "IdempotencyInProgressError";
    this.scope = scope;
    this.key = key;
  }
}
