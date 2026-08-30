#!/usr/bin/env npx tsx
/**
 * `npm run security:baseline` — CI gate for SECURITY_CHECKLIST.md's
 * "must exist" template baseline (M5 指示書114, 2026-07-18; integrated
 * 2026-07-20 from two independently-staged partial implementations — see
 * scripts/security-baseline-core.ts's header "Provenance" note).
 *
 * Unlike `npm run security:gate` (scripts/security-gate-check.ts, 指示書034
 * — a REGRESSION gate that only re-checks NEW diffs for a handful of
 * already-fixed anti-patterns), this gate re-verifies the WHOLE tree on
 * every run, so a template regression is caught even outside the PR that
 * introduced it:
 *
 *   1. Every file under app/, lib/, packages/ that looks like a Stripe
 *      webhook handler is PROVEN (via cross-file call-chain tracing, not
 *      just text presence) to invoke stripe.webhooks.constructEvent().
 *   2. Every table any supabase/migrations/*.sql CREATEs has RLS enabled
 *      AND a non-permissive policy somewhere in the migration history (or
 *      an inline `-- rls-exempt:` annotation) — not just new migrations.
 *   3. Every AI/LLM-calling API route under app/api is wired to a rate
 *      limiter, and lib/rate-limit.ts defines an AI-scoped bucket.
 *   4. Every Supabase Storage bucket declared in a migration has an
 *      explicit `public` flag and a scoped storage.objects policy.
 *
 * This is the SOLE entry point for the 指示書114 baseline gate — all four
 * checks run as one fail-closed command (`npm run security:baseline`),
 * wired into CI via .github/workflows/security-gate.yml. There is
 * deliberately no separate `security:baseline:webhook` / `:rls` /
 * `:storage` script family: one command, one pass/fail signal, no dead
 * script names to keep in sync with this file's checks.
 *
 * Exit code contract (same as security-gate-check.ts — see
 * [[auto_scan_output_empty_silent_success]]):
 *   0  = ran to completion, zero violations found.
 *   1  = ran to completion, one or more violations found (real red).
 *   2  = the gate itself failed to run (unreadable directory, unexpected
 *        exception) — NEVER treated as "0 violations".
 */
import fs from "node:fs";
import path from "node:path";
import {
  findWebhookSignatureViolations,
  findRlsCoverageViolations,
  findAiRateLimitViolations,
  findRateLimitModuleViolations,
  findStorageBucketPolicyViolations,
  findStorageBucketDeclarations,
  type SourceFile,
  type Violation,
} from "./security-baseline-core";

// Resolved from the current working directory (this script is always run
// as `npx tsx scripts/security-baseline-check.ts` / `npm run
// security:baseline` from the repo root), NOT from `__dirname`, so tests
// can point it at a throwaway fixture repo via `cwd` on the spawned
// process instead of touching the real repo tree — same pattern as
// scripts/security-gate-check.ts.
const REPO_ROOT = process.cwd();

const RATE_LIMIT_MODULE_PATH = "lib/rate-limit.ts";
const MIGRATIONS_DIR = "supabase/migrations";
const API_ROOT = "app/api";
// Every source root the webhook call-chain check needs to be able to
// resolve an import into — a webhook handler can import from any of
// these (app/api/stripe/webhook/route.ts -> @/lib/payments ->
// @saas/payments -> packages/payments/src/webhook.ts, this repo's real
// shape). Missing one of these roots from the scan wouldn't just miss a
// FILE, it would break resolveImportPure() for every hop through it,
// turning "verified" into an unprovable-therefore-FAIL — so this list
// must stay in sync with security-baseline-core.ts's resolver
// (`@/` -> repo root, `@saas/<pkg>` -> `packages/<pkg>/src/...`).
const WEBHOOK_SOURCE_ROOTS = ["app", "lib", "packages"];

const EXCLUDED_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  "__tests__",
]);

function isExcludedDir(name: string): boolean {
  return EXCLUDED_DIR_NAMES.has(name) || name.startsWith(".");
}

function isTestFile(fileName: string): boolean {
  return /\.test\.tsx?$/.test(fileName) || /\.spec\.tsx?$/.test(fileName);
}

function readFileOrNull(relPath: string): string | null {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

/** Recursively collects `{path, content}` for every route.ts(x) under `rootDir`. */
function collectRouteFiles(rootDir: string): SourceFile[] {
  const results: SourceFile[] = [];
  const absRoot = path.join(REPO_ROOT, rootDir);
  if (!fs.existsSync(absRoot)) return results;

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isExcludedDir(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (isTestFile(entry.name)) continue;
        if (!/^route\.tsx?$/.test(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        results.push({
          path: path.relative(REPO_ROOT, fullPath).split(path.sep).join("/"),
          content: fs.readFileSync(fullPath, "utf8"),
        });
      }
    }
  }

  walk(absRoot);
  return results;
}

/**
 * Recursively collects `{path, content}` for every non-test `.ts`/`.tsx`
 * file under each of `rootDirs` — used by the webhook call-chain check,
 * which needs the WHOLE source tree (not just route.ts files) to resolve
 * import edges across app/, lib/, and packages/. A root that doesn't
 * exist is silently skipped (not an error) — a derived project might not
 * have a `packages/` workspace dir at all.
 */
function collectAllSourceFiles(rootDirs: string[]): SourceFile[] {
  const results: SourceFile[] = [];

  function walk(absDir: string) {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isExcludedDir(entry.name)) continue;
        walk(path.join(absDir, entry.name));
      } else if (entry.isFile()) {
        if (isTestFile(entry.name)) continue;
        if (!/\.tsx?$/.test(entry.name)) continue;
        const fullPath = path.join(absDir, entry.name);
        results.push({
          path: path.relative(REPO_ROOT, fullPath).split(path.sep).join("/"),
          content: fs.readFileSync(fullPath, "utf8"),
        });
      }
    }
  }

  for (const root of rootDirs) {
    const absRoot = path.join(REPO_ROOT, root);
    if (!fs.existsSync(absRoot)) continue;
    walk(absRoot);
  }

  return results;
}

/** All `supabase/migrations/*.sql` files (the FULL history, not a git diff). */
function collectMigrationFiles(): SourceFile[] {
  const absDir = path.join(REPO_ROOT, MIGRATIONS_DIR);
  if (!fs.existsSync(absDir)) {
    throw new Error(
      `[security-baseline] expected ${MIGRATIONS_DIR} does not exist under ${REPO_ROOT} — refusing to report a silent "0 violations" from a directory that was never scanned.`
    );
  }

  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    // Sorted (filename order = chronological order, this repo's `NNNN_*.sql`
    // convention) so migration-history-ordered checks — e.g.
    // findStorageBucketPolicyViolations()'s "first declaration" reporting —
    // are deterministic across filesystems/readdir implementations, not
    // just "whatever order the OS happened to return".
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const relPath = path.join(MIGRATIONS_DIR, entry.name);
      return {
        path: relPath.split(path.sep).join("/"),
        content: fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8"),
      };
    });
}

function printViolations(violations: Violation[]): void {
  for (const v of violations) {
    console.error(`\n✗ [${v.rule}] ${v.file}${v.line ? `:${v.line}` : ""}`);
    if (v.snippet) console.error(`  ${v.snippet}`);
    console.error(`  ${v.message}`);
  }
}

function main(): void {
  console.log(
    `[security-baseline] checking ${WEBHOOK_SOURCE_ROOTS.join("/, ")}/ for Stripe webhook signature verification ...`
  );
  const sourceFiles = collectAllSourceFiles(WEBHOOK_SOURCE_ROOTS);
  console.log(`[security-baseline] ${sourceFiles.length} source file(s) scanned for webhook call-chain tracing.`);
  const webhookViolations = findWebhookSignatureViolations(sourceFiles);

  console.log(`[security-baseline] checking ${MIGRATIONS_DIR} for RLS + policy coverage ...`);
  const migrationFiles = collectMigrationFiles();
  console.log(`[security-baseline] ${migrationFiles.length} migration file(s) scanned.`);
  const rlsViolations = findRlsCoverageViolations(migrationFiles);

  console.log(`[security-baseline] checking ${API_ROOT} for AI endpoint rate-limit wiring ...`);
  const routeFiles = collectRouteFiles(API_ROOT);
  console.log(`[security-baseline] ${routeFiles.length} route file(s) scanned.`);
  const aiRouteViolations = findAiRateLimitViolations(routeFiles);

  const rateLimitModuleContent = readFileOrNull(RATE_LIMIT_MODULE_PATH);
  const rateLimitModuleViolations = findRateLimitModuleViolations(
    RATE_LIMIT_MODULE_PATH,
    rateLimitModuleContent
  );

  console.log(`[security-baseline] checking ${MIGRATIONS_DIR} for Storage bucket policy coverage ...`);
  const bucketDecls = findStorageBucketDeclarations(migrationFiles);
  console.log(
    bucketDecls.length === 0
      ? "[security-baseline] no storage.buckets declaration found — passes vacuously (nothing to verify)."
      : `[security-baseline] ${bucketDecls.length} storage.buckets declaration(s) found.`
  );
  const storageViolations = findStorageBucketPolicyViolations(migrationFiles);

  const allViolations = [
    ...webhookViolations,
    ...rlsViolations,
    ...aiRouteViolations,
    ...rateLimitModuleViolations,
    ...storageViolations,
  ];

  if (allViolations.length === 0) {
    console.log(
      `[security-baseline] PASS — 0 violations. webhook=ok (${sourceFiles.length} source file(s)), ` +
        `${migrationFiles.length} migration(s)/RLS+policy=ok, ${routeFiles.length} route(s)/rate-limit=ok, ` +
        `storage-bucket-policy=ok (${bucketDecls.length} declaration(s)).`
    );
    return;
  }

  printViolations(allViolations);
  console.error(
    `\n[security-baseline] FAIL — ${allViolations.length} violation(s). See SECURITY_CHECKLIST.md.`
  );
  process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(
    `[security-baseline] ERROR — gate itself failed to run: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
  process.exitCode = 2;
}
