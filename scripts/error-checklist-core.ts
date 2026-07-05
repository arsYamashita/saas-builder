/**
 * Core (side-effect-free) logic for the error-KB checklist generator.
 *
 * Reads `30_Knowledge/errors/*.md` from the M2 Obsidian vault, parses the
 * frontmatter (severity / projects / tags / resolved), groups entries into
 * the recurring clusters the saas-builder KB has accumulated (Stripe,
 * Supabase RLS, idempotency/race conditions, rate-limit/env), and renders a
 * Markdown checklist.
 *
 * Split from generate-error-checklist.ts (the CLI entry point) so this
 * module has no top-level side effects and can be unit tested directly.
 *
 * 2026-07-06: the checklist mechanism was extracted to
 * `~/Documents/my-vault/_scripts/kb_checklist/` (plain, dependency-free
 * Node ESM) so any repo -- not just saas-builder -- can generate its own
 * checklist (50_M5_Instructions/2026-07-03_016_kb_checklist_rollout_daycare_navigator.md).
 * That vault copy (`error-checklist-core.mjs`) is the canonical source of
 * truth; `scripts/generate-error-checklist.ts` in this repo is now a thin
 * wrapper that dynamically imports and delegates to it at runtime. This
 * file (`error-checklist-core.ts`) stays behaviorally identical to the
 * vault copy but remains in the repo, unchanged in shape, because it is
 * imported directly by `scripts/__tests__/error-checklist-core.test.ts`,
 * which runs in CI (a GitHub Actions runner that never has the vault
 * mounted) -- a dynamic import of the vault path would fail there.
 * `scripts/__tests__/kb-checklist-vault-parity.test.ts` cross-checks this
 * file against the vault copy, but only when the vault is present
 * locally, as a drift tripwire that can never break CI.
 */
import fs from "node:fs";
import path from "node:path";
import { matchesStack } from "./stack-filter";

export interface ChecklistItem {
  file: string;
  slug: string;
  title: string;
  category: string;
  severity: string;
  resolved: boolean;
  projects: string[];
  tags: string[];
}

export interface SkippedFile {
  file: string;
  reason: string;
}

export interface BuildResult {
  markdown: string;
  items: ChecklistItem[];
  skipped: SkippedFile[];
  /** .md files under errors/ that don't have `type: error_pattern` frontmatter (e.g. auto_scan_*.md logs) — excluded, not an error. */
  ignoredNonPattern: number;
  /** Error-pattern items excluded by the `stacks` filter (see stack-filter.ts). 0 when no filter was requested. */
  filteredByStack: number;
}

export interface BuildChecklistOptions {
  /** Already-normalized (lowercase) stack names, e.g. `["nextjs", "supabase"]`. Omitted/empty = no filtering. */
  stacks?: string[];
}

/**
 * Minimal YAML frontmatter parser, scoped to the flat `key: value` /
 * `key: [a, b, c]` / `key: true` shapes used by 30_Knowledge/errors/*.md.
 * Returns null if the file has no frontmatter block at all (e.g.
 * auto_scan_*.md summary logs, which start with prose, not `---`).
 */
export function parseFrontmatter(
  content: string
): Record<string, unknown> | null {
  if (!content.startsWith("---")) return null;

  const end = content.indexOf("\n---", 3);
  if (end === -1) return null;

  const block = content.slice(3, end).trim();
  const result: Record<string, unknown> = {};

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value: unknown = match[2].trim();

    if (
      typeof value === "string" &&
      value.startsWith("[") &&
      value.endsWith("]")
    ) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === "true" || value === "false") {
      value = value === "true";
    } else if (typeof value === "string") {
      value = value.replace(/^"(.*)"$/, "$1");
    }

    result[key] = value;
  }

  return result;
}

/** Extracts the first H1 heading after the frontmatter block as the title. */
export function extractTitle(content: string): string {
  const withoutFrontmatter = content.replace(/^---[\s\S]*?\n---/, "");
  const match = withoutFrontmatter.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "(no title)";
}

interface CategoryRule {
  label: string;
  test: (tags: string[]) => boolean;
}

// Order matters: first match wins. A pattern like
// affiliate_commission_idempotency_missing.md is tagged with both
// "idempotency" and "stripe" — it belongs in the idempotency/race cluster
// (per 20_Proposals/2026-07-03_error_kb_bake_into_scaffold.md's "冪等性・
// レース系 8件"), so that check must run before the Stripe check.
const CATEGORY_RULES: CategoryRule[] = [
  {
    label: "Idempotency / Race Conditions",
    test: (tags) =>
      tags.some((t) => /idempot|race|duplicate|\block\b/i.test(t)),
  },
  {
    label: "Stripe / Payments",
    test: (tags) => tags.some((t) => /stripe|payments?/i.test(t)),
  },
  {
    label: "Supabase / RLS",
    test: (tags) => tags.some((t) => /\brls\b|supabase|storage/i.test(t)),
  },
  {
    label: "Rate Limit / Env Validation",
    test: (tags) => tags.some((t) => /rate.?limit|env(?:ironment)?/i.test(t)),
  },
];

export const CATEGORY_ORDER = [
  ...CATEGORY_RULES.map((r) => r.label),
  "Other",
];

export function categorize(tags: string[]): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.test(tags)) return rule.label;
  }
  return "Other";
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function severityRank(severity: string): number {
  return SEVERITY_RANK[severity.trim().toLowerCase()] ?? 9;
}

/**
 * Reads and parses every error-pattern file under
 * `<vaultPath>/30_Knowledge/errors/`, skipping (with a warning) any file
 * that cannot be read — including permanently-locked files that raise
 * EDEADLK, which has been observed against this vault directory.
 */
export function buildChecklist(
  vaultPath: string,
  warn: (message: string) => void = console.warn,
  options: BuildChecklistOptions = {}
): BuildResult {
  const stacks = options.stacks ?? [];
  const errorsDir = path.join(vaultPath, "30_Knowledge", "errors");

  let fileNames: string[];
  try {
    fileNames = fs
      .readdirSync(errorsDir)
      .filter((name) => name.endsWith(".md"));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? String(err);
    warn(`[error-checklist] cannot read errors directory ${errorsDir}: ${code}`);
    fileNames = [];
  }

  const items: ChecklistItem[] = [];
  const skipped: SkippedFile[] = [];
  let ignoredNonPattern = 0;
  let filteredByStack = 0;

  for (const file of fileNames) {
    const fullPath = path.join(errorsDir, file);
    let content: string;

    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? String(err);
      warn(`[error-checklist] skipping unreadable file "${file}": ${code}`);
      skipped.push({ file, reason: code });
      continue;
    }

    const frontmatter = parseFrontmatter(content);
    if (!frontmatter || frontmatter.type !== "error_pattern") {
      ignoredNonPattern++;
      continue;
    }

    const tags = Array.isArray(frontmatter.tags)
      ? (frontmatter.tags as string[])
      : [];
    const projects = Array.isArray(frontmatter.projects)
      ? (frontmatter.projects as string[])
      : [];
    const severity =
      typeof frontmatter.severity === "string"
        ? frontmatter.severity
        : "unknown";
    const resolved = frontmatter.resolved === true;

    if (!matchesStack(tags, stacks)) {
      filteredByStack++;
      continue;
    }

    items.push({
      file,
      slug: file.replace(/\.md$/, ""),
      title: extractTitle(content),
      category: categorize(tags),
      severity,
      resolved,
      projects,
      tags,
    });
  }

  items.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    const rankDiff = severityRank(a.severity) - severityRank(b.severity);
    if (rankDiff !== 0) return rankDiff;
    return a.slug.localeCompare(b.slug);
  });

  const byCategory = new Map<string, ChecklistItem[]>();
  for (const category of CATEGORY_ORDER) byCategory.set(category, []);
  for (const item of items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category)!.push(item);
  }

  const markdown = renderMarkdown(items, skipped, byCategory, stacks);

  return { markdown, items, skipped, ignoredNonPattern, filteredByStack };
}

function renderMarkdown(
  items: ChecklistItem[],
  skipped: SkippedFile[],
  byCategory: Map<string, ChecklistItem[]>,
  stacks: string[]
): string {
  const lines: string[] = [];

  const openCount = items.filter((item) => !item.resolved).length;
  const resolvedCount = items.length - openCount;

  lines.push("# Error KB Pre-flight Checklist");
  lines.push("");
  lines.push(
    "<!-- AUTO-GENERATED by `npm run kb:checklist` " +
      "(scripts/generate-error-checklist.ts). Do not edit by hand. -->"
  );
  lines.push("");
  // Deliberately no absolute vault path here: the generated file is
  // committed, so embedding each developer's local VAULT_PATH would cause
  // machine-dependent diffs and leak local filesystem paths.
  lines.push(
    `**${openCount} open / ${resolvedCount} resolved** — from ${items.length} ` +
      "error-pattern file(s) under the vault's `30_Knowledge/errors/` " +
      "directory" +
      (stacks.length > 0 ? ` filtered to stack: \`${stacks.join(", ")}\`` : "") +
      ". Resolved items are omitted below; fix one and run " +
      "`npm run kb:resolve -- <file>.md --pr <n> --project <name>` so it " +
      "stops resurfacing here."
  );
  lines.push("");

  if (skipped.length > 0) {
    lines.push(
      `> ⚠️ ${skipped.length} file(s) could not be read and were skipped: ` +
        skipped.map((s) => `\`${s.file}\` (${s.reason})`).join(", ")
    );
    lines.push("");
  }

  lines.push(
    "Review the section(s) relevant to your change before opening a PR."
  );
  lines.push("");

  for (const [category, categoryItems] of Array.from(byCategory.entries())) {
    // resolved: true entries are deliberately excluded from the
    // checklist body — this file is a pre-flight list of what's still
    // open, not a full KB index. Once a fix lands, `npm run kb:resolve`
    // should flip `resolved: true` in the vault and the item drops out
    // here on the next `npm run kb:checklist` run.
    const openItems = categoryItems.filter((item) => !item.resolved);
    if (openItems.length === 0) continue;

    lines.push(`## ${category} (${openItems.length})`);
    lines.push("");

    for (const item of openItems) {
      lines.push(`- [ ] **${item.slug}** _(${item.severity})_ — ${item.title}`);
      if (item.projects.length > 0) {
        lines.push(`      - projects: ${item.projects.join(", ")}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
