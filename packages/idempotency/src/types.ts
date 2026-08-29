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
   * `claim()` call that granted ownership.
   *
   * Returns `true` if this call's token still matched (the row is now
   * genuinely marked completed under our ownership), or `false` if the
   * token no longer matched — meaning our claim's TTL lapsed and someone
   * else reclaimed (scope, key) while we were still running `fn`. A
   * `false` return means the side effect DID run (successfully) but this
   * package's own record of it did NOT stick — callers (see
   * `withIdempotency`) must treat that as a distinct failure mode
   * (`IdempotencyClaimLostError`), not silently report success, since a
   * second execution may already be running or about to run under the
   * new claim. */
  complete(
    scope: IdempotencyScope,
    key: string,
    status: number,
    body: unknown,
    token: string
  ): Promise<boolean>;

  /** Release a claimed (scope, key) WITHOUT marking it completed — used
   * when the wrapped function throws, so a genuine retry (not a
   * duplicate) is allowed to attempt the side effect again instead of
   * being permanently stuck as "in_progress" until TTL expiry. Same
   * token-ownership requirement as `complete()` — a stale token is a
   * silent no-op, never releasing someone else's newer claim. */
  release(scope: IdempotencyScope, key: string, token: string): Promise<void>;

  /**
   * Extends the TTL of a claim still owned by `token` (compare-and-extend,
   * mirroring `lock.ts`'s `extendLock`). Used by `withIdempotency`'s
   * internal heartbeat to keep a claim alive for as long as `fn` is
   * genuinely still running, rather than betting correctness on a single
   * upfront `ttlMs` guess — see [[redis_nx_lock_ttl_too_short]].
   *
   * Returns `false` if `token` no longer owns the claim (already
   * completed, released, or reclaimed by someone else) — the heartbeat
   * uses this to detect claim loss even though it cannot forcibly cancel
   * an already-running `fn`.
   */
  extend(scope: IdempotencyScope, key: string, token: string, ttlMs: number): Promise<boolean>;
}

export interface RunIdempotentOptions {
  scope?: IdempotencyScope;
  /** How long a claim is considered "still legitimately in flight" before
   * a later caller may treat it as abandoned and reclaim it. Default: 5
   * minutes. This is now a heartbeat-renewed lease (see
   * `withIdempotency`'s implementation), not a single upfront guess — see
   * [[redis_nx_lock_ttl_too_short]] for what happens when a TTL is
   * guessed too short AND never renewed. Still pick a value that
   * comfortably covers normal execution between heartbeats, and treat
   * `ttlMs / 3` (the default heartbeat interval) as the real bound on how
   * fast claim loss is detected. */
  ttlMs?: number;
  /** How often the heartbeat renews the claim while `fn` runs. Default:
   * `ttlMs / 3`. */
  heartbeatIntervalMs?: number;
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

/**
 * Thrown by `withIdempotency()` when `fn` completed successfully but this
 * package lost ownership of the claim before it could durably record
 * that (either the claim's TTL lapsed and was reclaimed mid-flight — see
 * `IdempotencyStore.complete` doc — or `store.complete()` itself threw,
 * e.g. a DB outage). In both cases `fn`'s side effect DID already run:
 * this error means "the side effect happened, but this package can no
 * longer promise a retry will just replay the result instead of running
 * it again" — callers should alert/investigate rather than blindly retry
 * on this specific error, and MUST NOT interpret it as "the side effect
 * didn't happen" (that would be the actual dangerous mistake: replaying
 * a successful email send, Stripe call, or commission grant a second
 * time). See `fn`'s result on `.result` when available (claim-lost path
 * only; unavailable when `store.complete()` itself threw before we could
 * know its return value's meaning — `.cause` carries the original error
 * in that case).
 */
export class IdempotencyClaimLostError<T = unknown> extends Error {
  readonly scope: string;
  readonly key: string;
  readonly result: T | undefined;

  constructor(scope: string, key: string, result: T | undefined, options?: { cause?: unknown }) {
    super(
      `idempotency claim for scope=${scope} key=${key} was lost while fn() was running — ` +
        `fn() DID complete, but its result could not be durably recorded and a concurrent ` +
        `caller may have already reclaimed this key. Do not blindly retry.`,
      options
    );
    this.name = "IdempotencyClaimLostError";
    this.scope = scope;
    this.key = key;
    this.result = result;
  }
}
