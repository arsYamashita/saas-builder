/**
 * Template Registry — single source of truth for all template metadata.
 *
 * Structure:
 *   TemplateManifest — pure data type describing one template
 *   TEMPLATE_MANIFESTS — array of all manifests (the canonical list)
 *   TEMPLATE_REGISTRY — Record indexed by templateKey (derived from manifests)
 *   Helper functions — getTemplateEntry, isSupportedTemplate, getTemplateOptions
 *
 * Adding a new template:
 *   1. Add a TemplateManifest to TEMPLATE_MANIFESTS
 *   2. Create prompts at the finalPromptDir path
 *   3. Create rules at the rulesRoot path
 *   4. Create preset at the presetModule path
 *   5. Create fixture + baseline JSON
 *   6. Create regression + compare scripts
 *   7. Add regression script to package.json
 */

// ---------------------------------------------------------------------------
// Prompt kind
// ---------------------------------------------------------------------------

export type PromptKind = "blueprint" | "schema" | "api" | "ui" | "file_split";

// ---------------------------------------------------------------------------
// Template Manifest — pure data, no logic
// ---------------------------------------------------------------------------

export interface TemplateManifest {
  /** Unique identifier stored in DB. e.g. "membership_content_affiliate" */
  templateKey: string;
  /** Human-readable label for UI. */
  label: string;

  /** Directory under prompts/ for final prompts. e.g. "final" or "final/reservation_saas" */
  finalPromptDir: string;
  /** Prompt filenames keyed by PromptKind */
  finalPrompts: Record<PromptKind, string>;
  /** Claude prefix prompt filename (relative to prompts/) */
  prefixPrompt: string;

  /** Directory for template-specific rules. e.g. "docs/rules/reservation_saas" */
  rulesRoot: string;
  /** Test fixture path */
  fixturePath: string;
  /** Baseline documentation path */
  baselineDocPath: string;
  /** Baseline JSON path (canonical for compare scripts) */
  baselineJsonPath: string;
  /** npm script command for regression */
  regressionCommand: string;
  /** Compare script path */
  compareScriptPath: string;
  /** Preset module path (reference only, not imported) */
  presetModule: string;
}

// ---------------------------------------------------------------------------
// Shared prompt filenames (same naming convention across templates)
// ---------------------------------------------------------------------------

const FINAL_PROMPT_FILENAMES: Record<PromptKind, string> = {
  blueprint: "01-blueprint-final.md",
  schema: "02-schema-final.md",
  api: "03-api-final.md",
  ui: "04-ui-final.md",
  file_split: "05-file-split-final.md",
};

// ---------------------------------------------------------------------------
// Manifest definitions — THE canonical list
// ---------------------------------------------------------------------------

export const TEMPLATE_MANIFESTS: TemplateManifest[] = [
  {
    templateKey: "membership_content_affiliate",
    label: "会員サイト + コンテンツ販売 + アフィリエイト",
    finalPromptDir: "final",
    finalPrompts: FINAL_PROMPT_FILENAMES,
    prefixPrompt: "12-claude-membership-template-prefix.md",
    rulesRoot: "docs/rules/membership_content_affiliate",
    fixturePath: "tests/fixtures/membership-content-affiliate-saloncore-first-run.json",
    baselineDocPath: "docs/baselines/membership-content-affiliate-green-v1.md",
    baselineJsonPath: "tests/baselines/membership-content-affiliate-green-v1.json",
    regressionCommand: "npm run regression:mca",
    compareScriptPath: "scripts/compare-mca-baseline.sh",
    presetModule: "lib/templates/membership-content-affiliate.ts",
  },
  {
    templateKey: "reservation_saas",
    label: "予約管理SaaS",
    finalPromptDir: "final/reservation_saas",
    finalPrompts: FINAL_PROMPT_FILENAMES,
    prefixPrompt: "12-claude-membership-template-prefix.md", // TODO: reservation_saas-specific prefix
    rulesRoot: "docs/rules/reservation_saas",
    fixturePath: "tests/fixtures/reservation-saas-first-run.json",
    baselineDocPath: "docs/baselines/reservation-saas-green-v1.md",
    baselineJsonPath: "tests/baselines/reservation-saas-green-v1.json",
    regressionCommand: "npm run regression:rsv",
    compareScriptPath: "scripts/compare-rsv-baseline.sh",
    presetModule: "lib/templates/reservation-saas.ts",
  },
];

// ---------------------------------------------------------------------------
// Derived types and indexed registry
// ---------------------------------------------------------------------------

/** Union of all registered template keys */
export type TemplateKey = (typeof TEMPLATE_MANIFESTS)[number]["templateKey"];

/** Indexed lookup table built from manifests */
export const TEMPLATE_REGISTRY: Record<string, TemplateManifest> =
  Object.fromEntries(TEMPLATE_MANIFESTS.map((m) => [m.templateKey, m]));

/** All supported template keys */
export const SUPPORTED_TEMPLATE_KEYS: string[] = TEMPLATE_MANIFESTS.map(
  (m) => m.templateKey
);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Get a manifest entry. Throws on unsupported key. */
export function getTemplateEntry(templateKey: string): TemplateManifest {
  const entry = TEMPLATE_REGISTRY[templateKey];
  if (!entry) {
    throw new Error(
      `Unsupported template_key: "${templateKey}". Supported: ${SUPPORTED_TEMPLATE_KEYS.join(", ")}`
    );
  }
  return entry;
}

/** Check if a template key is supported */
export function isSupportedTemplate(templateKey: string): boolean {
  return templateKey in TEMPLATE_REGISTRY;
}

/** Template labels for UI dropdowns: [{ key, label }] */
export function getTemplateOptions(): { key: string; label: string }[] {
  return TEMPLATE_MANIFESTS.map((m) => ({
    key: m.templateKey,
    label: m.label,
  }));
}
