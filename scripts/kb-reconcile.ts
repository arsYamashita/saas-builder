/**
 * Bulk `kb:resolve` runner: scans `git log` (commit subjects + bodies)
 * and, when the `gh` CLI is available and authenticated, merged PR
 * bodies via `gh pr list --state merged`, for `Resolves-KB: <file>.md`
 * trailers, and marks each referenced vault KB file resolved.
 *
 * Usage:
 *   npm run kb:reconcile                 # scan + apply
 *   npm run kb:reconcile -- --dry-run    # scan + report, no writes
 *   npm run kb:reconcile -- --project my-app
 *   VAULT_PATH=/custom/path npm run kb:reconcile
 *
 * `--project` defaults to this repo's `package.json` "name" field
 * (saas-builder). `resolved_by` is written as `"<project>#<pr>"`; a
 * record whose commit isn't part of a merge/squash (no discoverable PR
 * number) is skipped with a warning rather than guessed at.
 *
 * `gh pr list` failures (not installed, not authenticated, no network)
 * are non-fatal: this falls back to `git log`-only discovery, which
 * covers squash-merge commits (GitHub appends `(#123)` to the subject)
 * even without `gh`.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { updateFrontmatterResolved } from "./kb-resolve-core";
import {
  dedupeByFile,
  extractPrNumber,
  parseResolvesKbTrailers,
  type ReconcileRecord,
} from "./kb-reconcile-core";

const RECORD_SEP = "\x1e"; // record separator
const FIELD_SEP = "\x1f"; // unit separator

function resolveVaultPath(): string {
  const raw = process.env.VAULT_PATH || "~/Documents/my-vault";
  return raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : path.resolve(raw);
}

function defaultProjectName(): string {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    );
    return typeof pkg.name === "string" ? pkg.name : "unknown-project";
  } catch {
    return "unknown-project";
  }
}

function gitLogRecords(): ReconcileRecord[] {
  let raw: string;
  try {
    raw = execFileSync(
      "git",
      [
        "log",
        "--grep=Resolves-KB:",
        "-i",
        `--format=%H${FIELD_SEP}%cs${FIELD_SEP}%s${RECORD_SEP}%b${RECORD_SEP}%n`,
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 32 }
    );
  } catch (err) {
    console.warn(`[kb:reconcile] git log failed: ${(err as Error).message}`);
    return [];
  }

  const records: ReconcileRecord[] = [];
  for (const chunk of raw.split(`${RECORD_SEP}\n`)) {
    if (!chunk.trim()) continue;
    const [head, body = ""] = chunk.split(RECORD_SEP);
    const [sha, date, subject] = head.split(FIELD_SEP);
    if (!sha) continue;

    const files = [
      ...parseResolvesKbTrailers(subject ?? ""),
      ...parseResolvesKbTrailers(body ?? ""),
    ];
    if (files.length === 0) continue;

    records.push({
      files: Array.from(new Set(files)),
      prNumber: extractPrNumber(subject ?? ""),
      date,
      source: `git-log:${sha.slice(0, 7)}`,
    });
  }

  return records;
}

function ghPrRecords(): ReconcileRecord[] {
  let raw: string;
  try {
    raw = execFileSync(
      "gh",
      [
        "pr",
        "list",
        "--state",
        "merged",
        "--limit",
        "200",
        "--json",
        "number,body,mergedAt",
      ],
      { encoding: "utf8", maxBuffer: 1024 * 1024 * 32 }
    );
  } catch (err) {
    console.warn(
      `[kb:reconcile] \`gh pr list\` unavailable (${(err as Error).message.split("\n")[0]}) — ` +
        "falling back to git log only."
    );
    return [];
  }

  let prs: Array<{ number: number; body: string | null; mergedAt: string | null }>;
  try {
    prs = JSON.parse(raw);
  } catch (err) {
    console.warn(`[kb:reconcile] could not parse \`gh pr list\` JSON: ${(err as Error).message}`);
    return [];
  }

  const records: ReconcileRecord[] = [];
  for (const pr of prs) {
    const files = parseResolvesKbTrailers(pr.body ?? "");
    if (files.length === 0) continue;
    records.push({
      files,
      prNumber: String(pr.number),
      date: pr.mergedAt ? pr.mergedAt.slice(0, 10) : undefined,
      source: `gh-pr:#${pr.number}`,
    });
  }

  return records;
}

/** Local (not UTC) calendar date as YYYY-MM-DD — see scripts/kb-resolve.ts. */
function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const projectFlagIdx = argv.indexOf("--project");
  const project =
    projectFlagIdx !== -1 && argv[projectFlagIdx + 1]
      ? argv[projectFlagIdx + 1]
      : defaultProjectName();

  // git-log records first, gh records last: dedupeByFile lets later
  // entries win, and gh has the authoritative PR number + merge date.
  const records = [...gitLogRecords(), ...ghPrRecords()];

  if (records.length === 0) {
    console.log(
      "[kb:reconcile] no `Resolves-KB:` trailers found in git log or merged PRs. Nothing to do."
    );
    return;
  }

  const byFile = dedupeByFile(records);
  const vaultPath = resolveVaultPath();
  const errorsDir = path.join(vaultPath, "30_Knowledge", "errors");

  let resolvedCount = 0;
  let skippedCount = 0;

  for (const [file, info] of Array.from(byFile.entries())) {
    if (!info.prNumber) {
      console.warn(
        `[kb:reconcile] ${file}: found a Resolves-KB trailer (${info.source}) but no PR number ` +
          "could be determined — skipping (not a merge/squash commit)."
      );
      skippedCount++;
      continue;
    }

    const fullPath = path.join(errorsDir, file);
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? String(err);
      console.warn(`[kb:reconcile] ${file}: cannot read "${fullPath}" (${code}) — skipping.`);
      skippedCount++;
      continue;
    }

    const resolvedBy = `${project}#${info.prNumber}`;
    const resolvedAt = info.date ?? todayISO();

    let result;
    try {
      result = updateFrontmatterResolved(content, { resolvedBy, resolvedAt });
    } catch (err) {
      console.warn(`[kb:reconcile] ${file}: ${(err as Error).message} — skipping.`);
      skippedCount++;
      continue;
    }

    if (!result.changed) {
      console.log(`[kb:reconcile] ${file}: already resolved_by=${resolvedBy} — no changes.`);
      continue;
    }

    if (!dryRun) {
      fs.writeFileSync(fullPath, result.content, "utf8");
    }

    console.log(
      `[kb:reconcile] ${dryRun ? "(dry-run) would resolve" : "resolved"} ${file} ` +
        `<- resolved_by="${resolvedBy}" resolved_at=${resolvedAt} (${info.source})`
    );
    resolvedCount++;
  }

  console.log(
    `[kb:reconcile] done: ${resolvedCount} file(s) ${dryRun ? "would be " : ""}resolved, ` +
      `${skippedCount} skipped.`
  );
}

main();
