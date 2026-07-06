/**
 * Shared assertions for the "internal error leak" wiring tests
 * (docs/testing/error-leak-surfaces.md).
 *
 * Every route/output-path test that forces an internal failure (a
 * Postgres-shaped error, a thrown Error with a stack, a raw provider
 * message, etc.) must run its response body through `assertNoLeak()`
 * with the route-specific forbidden fragments (table name, column name,
 * constraint name, Postgres error code, etc.) that the fabricated
 * upstream error contains.
 *
 * This does NOT replace the static grep-based regression gate added in
 * PR #36 (scripts/security-gate-core.ts, `no-error-detail-leak` rule),
 * which catches `details: x.message` at the source-code level. This
 * helper is the dynamic complement: it actually invokes the route
 * handler and inspects the real HTTP response body.
 */
import { expect } from "vitest";

/**
 * Fragments that must never appear in a client-facing response body,
 * regardless of which route produced it. These are patterns rather than
 * route-specific secrets (those are passed in per-test as `forbidden`).
 */
const UNIVERSAL_FORBIDDEN_PATTERNS: RegExp[] = [
  // Node.js stack trace frame referencing an installed package, e.g.
  // "at Object.<anonymous> (/app/node_modules/pg/lib/client.js:100:9)"
  /\bnode_modules[\\/]/,
  // A generic stack trace frame ("at file:line:col" or "at fn (file:line:col)").
  /\bat\s+(?:[\w.<>$]+\s+)?\(?(?:[A-Za-z]:)?[\w./\\-]+:\d+:\d+\)?/,
  // Common Postgres/PostgREST error-code shape (e.g. 23503, 42P01, PGRST116).
  /\b(?:[0-9]{5}|PGRST\d{3})\b/,
];

/**
 * Asserts that `body` (a raw response string, or a JSON-stringified
 * response object) contains none of:
 *  - the universal forbidden patterns above (stack frames, PG codes), and
 *  - the route-specific `forbidden` fragments (table/column/constraint
 *    names, the raw upstream `.message` text, etc.) supplied by the caller.
 *
 * Usage:
 *   const res = await POST(req);
 *   const bodyText = await res.text();
 *   assertNoLeak(bodyText, ["secret_internal_notes", "does not exist", "42703"]);
 *
 * Pitfall: don't pick a bare table/column name that is also an ordinary
 * English word appearing in the route's own generic message (e.g. a
 * "contents" table next to a "Failed to fetch contents" message) — that's
 * a false positive, not a leak. Prefer distinctive fragments: an unlikely
 * column name, the full "relation ... does not exist"/constraint phrase,
 * or the Postgres error code.
 */
export function assertNoLeak(body: string, forbidden: string[] = []): void {
  for (const pattern of UNIVERSAL_FORBIDDEN_PATTERNS) {
    expect(body).not.toMatch(pattern);
  }
  for (const fragment of forbidden) {
    expect(body).not.toContain(fragment);
  }
}

/**
 * A representative fabricated Postgres error, shaped like what
 * `@supabase/supabase-js` surfaces from a real DB failure. Use this (or a
 * route-specific variant naming the route's own table/column) as the
 * `error` a mocked Supabase call resolves with, so the test exercises the
 * exact same shape production code will see.
 */
export function fakePostgresError(overrides: {
  message: string;
  code?: string;
}): { message: string; code: string; details: string; hint: string } {
  return {
    message: overrides.message,
    code: overrides.code ?? "42P01",
    details: "",
    hint: "",
  };
}
