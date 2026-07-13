#!/usr/bin/env npx tsx
/**
 * `npm run schema:drift:gate` — CI regression gate for
 * docs/schema-drift-guide.md (M5 指示書 2026-07-06_039).
 *
 * Offline, deterministic structural check: for every target listed in
 * `scripts/schema-drift-targets.json`, diffs the committed
 * `supabase gen types typescript` snapshot (`generatedTypesFile`) against
 * the committed hand-written type file (`handTypesFile`) via the explicit
 * mapping in `mappingFile`. See scripts/schema-drift-gate-core.ts for the
 * diff logic and severity rules.
 *
 * This does NOT talk to Postgres/Docker/Supabase — it only reads files
 * already committed to the repo. The (separate, network/docker-dependent,
 * currently non-blocking) check that the generated snapshot ITSELF is
 * still fresh against the live migrations lives in
 * `scripts/schema-drift/regen-and-diff.sh` (wired as the
 * "Schema Drift — regen check" CI job). Keeping the two separate means a
 * flaky docker-networking hiccup in the regen job can never block this
 * fast, always-reliable structural gate.
 *
 * Per-target `mode` (default read from schema-drift-targets.json, override
 * with SCHEMA_DRIFT_GATE_MODE=warning|hard env var for local iteration):
 *   "hard"    — any "error"-severity finding fails the gate (exit 1).
 *   "warning" — findings are printed as `::warning::` annotations but the
 *               gate still exits 0. Intended only as a temporary rollout
 *               state (see docs/schema-drift-guide.md, "Two-stage
 *               rollout") — a target should not stay in warning mode
 *               indefinitely once drift is confirmed zero.
 *
 * Exit code contract (same as scripts/security-gate-check.ts — see
 * [[auto_scan_output_empty_silent_success]]):
 *   0 = ran to completion, no blocking findings (mode=hard) or mode=warning.
 *   1 = ran to completion, mode=hard and at least one "error" finding.
 *   2 = the gate itself failed to run (missing target file, bad config,
 *       parse error) — never collapsed into "0 findings".
 */
import fs from "node:fs";
import path from "node:path";
import {
  parseGeneratedSchemaColumns,
  parseHandWrittenTypeColumns,
  diffSchemaAndHandTypes,
  hasBlockingFindings,
  type DriftFinding,
} from "./schema-drift-gate-core";

const REPO_ROOT = process.cwd();

interface SchemaDriftTarget {
  name: string;
  generatedTypesFile: string;
  handTypesFile: string;
  mappingFile: string;
  mode: "hard" | "warning";
}

function loadTargets(): SchemaDriftTarget[] {
  const targetsPath = path.join(REPO_ROOT, "scripts/schema-drift-targets.json");
  if (!fs.existsSync(targetsPath)) {
    throw new Error(
      `[schema-drift-gate] scripts/schema-drift-targets.json not found under ${REPO_ROOT}.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "[schema-drift-gate] scripts/schema-drift-targets.json must be a non-empty array — an empty target list would silently report 0 findings without having checked anything."
    );
  }
  return raw as SchemaDriftTarget[];
}

function readRequiredFile(relPath: string, label: string): string {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`[schema-drift-gate] ${label} not found: ${relPath}`);
  }
  return fs.readFileSync(abs, "utf8");
}

function printFindings(target: string, findings: DriftFinding[], mode: "hard" | "warning"): void {
  for (const f of findings) {
    const loc = f.field ? `${f.handType}.${f.field}` : f.handType ?? f.table ?? "";
    const annotation = f.severity === "error" && mode === "hard" ? "error" : "warning";
    console.log(`::${annotation}::[schema-drift:${target}] [${f.rule}] ${loc} — ${f.message}`);
  }
}

function main(): void {
  const targets = loadTargets();
  const modeOverride = process.env.SCHEMA_DRIFT_GATE_MODE as "hard" | "warning" | undefined;

  let anyBlocking = false;
  let totalFindings = 0;

  for (const target of targets) {
    const mode = modeOverride ?? target.mode ?? "warning";
    console.log(`\n[schema-drift-gate] target "${target.name}" (mode=${mode})`);

    const generatedContent = readRequiredFile(target.generatedTypesFile, "generatedTypesFile");
    const handContent = readRequiredFile(target.handTypesFile, "handTypesFile");
    const rawMapping = JSON.parse(readRequiredFile(target.mappingFile, "mappingFile")) as Record<string, string>;
    // Strip "$comment"-style documentation keys (a plain JSON file can't
    // carry a `//` comment) — everything else is a real hand-type ->
    // table-name mapping entry.
    const mapping = Object.fromEntries(
      Object.entries(rawMapping).filter(([key]) => !key.startsWith("$"))
    );

    const schemaTables = parseGeneratedSchemaColumns(generatedContent);
    const handTypes = parseHandWrittenTypeColumns(handContent);
    const findings = diffSchemaAndHandTypes(schemaTables, handTypes, mapping);

    totalFindings += findings.length;
    console.log(
      `[schema-drift-gate] target "${target.name}": ${schemaTables.size} schema table(s), ${Object.keys(mapping).length} mapped hand type(s), ${findings.length} finding(s).`
    );

    if (findings.length > 0) {
      printFindings(target.name, findings, mode);
    }

    if (mode === "hard" && hasBlockingFindings(findings)) {
      anyBlocking = true;
    }
  }

  if (anyBlocking) {
    console.error(
      `\n[schema-drift-gate] FAIL — blocking (error-severity) findings in hard-mode target(s). See docs/schema-drift-guide.md.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n[schema-drift-gate] PASS — ${totalFindings} total finding(s) across ${targets.length} target(s) (0 blocking).`
  );
}

try {
  main();
} catch (err) {
  console.error(
    `[schema-drift-gate] ERROR — gate itself failed to run: ${
      err instanceof Error ? err.message : String(err)
    }`
  );
  process.exitCode = 2;
}
