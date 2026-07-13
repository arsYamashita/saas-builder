#!/usr/bin/env npx tsx
/**
 * `npm run firestore:drift:gate` — reference CLI wrapper for
 * scripts/firestore-drift-gate-core.ts (M5 指示書 2026-07-06_039, step 3).
 *
 * NOT wired into saas-builder's own CI — this repo has no Firestore
 * usage. Ships here as a copy-and-wire template asset for Firestore-based
 * derivatives (see the doc comment in firestore-drift-gate-core.ts and
 * docs/schema-drift-guide.md, "Firestore-based derivatives").
 *
 * Usage:
 *   tsx scripts/firestore-drift-gate-check.ts --schema <path-to-schema.json> [--root app --root lib ...]
 *
 * <schema.json> shape: see FirestoreSchemaDeclaration in
 * firestore-drift-gate-core.ts, and
 * docs/examples/firestore-schema.example.json for a filled-in example.
 *
 * Exit code contract (same as scripts/security-gate-check.ts /
 * scripts/schema-drift-gate-check.ts):
 *   0 = ran to completion, 0 findings.
 *   1 = ran to completion, 1+ findings (all findings from this gate are
 *       error-severity by design — see hasBlockingFindings()).
 *   2 = the gate itself failed to run (missing schema file, bad JSON,
 *       unreadable source root) — never collapsed into "0 findings".
 */
import fs from "node:fs";
import path from "node:path";
import {
  runFirestoreDriftGate,
  hasBlockingFindings,
  type SourceFile,
  type FirestoreSchemaDeclaration,
  type FirestoreDriftFinding,
} from "./firestore-drift-gate-core";

const REPO_ROOT = process.cwd();
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".next", "dist", "build", "__tests__"]);

function parseArgs(argv: string[]): { schema?: string; roots: string[] } {
  const roots: string[] = [];
  let schema: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--schema") schema = argv[++i];
    else if (argv[i] === "--root") roots.push(argv[++i]);
  }
  return { schema, roots: roots.length > 0 ? roots : ["app", "lib"] };
}

function collectSourceFiles(rootDirs: string[]): SourceFile[] {
  const results: SourceFile[] = [];
  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      throw new Error(
        `[firestore-drift-gate] failed to read directory "${dir}": ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name) || entry.name.startsWith(".")) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile() && SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        if (/\.test\.tsx?$/.test(entry.name) || /\.spec\.tsx?$/.test(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        results.push({
          path: path.relative(REPO_ROOT, fullPath).split(path.sep).join("/"),
          content: fs.readFileSync(fullPath, "utf8"),
        });
      }
    }
  }
  for (const root of rootDirs) {
    const abs = path.join(REPO_ROOT, root);
    if (!fs.existsSync(abs)) {
      throw new Error(`[firestore-drift-gate] source root "${root}" does not exist under ${REPO_ROOT}.`);
    }
    walk(abs);
  }
  return results;
}

function printFindings(findings: FirestoreDriftFinding[]): void {
  for (const f of findings) {
    console.error(`\n✗ [${f.rule}] ${f.file}:${f.line}`);
    console.error(`  ${f.snippet}`);
    console.error(`  ${f.message}`);
  }
}

function main(): void {
  const { schema: schemaPath, roots } = parseArgs(process.argv.slice(2));
  if (!schemaPath) {
    throw new Error("[firestore-drift-gate] --schema <path-to-schema.json> is required.");
  }
  const schemaAbs = path.join(REPO_ROOT, schemaPath);
  if (!fs.existsSync(schemaAbs)) {
    throw new Error(`[firestore-drift-gate] schema file not found: ${schemaPath}`);
  }
  const schema = JSON.parse(fs.readFileSync(schemaAbs, "utf8")) as FirestoreSchemaDeclaration;
  if (!schema.collections || Object.keys(schema.collections).length === 0) {
    throw new Error(
      `[firestore-drift-gate] ${schemaPath} declares 0 collections — refusing to run a gate that would report "0 findings" without having anything real to check against.`
    );
  }

  console.log(`[firestore-drift-gate] scanning ${roots.join(", ")} against ${schemaPath} ...`);
  const files = collectSourceFiles(roots);
  console.log(`[firestore-drift-gate] scanned ${files.length} source file(s).`);

  const findings = runFirestoreDriftGate(files, schema);

  if (findings.length === 0) {
    console.log(`[firestore-drift-gate] PASS — 0 findings across ${files.length} source file(s).`);
    return;
  }

  printFindings(findings);
  console.error(`\n[firestore-drift-gate] FAIL — ${findings.length} finding(s).`);
  if (hasBlockingFindings(findings)) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.error(
    `[firestore-drift-gate] ERROR — gate itself failed to run: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
  process.exitCode = 2;
}
