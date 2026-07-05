/**
 * Core (side-effect-free) parsing logic for `npm run kb:reconcile`.
 *
 * A merged PR that fixes a vault KB error pattern is expected (per
 * .github/PULL_REQUEST_TEMPLATE.md's `Resolves-KB:` field) to include one
 * or more trailer lines in its body/commit message:
 *
 *   Resolves-KB: stripe_checkout_idempotency_key_missing.md
 *   Resolves-KB: some_other_pattern.md, another_pattern
 *
 * This module extracts those file references from arbitrary PR body /
 * commit message text, and extracts the PR number GitHub appends to a
 * squash-merge commit subject (`Some title (#123)`) or writes into a
 * merge commit subject (`Merge pull request #123 from ...`), so the CLI
 * (scripts/kb-reconcile.ts) doesn't need `gh` to at least discover
 * *which* KB files a given commit claims to resolve.
 */

const TRAILER_RE = /^\s*Resolves-KB:\s*(.+)$/gim;
const SQUASH_PR_RE = /\(#(\d+)\)\s*$/;
const MERGE_PR_RE = /^Merge pull request #(\d+)\b/;
// Multi-line HTML comments. Non-greedy, so `<!-- a --> real <!-- b -->`
// drops only the comments, not the text between them. An unterminated
// `<!--` swallows the rest of the text — same as how GitHub renders it,
// so what the PR author sees is what gets parsed.
const HTML_COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g;

/**
 * Extracts every `.md` file named in `Resolves-KB:` trailer lines within
 * `text` (a PR body or commit message). Accepts comma-and/or
 * whitespace-separated lists on a single trailer line. Missing `.md`
 * suffixes are normalized on. Case-insensitive on the `Resolves-KB:` key
 * (GitHub trailer conventions vary); returns files in first-seen order,
 * de-duplicated.
 *
 * Text inside HTML comments (`<!-- ... -->`, including multi-line ones)
 * is ignored: PR bodies opened from .github/PULL_REQUEST_TEMPLATE.md
 * carry the template's explanatory comment verbatim, and a parseable
 * example trailer in that comment would make every untouched-template PR
 * falsely "resolve" whatever KB file the example mentioned
 * (Codex review P2 on PR #29).
 */
export function parseResolvesKbTrailers(text: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();
  const visibleText = text.replace(HTML_COMMENT_RE, "");

  for (const match of Array.from(visibleText.matchAll(TRAILER_RE))) {
    const rest = match[1];
    for (const rawEntry of rest.split(/[,\s]+/)) {
      const entry = rawEntry.trim();
      if (!entry) continue;
      const fileName = entry.endsWith(".md") ? entry : `${entry}.md`;
      if (!seen.has(fileName)) {
        seen.add(fileName);
        files.push(fileName);
      }
    }
  }

  return files;
}

/**
 * Extracts a GitHub PR number from a commit subject line, covering both
 * squash-merge (`title (#123)`) and merge-commit
 * (`Merge pull request #123 from ...`) conventions. Returns undefined if
 * neither pattern matches (e.g. a plain non-merge commit).
 */
export function extractPrNumber(subject: string): string | undefined {
  const squash = subject.match(SQUASH_PR_RE);
  if (squash) return squash[1];

  const merge = subject.match(MERGE_PR_RE);
  if (merge) return merge[1];

  return undefined;
}

export interface ReconcileRecord {
  /** KB files (with .md) this record claims to resolve. */
  files: string[];
  prNumber?: string;
  /** Best-effort ISO date (merge date if known, else commit date). */
  date?: string;
  /** Where this record came from, for logging/debugging. */
  source: string;
}

/**
 * Merges a list of records that may reference overlapping KB files,
 * keeping one entry per file. Later records in `records` win ties (the
 * caller should order `gh pr list` records after `git log` records,
 * since gh has the authoritative PR number + merge date).
 */
export function dedupeByFile(
  records: ReconcileRecord[]
): Map<string, { prNumber?: string; date?: string; source: string }> {
  const byFile = new Map<string, { prNumber?: string; date?: string; source: string }>();

  for (const record of records) {
    for (const file of record.files) {
      byFile.set(file, {
        prNumber: record.prNumber,
        date: record.date,
        source: record.source,
      });
    }
  }

  return byFile;
}
