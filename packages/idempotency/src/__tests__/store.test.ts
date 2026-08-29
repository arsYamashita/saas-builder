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
    // in-flight claim, and must report that via its return value so the
    // caller (withIdempotency) can detect claim loss.
    const applied = await store.complete("tenant-1", "k1", 200, { from: "stale-caller" }, staleToken);
    expect(applied).toBe(false);

    const stillOwnedByNewClaimant = await store.claim("tenant-1", "k1", 60_000);
    expect(stillOwnedByNewClaimant.kind).toBe("in_progress");
  });

  it("complete() returns true when the token still matches", async () => {
    const store = new InMemoryIdempotencyStore();
    const claim = await store.claim("tenant-1", "k1", 60_000);
    const applied = await store.complete("tenant-1", "k1", 200, { ok: true }, (claim as { token: string }).token);
    expect(applied).toBe(true);
  });

  it("extend() renews the TTL only while the token still owns the claim", async () => {
    const store = new InMemoryIdempotencyStore();
    const claim = await store.claim("tenant-1", "k1", 1_000);
    const token = (claim as { token: string }).token;

    vi.advanceTimersByTime(900);
    expect(await store.extend("tenant-1", "k1", token, 5_000)).toBe(true);

    // Without the extension this would have expired at +1000ms.
    vi.advanceTimersByTime(1_500); // total elapsed: 2400ms
    const stillOwned = await store.claim("tenant-1", "k1", 60_000);
    expect(stillOwned.kind).toBe("in_progress"); // still held, not reclaimable
  });

  it("extend() returns false for a stale token that no longer owns the claim", async () => {
    const store = new InMemoryIdempotencyStore();
    const claim = await store.claim("tenant-1", "k1", 1_000);
    const staleToken = (claim as { token: string }).token;

    vi.advanceTimersByTime(1_001);
    await store.claim("tenant-1", "k1", 60_000); // someone else reclaims

    expect(await store.extend("tenant-1", "k1", staleToken, 5_000)).toBe(false);
  });

  it("extend() returns false once the claim has been completed (nothing left to extend)", async () => {
    const store = new InMemoryIdempotencyStore();
    const claim = await store.claim("tenant-1", "k1", 60_000);
    const token = (claim as { token: string }).token;
    await store.complete("tenant-1", "k1", 200, { ok: true }, token);

    expect(await store.extend("tenant-1", "k1", token, 5_000)).toBe(false);
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

  it("complete() returns true when applied, false for a stale token", async () => {
    const { client } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    const claim = await store.claim("tenant-1", "k1", 60_000);
    const token = (claim as { token: string }).token;

    const appliedForStale = await store.complete("tenant-1", "k1", 200, { ok: true }, "wrong-token");
    expect(appliedForStale).toBe(false);

    const appliedForReal = await store.complete("tenant-1", "k1", 200, { ok: true }, token);
    expect(appliedForReal).toBe(true);
  });

  it("extend() renews expires_at for the current token and rejects a stale one", async () => {
    const { client, rows } = makeFakeSupabase();
    const store = createSupabaseIdempotencyStore(client);
    const claim = await store.claim("tenant-1", "k1", 60_000);
    const token = (claim as { token: string }).token;
    const originalExpiresAt = rows.get("tenant-1::k1")?.expires_at;

    const extended = await store.extend("tenant-1", "k1", token, 999_999);
    expect(extended).toBe(true);
    expect(rows.get("tenant-1::k1")?.expires_at).not.toBe(originalExpiresAt);

    const rejectedForStale = await store.extend("tenant-1", "k1", "wrong-token", 999_999);
    expect(rejectedForStale).toBe(false);
  });
});
