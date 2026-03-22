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
// Canonical template key list — THE single source of truth for key literals
// ---------------------------------------------------------------------------

/** Add new template keys here. Everything else derives from this. */
const TEMPLATE_KEYS = [
  "membership_content_affiliate",
  "reservation_saas",
  "community_membership_saas",
  "simple_crm_saas",
  "internal_admin_ops_saas",
] as const;

/** Registered template key literal union — derived from TEMPLATE_KEYS. */
export type RegisteredTemplateKey = (typeof TEMPLATE_KEYS)[number];

// ---------------------------------------------------------------------------
// Template Manifest — pure data, no logic
// ---------------------------------------------------------------------------

export interface TemplateManifest {
  /** Unique identifier stored in DB. Must be a member of TEMPLATE_KEYS. */
  templateKey: RegisteredTemplateKey;
  /** Short name for baseline tags. e.g. "mca", "cms" */
  shortName: string;
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
  /** Extra quality gates beyond COMMON_QUALITY_GATES (optional). */
  extraQualityGates?: Array<{
    key: string;
    label: string;
    tool: string;
    required: boolean;
    timeoutMs: number;
  }>;
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
    shortName: "mca",
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
    shortName: "rsv",
    label: "予約管理SaaS",
    finalPromptDir: "final/reservation_saas",
    finalPrompts: FINAL_PROMPT_FILENAMES,
    prefixPrompt: "12-claude-reservation-saas-prefix.md",
    rulesRoot: "docs/rules/reservation_saas",
    fixturePath: "tests/fixtures/reservation-saas-first-run.json",
    baselineDocPath: "docs/baselines/reservation-saas-green-v1.md",
    baselineJsonPath: "tests/baselines/reservation-saas-green-v1.json",
    regressionCommand: "npm run regression:rsv",
    compareScriptPath: "scripts/compare-rsv-baseline.sh",
    presetModule: "lib/templates/reservation-saas.ts",
    extraQualityGates: [
      {
        key: "role_consistency",
        label: "Role Consistency (staff, not member)",
        tool: "role-consistency-check",
        required: true,
        timeoutMs: 10_000,
      },
    ],
  },
  {
    templateKey: "community_membership_saas",
    shortName: "cms",
    label: "コミュニティ会員制SaaS",
    finalPromptDir: "final/community_membership_saas",
    finalPrompts: FINAL_PROMPT_FILENAMES,
    prefixPrompt: "12-claude-community-membership-saas-prefix.md",
    rulesRoot: "docs/rules/community_membership_saas",
    fixturePath: "tests/fixtures/community-membership-saas-first-run.json",
    baselineDocPath: "docs/baselines/community-membership-saas-green-v1.md",
    baselineJsonPath: "tests/baselines/community-membership-saas-green-v1.json",
    regressionCommand: "npm run regression:cms",
    compareScriptPath: "scripts/compare-cms-baseline.sh",
    presetModule: "lib/templates/community-membership-saas.ts",
  },
  {
    templateKey: "simple_crm_saas",
    shortName: "crm",
    label: "シンプルCRM SaaS",
    finalPromptDir: "final/simple_crm_saas",
    finalPrompts: FINAL_PROMPT_FILENAMES,
    prefixPrompt: "12-claude-membership-template-prefix.md",
    rulesRoot: "docs/rules/simple_crm_saas",
    fixturePath: "tests/fixtures/simple-crm-first-run.json",
    baselineDocPath: "docs/baselines/simple-crm-green-v1.md",
    baselineJsonPath: "tests/baselines/simple-crm-green-v1.json",
    regressionCommand: "npm run regression:crm",
    compareScriptPath: "scripts/compare-crm-baseline.sh",
    presetModule: "lib/templates/simple-crm-saas.ts",
    extraQualityGates: [
      {
        key: "role_consistency",
        label: "Role Consistency (sales, not member)",
        tool: "role-consistency-check",
        required: true,
        timeoutMs: 10_000,
      },
    ],
  },
  {
    templateKey: "internal_admin_ops_saas",
    shortName: "iao",
    label: "社内管理オペレーションSaaS",
    finalPromptDir: "final/internal_admin_ops_saas",
    finalPrompts: FINAL_PROMPT_FILENAMES,
    prefixPrompt: "12-claude-membership-template-prefix.md",
    rulesRoot: "docs/rules/internal_admin_ops_saas",
    fixturePath: "tests/fixtures/internal-admin-ops-first-run.json",
    baselineDocPath: "docs/baselines/internal-admin-ops-green-v1.md",
    baselineJsonPath: "tests/baselines/internal-admin-ops-green-v1.json",
    regressionCommand: "npm run regression:iao",
    compareScriptPath: "scripts/compare-iao-baseline.sh",
    presetModule: "lib/templates/internal-admin-ops-saas.ts",
    extraQualityGates: [
      {
        key: "role_consistency",
        label: "Role Consistency (operator, not member)",
        tool: "role-consistency-check",
        required: true,
        timeoutMs: 10_000,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Derived types and indexed registry
// ---------------------------------------------------------------------------

/** Union of all registered template keys (re-export for convenience) */
export type TemplateKey = RegisteredTemplateKey;

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

/** Resolve short name from template key. Used for baseline tags. */
export function getTemplateShortName(templateKey: string): string {
  const entry = TEMPLATE_REGISTRY[templateKey];
  return entry?.shortName ?? templateKey.slice(0, 6);
}

/** All registered template keys as a string array (for zod enum derivation). */
export function getRegisteredTemplateKeys(): [string, ...string[]] {
  const keys = TEMPLATE_MANIFESTS.map((m) => m.templateKey);
  if (keys.length === 0) throw new Error("No templates registered");
  return keys as [string, ...string[]];
}
