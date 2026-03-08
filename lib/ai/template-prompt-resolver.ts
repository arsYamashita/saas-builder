/**
 * Resolves prompt file paths based on template_key.
 *
 * membership_content_affiliate uses existing root prompts (backwards compatible).
 * reservation_saas uses prompts/final/reservation_saas/*.
 *
 * Throws on unsupported templateKey or promptKind.
 */

const SUPPORTED_TEMPLATES = [
  "membership_content_affiliate",
  "reservation_saas",
] as const;

type TemplateKey = (typeof SUPPORTED_TEMPLATES)[number];

type PromptKind = "blueprint" | "schema" | "api" | "ui" | "file_split";

// Final prompt filenames (same naming convention across templates)
const FINAL_PROMPT_FILES: Record<PromptKind, string> = {
  blueprint: "01-blueprint-final.md",
  schema: "02-schema-final.md",
  api: "03-api-final.md",
  ui: "04-ui-final.md",
  file_split: "05-file-split-final.md",
};

// Claude prefix prompt per template (used by implementation route)
const TEMPLATE_PREFIX_FILES: Record<TemplateKey, string> = {
  membership_content_affiliate: "12-claude-membership-template-prefix.md",
  reservation_saas: "12-claude-membership-template-prefix.md", // TODO: create reservation_saas-specific prefix
};

function assertTemplateKey(key: string): asserts key is TemplateKey {
  if (!SUPPORTED_TEMPLATES.includes(key as TemplateKey)) {
    throw new Error(`Unsupported template_key: "${key}". Supported: ${SUPPORTED_TEMPLATES.join(", ")}`);
  }
}

/**
 * Returns the prompt path relative to the prompts/ directory.
 * e.g. "final/02-schema-final.md" or "final/reservation_saas/02-schema-final.md"
 */
export function resolveFinalPromptPath(
  templateKey: string,
  kind: PromptKind
): string {
  assertTemplateKey(templateKey);

  const filename = FINAL_PROMPT_FILES[kind];
  if (!filename) {
    throw new Error(`Unsupported prompt kind: "${kind}"`);
  }

  if (templateKey === "membership_content_affiliate") {
    // MCA uses root final/ prompts (existing behavior, no change)
    return `final/${filename}`;
  }

  // Other templates use final/{templateKey}/
  return `final/${templateKey}/${filename}`;
}

/**
 * Returns the Claude prefix prompt filename (relative to prompts/).
 */
export function resolveTemplatePrefixPath(templateKey: string): string {
  assertTemplateKey(templateKey);
  return TEMPLATE_PREFIX_FILES[templateKey];
}

/**
 * Check if a template key is supported.
 */
export function isSupportedTemplate(templateKey: string): boolean {
  return SUPPORTED_TEMPLATES.includes(templateKey as TemplateKey);
}
