import type { ClaimOutcome, IdempotencyStore } from "./types";

function randomToken(): string {
  // crypto.randomUUID() is available in Node 19+, all modern browsers, and
  // Deno — every runtime this package targets (Next.js server runtime,
  // vitest/node, and the vendored Deno port for day_care_web_app).
  return crypto.randomUUID();
}

/**
 * In-memory `IdempotencyStore` — for local dev without Supabase configured
 * and for unit tests. NOT safe across multiple processes/instances (same
 * caveat as `lib/step-lock.ts`'s local fallback): it exists so the package
 * has zero hard runtime dependency on Supabase and so tests can assert the
 * exact claim/complete/release state machine without a live database.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private rows = new Map<
    string,
    {
      status: "processing" | "completed";
      token: string;
      responseStatus?: number;
      responseBody?: unknown;
      requestHash: string | null;
      expiresAt: number;
    }
  >();

  private rowKey(scope: string, key: string): string {
    return `${scope}::${key}`;
  }

  async claim(
    scope: string,
    key: string,
    ttlMs: number,
    requestHash: string | null = null
  ): Promise<ClaimOutcome> {
    const rowKey = this.rowKey(scope, key);
    const now = Date.now();
    const existing = this.rows.get(rowKey);

    if (!existing) {
      const token = randomToken();
      this.rows.set(rowKey, { status: "processing", token, requestHash, expiresAt: now + ttlMs });
      return { kind: "own", token };
    }

    if (existing.status === "completed") {
      return {
        kind: "completed",
        status: existing.responseStatus ?? 200,
        body: existing.responseBody,
        requestHash: existing.requestHash,
      };
    }

    // status === "processing"
    if (existing.expiresAt <= now) {
      // Stale claim — the JS event loop is single-threaded, so this
      // read-then-write is atomic in this in-memory implementation (no
      // other `claim()` call can interleave between the check and the
      // write). A real backing store must achieve the same guarantee with
      // an atomic conditional statement — see IdempotencyStore.claim doc.
      const token = randomToken();
      this.rows.set(rowKey, { status: "processing", token, requestHash, expiresAt: now + ttlMs });
      return { kind: "own", token };
    }

    return { kind: "in_progress", requestHash: existing.requestHash };
  }

  async complete(
    scope: string,
    key: string,
    status: number,
    body: unknown,
    token: string
  ): Promise<boolean> {
    const rowKey = this.rowKey(scope, key);
    const existing = this.rows.get(rowKey);
    if (!existing || existing.token !== token) {
      // Our claim was reclaimed by someone else (TTL lapsed under us) —
      // never clobber the new owner's row with our stale result.
      return false;
    }
    // Keep the completed record around indefinitely in-memory (process
    // lifetime); the Supabase-backed store persists it until an
    // operational cleanup job prunes rows past `expires_at` — see
    // README.md "Retention".
    this.rows.set(rowKey, {
      status: "completed",
      token,
      responseStatus: status,
      responseBody: body,
      requestHash: existing.requestHash,
      expiresAt: Number.POSITIVE_INFINITY,
    });
    return true;
  }

  async release(scope: string, key: string, token: string): Promise<void> {
    const rowKey = this.rowKey(scope, key);
    const existing = this.rows.get(rowKey);
    if (!existing || existing.token !== token) {
      return;
    }
    this.rows.delete(rowKey);
  }

  async extend(scope: string, key: string, token: string, ttlMs: number): Promise<boolean> {
    const rowKey = this.rowKey(scope, key);
    const existing = this.rows.get(rowKey);
    if (!existing || existing.token !== token || existing.status !== "processing") {
      return false;
    }
    existing.expiresAt = Date.now() + ttlMs;
    return true;
  }

  /** Test/diagnostic helper only. */
  size(): number {
    return this.rows.size;
  }
}

type MaybeError = { message: string } | null;
type Row = Record<string, unknown>;

/**
 * The tiny structural slice of the supabase-js query builder this store
 * needs. Deliberately loose (not imported from `@supabase/supabase-js`)
 * so the package has no hard runtime dependency on it — pass in whatever
 * admin/service-role client the host app already constructs (e.g.
 * `createAdminClient()`). Real supabase-js query builders satisfy this
 * shape structurally.
 */
export interface SupabaseLike {
  from(table: string): SupabaseQueryBuilder;
}

export interface SupabaseQueryBuilder {
  // `upsert(...).select()` is the only chain this store performs on an
  // upsert result (never further filtered), unlike select/update/delete
  // below — kept as its own minimal shape rather than the full
  // `SupabaseFilterChain` so a fake/test double doesn't need to implement
  // `.eq()`/`.lt()`/`.maybeSingle()` it will never receive.
  upsert(
    row: Row,
    opts: { onConflict: string; ignoreDuplicates: true }
  ): { select(): Promise<{ data: unknown[] | null; error: MaybeError }> };
  select(columns: string): SupabaseFilterChain;
  update(row: Row): SupabaseFilterChain;
  delete(): SupabaseFilterChain;
}

/** A chainable filter builder — `.eq()`/`.lt()` narrow the target rows,
 * `.select()` / `.maybeSingle()` execute and return data. Self-referential
 * so any order/count of filters used by this store type-checks. */
export interface SupabaseFilterChain {
  eq(column: string, value: unknown): SupabaseFilterChain;
  lt(column: string, value: unknown): SupabaseFilterChain;
  select(): Promise<{ data: unknown[] | null; error: MaybeError }>;
  maybeSingle(): Promise<{ data: Row | null; error: MaybeError }>;
}

export interface SupabaseIdempotencyStoreOptions {
  /** Table name. Default: "idempotency_keys" (see
   * supabase/migrations/0017_idempotency_keys.sql). */
  table?: string;
  /** Bounds the reclaim-race retry loop (see claim() implementation
   * comment). Default: 3 — generous for a contention window that should
   * resolve within a couple of round trips. */
  maxClaimAttempts?: number;
}

/**
 * Supabase/Postgres-backed `IdempotencyStore`.
 *
 * Atomicity strategy (no application-level lock needed — every step below
 * is itself a single atomic Postgres statement):
 *
 *   1. `upsert(..., { onConflict: "scope,key", ignoreDuplicates: true })`
 *      — a genuinely new (scope, key) inserts and PostgREST returns the
 *      row; a conflicting (scope, key) is silently skipped (PostgREST
 *      returns zero rows, no error). Same pattern as
 *      `lib/affiliate/commission.ts` (see
 *      [[affiliate_commission_idempotency_missing]]), generalized behind
 *      this store.
 *   2. On conflict, SELECT the current row. `completed` → replay it.
 *      `processing` and not expired → report `in_progress` (409
 *      territory).
 *   3. `processing` but past `expires_at` (the owning caller crashed or
 *      the process died mid-request) → attempt to reclaim with a
 *      conditional `UPDATE ... WHERE status = 'processing' AND
 *      expires_at < now()`, minting a fresh `token`. This WHERE clause is
 *      what makes the reclaim itself race-safe: if two callers both reach
 *      this branch concurrently, Postgres row-level locking ensures only
 *      one UPDATE actually matches and returns a row — the loser re-reads
 *      current state (now the winner's fresh claim) and reports
 *      `in_progress` rather than proceeding as if it owned the claim.
 *
 * `complete`/`release` additionally filter `.eq("token", token)` so a
 * caller whose TTL lapsed mid-flight and was reclaimed by someone else
 * can never clobber the new owner's row — see `ClaimOutcome["own"].token`.
 */
export function createSupabaseIdempotencyStore(
  client: SupabaseLike,
  options: SupabaseIdempotencyStoreOptions = {}
): IdempotencyStore {
  const table = options.table ?? "idempotency_keys";
  const maxClaimAttempts = options.maxClaimAttempts ?? 3;

  async function readCurrent(scope: string, key: string): Promise<Row | null> {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("scope", scope)
      .eq("key", key)
      .maybeSingle();
    if (error) {
      throw new Error(`idempotency store read failed: ${error.message}`);
    }
    return data;
  }

  async function claim(
    scope: string,
    key: string,
    ttlMs: number,
    requestHash: string | null = null,
    attempt = 0
  ): Promise<ClaimOutcome> {
    const nowIso = new Date().toISOString();
    const expiresAtIso = new Date(Date.now() + ttlMs).toISOString();
    const token = randomToken();

    const { data: inserted, error: insertError } = await client
      .from(table)
      .upsert(
        {
          scope,
          key,
          status: "processing",
          token,
          request_hash: requestHash,
          started_at: nowIso,
          expires_at: expiresAtIso,
          response_status: null,
          response_body: null,
          completed_at: null,
        },
        { onConflict: "scope,key", ignoreDuplicates: true }
      )
      .select();

    if (insertError) {
      throw new Error(`idempotency claim insert failed: ${insertError.message}`);
    }
    if (inserted && inserted.length > 0) {
      return { kind: "own", token };
    }

    // Conflict — a row already exists. Read it.
    const existing = await readCurrent(scope, key);
    if (!existing) {
      // Vanishingly rare: the conflicting row existed a moment ago but is
      // gone now (e.g. an operational cleanup job deleted an expired row
      // between our upsert and this select). Safe to retry from scratch.
      if (attempt >= maxClaimAttempts) {
        throw new Error(
          `idempotency claim for scope=${scope} key=${key} could not settle after ${maxClaimAttempts} attempts (contention)`
        );
      }
      return claim(scope, key, ttlMs, requestHash, attempt + 1);
    }

    if (existing.status === "completed") {
      return {
        kind: "completed",
        status: (existing.response_status as number) ?? 200,
        body: existing.response_body,
        requestHash: (existing.request_hash as string | null | undefined) ?? null,
      };
    }

    // status === "processing"
    const expiresAt = new Date(existing.expires_at as string).getTime();
    if (expiresAt > Date.now()) {
      return {
        kind: "in_progress",
        requestHash: (existing.request_hash as string | null | undefined) ?? null,
      };
    }

    // Stale — attempt atomic reclaim with a fresh token.
    const { data: reclaimed, error: reclaimError } = await client
      .from(table)
      .update({
        status: "processing",
        token,
        request_hash: requestHash,
        started_at: nowIso,
        expires_at: expiresAtIso,
        response_status: null,
        response_body: null,
        completed_at: null,
      })
      .eq("scope", scope)
      .eq("key", key)
      .eq("status", "processing")
      .lt("expires_at", nowIso)
      .select();

    if (reclaimError) {
      throw new Error(`idempotency claim reclaim failed: ${reclaimError.message}`);
    }
    if (reclaimed && reclaimed.length > 0) {
      return { kind: "own", token };
    }

    // Lost the reclaim race to another caller — re-check bounded by
    // maxClaimAttempts instead of looping forever under sustained
    // contention.
    if (attempt >= maxClaimAttempts) {
      throw new Error(
        `idempotency claim for scope=${scope} key=${key} could not settle after ${maxClaimAttempts} attempts (contention)`
      );
    }
    return claim(scope, key, ttlMs, requestHash, attempt + 1);
  }

  return {
    claim,
    async complete(scope, key, status, body, token) {
      const { data, error } = await client
        .from(table)
        .update({
          status: "completed",
          response_status: status,
          response_body: body,
          completed_at: new Date().toISOString(),
        })
        .eq("scope", scope)
        .eq("key", key)
        // Ownership check: only the caller holding the CURRENT token may
        // complete this row (see ClaimOutcome["own"].token doc). If the
        // token no longer matches (reclaimed by someone else while we
        // were still running), this matches zero rows and silently no-ops
        // rather than overwriting the new owner's in-flight claim — the
        // return value tells the caller (`withIdempotency`'s heartbeat
        // path) which of those two happened, since "no rows matched"
        // here means the side effect already ran but couldn't be
        // durably recorded under this claim (see
        // `IdempotencyStore.complete` doc / `IdempotencyClaimLostError`).
        .eq("token", token)
        .select();
      if (error) {
        throw new Error(`idempotency complete failed: ${error.message}`);
      }
      return !!data && data.length > 0;
    },
    async release(scope, key, token) {
      const { error } = await client
        .from(table)
        .delete()
        .eq("scope", scope)
        .eq("key", key)
        .eq("token", token)
        .select();
      if (error) {
        throw new Error(`idempotency release failed: ${error.message}`);
      }
    },
    async extend(scope, key, token, ttlMs) {
      const { data, error } = await client
        .from(table)
        .update({ expires_at: new Date(Date.now() + ttlMs).toISOString() })
        .eq("scope", scope)
        .eq("key", key)
        .eq("token", token)
        .eq("status", "processing")
        .select();
      if (error) {
        throw new Error(`idempotency extend failed: ${error.message}`);
      }
      return !!data && data.length > 0;
    },
  };
}
