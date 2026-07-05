/**
 * Core (side-effect-free) logic for `npm run kb:resolve`.
 *
 * Flips the `resolved` flag in a single `30_Knowledge/errors/*.md` KB
 * file's YAML frontmatter to `true` and stamps `resolved_by` /
 * `resolved_at`, without touching the Markdown body below the
 * frontmatter block.
 *
 * Exists so this repo can close the loop that produced
 * `startup_env_validation_prod_outage`-style KB drift: PRs that fix a
 * known error pattern rarely go back and flip `resolved: false ->
 * true` in the vault, so M2's nightly scan keeps re-issuing
 * instructions for already-fixed problems. `npm run kb:resolve` (this
 * module) and `npm run kb:reconcile` (scripts/kb-reconcile.ts) are the
 * fix.
 *
 * Handles two frontmatter shapes seen in the vault:
 *   - flat: `resolved: false` at the top level of the frontmatter block
 *   - nested: `resolved: false` indented under a `metadata:` key
 *     (e.g. llm_api_unbounded_text_input.md, tenant_creation_non_transactional_orphan.md)
 * by operating on raw lines and preserving whatever indentation the
 * existing `resolved:` key already uses, rather than parsing/re-emitting
 * YAML (which would risk reformatting content this task must leave
 * untouched).
 *
 * 2026-07-06: this logic was extracted to
 * `~/Documents/my-vault/_scripts/kb_checklist/kb-resolve-core.mjs` (plain,
 * dependency-free Node ESM) so every active repo can resolve KB entries,
 * not just saas-builder. This TS file stays in the repo, behaviorally
 * identical to that copy, because it is imported directly by
 * scripts/__tests__/kb-resolve-core.test.ts, which runs in CI (a GitHub
 * Actions runner that never has the vault mounted) -- see
 * scripts/error-checklist-core.ts's header comment for the full
 * rationale. scripts/kb-resolve.ts (the CLI entry point) is a thin
 * wrapper that delegates to the vault copy at runtime instead.
 */

export interface ResolveOptions {
  /** e.g. `"saas-builder#27"` */
  resolvedBy: string;
  /** ISO date, e.g. `"2026-07-06"` */
  resolvedAt: string;
}

export interface ResolveResult {
  content: string;
  /** False when the file already had this exact resolved_by/resolved_at (no-op, safe to re-run). */
  changed: boolean;
  /** Set when the file was already resolved by someone/something else. */
  previousResolvedBy?: string;
}

const DELIM_RE = /^---\s*$/;
const RESOLVED_RE = /^(\s*)resolved:\s*(.*)$/;
const RESOLVED_BY_RE = /^(\s*)resolved_by:\s*(.*)$/;
const RESOLVED_AT_RE = /^(\s*)resolved_at:\s*(.*)$/;

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^"(.*)"$/);
  return match ? match[1] : trimmed;
}

/**
 * Sets `resolved: true` (plus `resolved_by` / `resolved_at`) in the
 * frontmatter of `content`, leaving everything else — including the
 * entire Markdown body — byte-for-byte identical.
 *
 * Idempotent: calling this twice with the same `opts` on its own output
 * produces `changed: false` on the second call.
 *
 * Throws if `content` has no `---`-delimited frontmatter block at all
 * (that's a malformed KB file, not something this tool should silently
 * "fix" by inventing a frontmatter block).
 */
export function updateFrontmatterResolved(
  content: string,
  opts: ResolveOptions
): ResolveResult {
  const lines = content.split("\n");

  if (lines.length === 0 || !DELIM_RE.test(lines[0])) {
    throw new Error(
      "file does not start with a YAML frontmatter block (expected `---` on line 1)"
    );
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (DELIM_RE.test(lines[i])) {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    throw new Error("unterminated YAML frontmatter block (no closing `---`)");
  }

  const fm = lines.slice(1, closeIdx);
  const rest = lines.slice(closeIdx); // closing `---` line + everything after: untouched

  const quotedBy = quote(opts.resolvedBy);
  const resolvedIdx = fm.findIndex((l) => RESOLVED_RE.test(l));

  let previousResolvedBy: string | undefined;

  if (resolvedIdx === -1) {
    // No pre-existing `resolved:` key. Append a new top-level block just
    // before the closing delimiter rather than guessing at nesting.
    fm.push(`resolved: true`, `resolved_by: ${quotedBy}`, `resolved_at: ${opts.resolvedAt}`);
  } else {
    const indent = RESOLVED_RE.exec(fm[resolvedIdx])![1];
    fm[resolvedIdx] = `${indent}resolved: true`;

    const byIdx = fm.findIndex((l) => RESOLVED_BY_RE.test(l));
    const atIdx = fm.findIndex((l) => RESOLVED_AT_RE.test(l));

    if (byIdx !== -1) {
      previousResolvedBy = unquote(RESOLVED_BY_RE.exec(fm[byIdx])![2]);
      fm[byIdx] = `${indent}resolved_by: ${quotedBy}`;
    }
    if (atIdx !== -1) {
      fm[atIdx] = `${indent}resolved_at: ${opts.resolvedAt}`;
    }

    const insertions: string[] = [];
    if (byIdx === -1) insertions.push(`${indent}resolved_by: ${quotedBy}`);
    if (atIdx === -1) insertions.push(`${indent}resolved_at: ${opts.resolvedAt}`);
    if (insertions.length > 0) {
      fm.splice(resolvedIdx + 1, 0, ...insertions);
    }
  }

  const newContent = [lines[0], ...fm, ...rest].join("\n");
  const changed = newContent !== content;

  return { content: newContent, changed, previousResolvedBy };
}
