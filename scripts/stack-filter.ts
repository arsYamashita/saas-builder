/**
 * Stack filter for the error-KB checklist generator.
 *
 * TypeScript port of the vault-hosted canonical copy at
 * `~/Documents/my-vault/_scripts/kb_checklist/stack-filter.mjs` (extracted
 * 2026-07-06, see error-checklist-core.ts header comment for why this
 * repo keeps a behaviorally-identical copy rather than importing the
 * vault module directly: this file is imported by CI-run unit tests,
 * which run on a GitHub Actions runner that never has the vault mounted).
 *
 * Lets a consuming repo restrict `30_Knowledge/errors/` output to the
 * categories relevant to its own stack (e.g. this Next.js repo should
 * never see Swift/Android-only items, and vice versa) by matching each
 * error item's frontmatter `tags` against a small per-stack tag registry.
 *
 * Design: "closed world" platform filtering.
 *   - If an item has a tag that belongs to the requested stack(s) -> show it.
 *   - Else if an item has a tag that belongs to a *different*, unrequested
 *     stack (i.e. it clearly signals a platform this repo isn't on) -> hide it.
 *   - Else (the item has no platform-signaling tag at all -- e.g. generic
 *     "security" / "idempotency" / "credentials" items) -> always show it,
 *     since those are cross-cutting lessons that apply everywhere.
 */

export const STACK_TAGS: Record<string, string[]> = {
  nextjs: ["nextjs", "next.js", "react", "vercel"],
  react: ["react", "vite", "vercel"],
  node: ["node", "npm", "javascript"],
  supabase: ["supabase", "postgres", "postgresql", "rls", "storage"],
  stripe: ["stripe", "payments"],
  flutter: ["flutter", "dart"],
  android: ["android", "kotlin", "gradle"],
  ios: ["ios", "swift", "xcode"],
  firebase: ["firebase", "firestore"],
  python: ["python"],
};

/** Union of every tag any stack in STACK_TAGS claims -- used to detect a
 * platform mismatch (item signals a stack the caller didn't ask for). */
export const ALL_PLATFORM_TAGS = new Set(
  Object.values(STACK_TAGS).flatMap((tags) => tags)
);

/**
 * Normalizes a comma/whitespace-separated stack string (as passed via
 * `--stack nextjs,supabase` or a `.kb-checklist.json` `"stack"` array)
 * into a lowercase array with empties removed.
 */
export function normalizeStackList(
  raw: string | string[] | undefined | null
): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(",");
  return parts
    .map((s) => String(s).trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** @param stacks Already-normalized (lowercase) stack names. */
export function matchesStack(itemTags: string[], stacks: string[]): boolean {
  if (!stacks || stacks.length === 0) return true; // no filter requested

  const lowerItemTags = itemTags.map((t) => String(t).toLowerCase());

  // A stack name that isn't in the registry is treated as a raw tag to
  // match directly (lets a repo filter on an ad-hoc tag not yet modeled
  // as a "stack", e.g. `--stack anthropic`).
  const requested = new Set(
    stacks.flatMap((s) => STACK_TAGS[s] ?? [s])
  );

  if (lowerItemTags.some((t) => requested.has(t))) return true;

  const signalsOtherPlatform = lowerItemTags.some(
    (t) => ALL_PLATFORM_TAGS.has(t) && !requested.has(t)
  );
  if (signalsOtherPlatform) return false;

  return true; // no platform signal at all -> universal/cross-cutting item
}
