/**
 * Resolves prompt file paths based on template_key.
 * Uses the Template Registry as single source of truth.
 *
 * Throws on unsupported templateKey or promptKind.
 */

import {
  getTemplateEntry,
  isSupportedTemplate,
  type PromptKind,
} from "@/lib/templates/template-registry";

// Re-export for consumers that import from this module
export { isSupportedTemplate };
export type { PromptKind };

/**
 * Returns the prompt path relative to the prompts/ directory.
 * e.g. "final/02-schema-final.md" or "final/reservation_saas/02-schema-final.md"
 */
export function resolveFinalPromptPath(
  templateKey: string,
  kind: PromptKind
): string {
  const entry = getTemplateEntry(templateKey);
  const filename = entry.finalPrompts[kind];
  if (!filename) {
    throw new Error(`Unsupported prompt kind: "${kind}"`);
  }
  return `${entry.finalPromptDir}/${filename}`;
}

/**
 * Returns the Claude prefix prompt filename (relative to prompts/).
 */
export function resolveTemplatePrefixPath(templateKey: string): string {
  const entry = getTemplateEntry(templateKey);
  return entry.prefixPrompt;
}
