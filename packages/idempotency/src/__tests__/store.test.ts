import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InMemoryIdempotencyStore, createSupabaseIdempotencyStore } from "../store";
import type { SupabaseLike } from "../store";

describe("InMemoryIdempotencyStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grants 'own' with a token for a brand-new (scope, key)", async () => {
    const store = new InMemoryIdempotencyStore();
    const claim = await store.claim("tenant-1", "k1", 60_000);
    expect(claim.kind).toBe("own");
    expect((claim as { token: string }).token).toBeTruthy();
  });

  it("reports in_progress for a second concurrent claim before completion", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.claim("tenant-1", "k1", 60_000);
    const second = await store.claim("tenant-1", "k1", 60_000);
    expect(second.kind).toBe("in_progress");
  });

  it("replays the completed response for a later claim", async () => {
    const store = new InMemoryIdempotencyStore();
    const first = await store.claim("tenant-1", "k1", 60_000);
    const token = (first as { token: string }).token;
    await store.complete("tenant-1", "k1", 201, { orderId: "o1" }, token);

    const replay = await store.claim("tenant-1", "k1", 60_000);
    expect(replay).toEqual({ kind: "completed", status: 201, body: { orderId: "o1" } });
  });

  it("allows a fresh claim again after release() (failed attempt)", async () => {
    const store = new InMemoryIdempotencyStore();
    const first = await store.claim("tenant-1", "k1", 60_000);
    const token = (first as { token: string }).token;
    await store.release("tenant-1", "k1", token);

    const retry = await store.claim("tenant-1", "k1", 60_000);
    expect(retry.kind).toBe("own");
  });

  it("reclaims a stale 'processing' claim past its TTL", async () => {
    const store = new InMemoryIdempotencyStore();
    await store.claim("tenant-1", "k1", 1_000);
    vi.advanceTimersByTime(1_001);

    const reclaimed = await store.claim("tenant-1", "k1", 60_000);
    expect(reclaimed.kind).toBe("own");
  });

  it("isolates identical keys under different scopes (tenant isolation)", async () => {
    const store = new InMemoryIdempotencyStore();
    const a = await store.claim("tenant-a", "same-key", 60_000);
    const b = await store.claim("tenant-b", "same-key", 60_000);
    expect(a.kind).toBe("own");
    expect(b.kind).toBe("own"); // not blocked by tenant-a's in-flight claim
  });

  it("a completed claim under one scope does not leak into another scope's replay", async () => {
    const store = new InMemoryIdempotencyStore();
    const a = await store.claim("tenant-a", "same-key", 60_000);
    await store.complete("tenant-a", "same-key", 200, { secret: "tenant-a-data" }, (a as { token: string }).token);

    const b = await store.claim("tenant-b", "same-key", 60_000);
    expect(b.kind).toBe("own"); // fresh claim, NOT a replay of tenant-a's body
  });

  it("complete() with a stale token (reclaimed by someone else) is a silent no-op, not a clobber", async () => {
    const store = new InMemoryIdempotencyStore();
    const first = await store.claim("tenant-1", "k1", 1_000);
    const staleToken = (first as { token: string }).token;

    vi.advanceTimersByTime(1_001);
    const second = await store.claim("tenant-1", "k1", 60_000); // reclaims with a new token
    const freshToken = (second as { token: string }).token;
    expect(freshToken).not.toBe(staleToken);

    // The original (now-abandoned) caller finally finishes and tries to
    // complete with its stale token — must not overwrite the new owner's
    // in-flight claim.
    await store.complete("tenant-1", "k1", 200, { from: "stale-caller" }, staleToken);

    const stillOwnedByNewClaimant = await store.claim("tenant-1", "k1", 60_000);
    expect(stillOwnedByNewClaimant.kind).toBe("in_progress");
  });
});

// ---------------------------------------------------------------------------
// createSupabaseIdempotencyStore — exercised against a hand-rolled fake
// PostgREST-like client (same convention as this repo's existing
// `vi.mock("@/lib/db/supabase/admin", ...)` tests, e.g.
// lib/affiliate/__tests__/commission.test.ts): no live Supabase needed.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * Minimal fake PostgREST-style query builder: accumulates `.eq()`/`.lt()`
 * filters, then `select()`/`maybeSingle()` runs `resolve(matchingRows)`.
 * Used for select/update/delete alike — `resolve` decides what "running"
 * the query means (read-only for select, mutate `rows` for update/delete).
 */
function makeFilterChain(
  rows: Map<string, Row>,
  rowKeyOf: (row: Row) => string,
  resolve: (matches: Row[]) => Row[]
) {
  const filters: Array<{ col: string; op: "eq" | "lt"; value: unknown }> = [];

  function matches(row: Row): boolean {
    return filters.every(({ col, op, value }) =>
      op === "eq" ? row[col] === value : (row[col] as string) < (value as string)
    );
  }

  const chain = {
    eq(col: string, value: unknown) {
      filters.push({ col, op: "eq", value });
      return chain;
    },
    lt(col: string, value: unknown) {
      filters.push({ col, op: "lt", value });
      return chain;
    },
    async select() {
      const matching = [...rows.values()].filter(matches);
      const result = resolve(matching);
      return { data: result, error: null };
    },
    async maybeSingle() {
      const matching = [...rows.values()].filter(matches);
      const result = resolve(matching);
      return { data: result[0] ?? null, error: null };
    },
  };

  return chain;
}

function makeFakeSupabase(): { client: SupabaseLike; rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  const rowKeyOf = (row: Row) => `${row.scope}::${row.key}`;

  const client: SupabaseLike = {
    from(_table: string) {
      return {
        upsert(row: Row, _opts: { onConflict: string; ignoreDuplicates: true }) {
          const k = rowKeyOf(row);
          return {
            async select() {
              if (rows.has(k)) {
                // ignoreDuplicates: true → conflicting row is skipped, no data.
                return { data: [], error: null };
              }
              rows.set(k, { ...row });
              return { data: [rows.get(k)!], error: null };
            },
          };
        },
        select(_columns: string) {
          return makeFilterChain(rows, rowKeyOf, (matches) => matches);
        },
        update(patch: Row) {
          return makeFilterChain(rows, rowKeyOf, (matches) => {
            return matches.map((existing) => {
              const updated = { ...existing, ...patch };
              rows.set(rowKeyOf(existing), updated);
              return updated;
            });
          });
        },
        delete() {
          return makeFilterChain(rows, rowKeyOf, (matches) => {
            return matches.map((existing) => {
              rows.delete(rowKeyOf(existing));
              return existing;
            });
          });
        },
      };
    },
  };

  return { client, rows };
}

describe("createSupabaseIdempotencyStore", () => {
  it("claims a brand-new (scope, key)", async () => {
    const { client } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    const claim = await store.claim("tenant-1", "k1", 60_000);
    expect(claim.kind).toBe("own");
  });

  it("reports in_progress on a conflicting concurrent claim", async () => {
    const { client } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    await store.claim("tenant-1", "k1", 60_000);
    const second = await store.claim("tenant-1", "k1", 60_000);
    expect(second.kind).toBe("in_progress");
  });

  it("replays the completed response instead of re-running the side effect", async () => {
    const { client } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    const first = await store.claim("tenant-1", "k1", 60_000);
    const token = (first as { token: string }).token;
    await store.complete("tenant-1", "k1", 201, { id: "abc" }, token);

    const replay = await store.claim("tenant-1", "k1", 60_000);
    expect(replay).toEqual({ kind: "completed", status: 201, body: { id: "abc" } });
  });

  it("isolates the same key across two different scopes (tenant boundary)", async () => {
    const { client } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    const a = await store.claim("tenant-a", "same-key", 60_000);
    await store.complete("tenant-a", "same-key", 200, { data: "tenant-a-only" }, (a as { token: string }).token);

    const b = await store.claim("tenant-b", "same-key", 60_000);
    // Must NOT replay tenant-a's response — a fresh claim for tenant-b.
    expect(b.kind).toBe("own");
  });

  it("release() lets a failed attempt be retried instead of stuck in_progress", async () => {
    const { client } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    const first = await store.claim("tenant-1", "k1", 60_000);
    await store.release("tenant-1", "k1", (first as { token: string }).token);

    const retry = await store.claim("tenant-1", "k1", 60_000);
    expect(retry.kind).toBe("own");
  });
});
