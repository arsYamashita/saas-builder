/**
 * Static (no live DB required) regression guard for
 * [[supabase_rls_missing]] / [[supabase_rls_enable_migration_missing]]:
 * "every table this repo's migrations ever `CREATE TABLE`s ends up with
 * `ENABLE ROW LEVEL SECURITY` somewhere in the migration history."
 *
 * Substitutes for the manual `select tablename, rowsecurity from pg_tables`
 * verification query documented in 0012_enable_rls_tenant_isolation.sql's
 * header comment, so a future migration that adds a table and forgets to
 * enable RLS on it (or forgets to add it to one of 0012's dynamic
 * `array[...]` lists) fails CI instead of silently shipping an
 * anon/authenticated-readable table — see 0012's own rationale: the
 * service-role client bypasses RLS entirely, so this is defense-in-depth
 * against the NEXT_PUBLIC_SUPABASE_ANON_KEY (necessarily exposed in the
 * client bundle) being used to hit PostgREST directly.
 *
 * Two ways a migration can satisfy "table X has RLS enabled":
 *   1. A literal `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY` (works even
 *      when the literal SQL is itself wrapped in a `DO $$ ... execute
 *      '...' ... $$` block, e.g. 0012's `tenants` / `users` /
 *      `tenant_users` special cases, or 0015's `commissions_duplicates_backup` —
 *      the regex only cares about the resulting SQL text, not what's
 *      generating it).
 *   2. Being named as a string literal inside an `array[...]` construct in
 *      a migration file that also contains 0012's dynamic-execute pattern
 *      (`execute format('alter table %I enable row level security', t)`)
 *      — this is how 0012 covers most of its 21 tables without repeating
 *      the ALTER 11+7 times.
 *
 * Deliberately does NOT re-derive severity/resolved status — this is a
 * regression detector only, per 30_Knowledge/errors/_TEST_REF_CONVENTION.md.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { stripSqlComments } from "@/scripts/security-gate-core";

const MIGRATIONS_DIR = path.resolve(__dirname, "..");

const migrationFiles = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const files = migrationFiles.map((name) => ({
  name,
  content: stripSqlComments(
    fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf-8")
  ),
}));

// ---- 1. every table any migration ever creates ----

const CREATE_TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s*\(/gi;

function extractCreatedTables(): Set<string> {
  const tables = new Set<string>();
  for (const file of files) {
    for (const match of Array.from(
      file.content.matchAll(CREATE_TABLE_RE)
    )) {
      tables.add(match[1].toLowerCase());
    }
  }
  return tables;
}

// ---- 2. every table some migration puts under RLS ----

const DIRECT_ENABLE_RE =
  /alter\s+table\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+enable\s+row\s+level\s+security/gi;

const DYNAMIC_ENABLE_MARKER =
  /execute\s+format\(\s*'alter\s+table\s+%I\s+enable\s+row\s+level\s+security'/i;

const ARRAY_LITERAL_RE = /array\s*\[([^\]]+)\]/gi;
const QUOTED_IDENT_RE = /'([a-zA-Z_][a-zA-Z0-9_]*)'/g;

function extractRlsEnabledTables(): Set<string> {
  const tables = new Set<string>();

  for (const file of files) {
    for (const match of Array.from(
      file.content.matchAll(DIRECT_ENABLE_RE)
    )) {
      tables.add(match[1].toLowerCase());
    }

    if (DYNAMIC_ENABLE_MARKER.test(file.content)) {
      for (const arrayMatch of Array.from(
        file.content.matchAll(ARRAY_LITERAL_RE)
      )) {
        const body = arrayMatch[1];
        for (const identMatch of Array.from(
          body.matchAll(QUOTED_IDENT_RE)
        )) {
          tables.add(identMatch[1].toLowerCase());
        }
      }
    }
  }

  return tables;
}

describe("supabase migrations — RLS coverage (static)", () => {
  it("found at least one migration file to check (sanity: not a silently-empty scan)", () => {
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it("found at least one CREATE TABLE across all migrations (sanity)", () => {
    expect(extractCreatedTables().size).toBeGreaterThan(0);
  });

  const createdTables = extractCreatedTables();
  const rlsEnabledTables = extractRlsEnabledTables();

  for (const table of Array.from(createdTables).sort()) {
    it(`table \`${table}\` has RLS enabled by some migration`, () => {
      expect(rlsEnabledTables.has(table)).toBe(true);
    });
  }
});
