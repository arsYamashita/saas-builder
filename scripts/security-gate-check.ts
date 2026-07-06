#!/usr/bin/env npx tsx
/**
 * `npm run security:gate` — CI regression gate for docs/security-checklist.md.
 *
 * Runs the pure checks in scripts/security-gate-core.ts against the real
 * filesystem:
 *   1. Silent-catch / error-detail-leak scan over app/, lib/, packages/
 *      (excluding test files and Client Components — see
 *      security-gate-core.ts's isClientComponent doc comment).
 *   2. Direct Stripe SDK call scan over the same tree, excluding
 *      packages/payments/ itself.
 *   3. `security_invoker` scan over NEW supabase/migrations/*.sql files
 *      only (diffed against the PR base branch / origin/main).
 *
 * Exit code contract (see [[auto_scan_output_empty_silent_success]] — a
 * scan that silently produces empty output must not read as "passed"):
 *   0  = ran to completion, zero violations found.
 *   1  = ran to completion, one or more violations found (real red).
 *   2  = the gate itself failed to run (bad git ref, unreadable directory,
 *        unexpected exception) — NEVER treated as "0 violations"; a
 *        `grep`-based CI step that lets its own tooling failure collapse
 *        into a green check is exactly the failure mode this repo already
 *        hit once (see the KB entry above).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  scanSourceFiles,
  findMigrationViewViolations,
  type SourceFile,
  type Violation,
} from "./security-gate-core";

// Resolved from the current working directory (this script is always run
// as `npx tsx scripts/security-gate-check.ts` / `npm run security:gate`
// from the repo root — see package.json), NOT from `__dirname`, so tests
// can point it at a throwaway fixture repo via `cwd` on the spawned
// process instead of touching the real repo tree.
const REPO_ROOT = process.cwd();

const SOURCE_ROOTS = ["app", "lib", "packages"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
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

/** Recursively collects `{path, content}` for every source file under `rootDirs`. */
function collectSourceFiles(rootDirs: string[]): SourceFile[] {
  const results: SourceFile[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `[security-gate] failed to read directory "${dir}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isExcludedDir(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (isTestFile(entry.name)) continue;
        if (!SOURCE_EXTENSIONS.includes(path.extname(entry.name))) continue;
        const fullPath = path.join(dir, entry.name);
        const content = fs.readFileSync(fullPath, "utf8");
        results.push({
          path: path.relative(REPO_ROOT, fullPath).split(path.sep).join("/"),
          content,
        });
      }
    }
  }

  for (const root of rootDirs) {
    const abs = path.join(REPO_ROOT, root);
    if (!fs.existsSync(abs)) {
      throw new Error(
        `[security-gate] expected source root "${root}" does not exist under ${REPO_ROOT} — refusing to report a silent "0 violations" from a directory that was never scanned.`
      );
    }
    walk(abs);
  }

  return results;
}

/**
 * Determines which `supabase/migrations/*.sql` files are NEW relative to
 * the PR base branch (or `origin/main` outside a PR context), via
 * `git diff --diff-filter=A`.
 *
 * Explicitly distinguishes "git ran fine and found 0 new files" from "git
 * itself failed" (bad ref, detached history, shallow clone without the
 * base ref fetched) — the latter throws instead of silently returning an
 * empty list, so a misconfigured CI checkout shows up as a red gate
 * failure, not a quietly-skipped check.
 */
function findNewMigrationFiles(): SourceFile[] {
  const migrationsDir = path.join(REPO_ROOT, "supabase/migrations");
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(
      `[security-gate] expected supabase/migrations does not exist under ${REPO_ROOT}.`
    );
  }

  // SECURITY_GATE_BASE_REF is an escape hatch for tests / local runs against
  // a repo with no "origin" remote (e.g. scripts/__tests__'s temp git repo
  // fixtures) — CI never sets it, so production behavior is unchanged.
  const baseRef =
    process.env.SECURITY_GATE_BASE_REF ??
    (process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : "origin/main");

  let diffOutput: string;
  try {
    diffOutput = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "--diff-filter=A",
        `${baseRef}...HEAD`,
        "--",
        "supabase/migrations",
      ],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
  } catch (err) {
    // Most common cause: `baseRef` wasn't fetched (shallow checkout without
    // fetch-depth: 0 / an explicit fetch of the base branch). Falling back
    // to "no new files" here would be exactly the silent-success trap this
    // gate exists to avoid, so this is a hard failure instead.
    throw new Error(
      `[security-gate] \`git diff ${baseRef}...HEAD\` failed — cannot determine which migration files are new. ` +
        `Ensure the base ref is fetched (checkout step needs fetch-depth: 0, or an explicit \`git fetch origin ${
          process.env.GITHUB_BASE_REF ?? "main"
        }\`). Underlying error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const newFiles = diffOutput
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.endsWith(".sql"));

  return newFiles.map((relPath) => ({
    path: relPath,
    content: fs.readFileSync(path.join(REPO_ROOT, relPath), "utf8"),
  }));
}

function printViolations(violations: Violation[]): void {
  for (const v of violations) {
    console.error(`\n✗ [${v.rule}] ${v.file}:${v.line}`);
    console.error(`  ${v.snippet}`);
    console.error(`  ${v.message}`);
  }
}

function main(): void {
  console.log("[security-gate] scanning app/, lib/, packages/ ...");
  const sourceFiles = collectSourceFiles(SOURCE_ROOTS);
  console.log(`[security-gate] scanned ${sourceFiles.length} source file(s).`);

  const sourceViolations = scanSourceFiles(sourceFiles);

  console.log("[security-gate] checking new supabase/migrations for missing security_invoker ...");
  const newMigrations = findNewMigrationFiles();
  console.log(
    `[security-gate] ${newMigrations.length} new migration file(s) since base ref.`
  );
  const migrationViolations = findMigrationViewViolations(newMigrations);

  const allViolations = [...sourceViolations, ...migrationViolations];

  if (allViolations.length === 0) {
    console.log(
      `[security-gate] PASS — 0 violations across ${sourceFiles.length} source file(s) and ${newMigrations.length} new migration file(s).`
    );
    return;
  }

  printViolations(allViolations);
  console.error(
    `\n[security-gate] FAIL — ${allViolations.length} violation(s). See docs/security-checklist.md.`
  );
  process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(
    `[security-gate] ERROR — gate itself failed to run: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
  process.exitCode = 2;
}
