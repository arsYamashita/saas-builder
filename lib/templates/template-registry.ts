/**
 * Template Registry — single source of truth for all template metadata.
 *
 * Adding a new template:
 *   1. Add an entry to TEMPLATE_REGISTRY
 *   2. Create prompts at the finalPromptDir path
 *   3. Create rules at the rulesRoot path
 *   4. Create fixture + baseline JSON
 *   5. Create regression + compare scripts
 */

export type PromptKind = "blueprint" | "schema" | "api" | "ui" | "file_split";

export type TemplateKey = "membership_content_affiliate" | "reservation_saas";

export interface TemplateEntry {
  templateKey: TemplateKey;
  label: string;

  /** Directory under prompts/ for final prompts. e.g. "final" or "final/reservation_saas" */
  finalPromptDir: string;
  /** Prompt filenames keyed by PromptKind */
  finalPrompts: Record<PromptKind, string>;
  /** Claude prefix prompt filename (relative to prompts/) */
  prefixPrompt: string;

  rulesRoot: string;
  fixturePath: string;
  baselineDocPath: string;
  baselineJsonPath: string;
  regressionCommand: string;
  compareScriptPath: string;

  /** Reference to preset module. Not an import — just for documentation. */
  presetModule: string;
}

const FINAL_PROMPT_FILENAMES: Record<PromptKind, string> = {
  blueprint: "01-blueprint-final.md",
  schema: "02-schema-final.md",
  api: "03-api-final.md",
  ui: "04-ui-final.md",
  file_split: "05-file-split-final.md",
};

export const TEMPLATE_REGISTRY: Record<TemplateKey, TemplateEntry> = {
  membership_content_affiliate: {
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
  reservation_saas: {
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
};

/** All supported template keys */
export const SUPPORTED_TEMPLATE_KEYS = Object.keys(TEMPLATE_REGISTRY) as TemplateKey[];

/** Get a registry entry. Throws on unsupported key. */
export function getTemplateEntry(templateKey: string): TemplateEntry {
  const entry = TEMPLATE_REGISTRY[templateKey as TemplateKey];
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
export function getTemplateOptions(): { key: TemplateKey; label: string }[] {
  return SUPPORTED_TEMPLATE_KEYS.map((key) => ({
    key,
    label: TEMPLATE_REGISTRY[key].label,
  }));
}
