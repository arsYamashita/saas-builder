/**
 * Template Regression Config — declarative per-template regression settings.
 *
 * Each GREEN template can declare regression-specific behavior:
 * - baseline comparison
 * - quality gates
 * - template smoke tests
 * - runtime verification
 *
 * Adding regression config for a new template:
 *   1. Add a TemplateRegressionConfig entry to REGRESSION_CONFIG_REGISTRY
 *   2. Ensure baseline JSON exists at the baselineJsonPath from manifest
 *   3. Ensure fixture JSON exists at the fixturePath from manifest
 */

import {
  TEMPLATE_REGISTRY,
  type TemplateManifest,
} from "@/lib/templates/template-registry";
import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";

// ---------------------------------------------------------------------------
// Config type
// ---------------------------------------------------------------------------

export interface TemplateRegressionConfig {
  templateKey: string;
  /** Run quality gates after pipeline */
  qualityGates: boolean;
  /** Run baseline comparison */
  baselineCompare: boolean;
  /** Run template-specific Playwright smoke tests */
  templateSmoke: boolean;
  /** Run runtime verification (e.g. server start, health check) */
  runtimeVerification: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const REGRESSION_CONFIG_REGISTRY: TemplateRegressionConfig[] = [
  {
    templateKey: "membership_content_affiliate",
    qualityGates: true,
    baselineCompare: true,
    templateSmoke: true,
    runtimeVerification: false,
  },
  {
    templateKey: "reservation_saas",
    qualityGates: true,
    baselineCompare: true,
    templateSmoke: true,
    runtimeVerification: true,
  },
  {
    templateKey: "community_membership_saas",
    qualityGates: true,
    baselineCompare: true,
    templateSmoke: true,
    runtimeVerification: false,
  },
  {
    templateKey: "simple_crm_saas",
    qualityGates: true,
    baselineCompare: true,
    templateSmoke: true,
    runtimeVerification: false,
  },
  {
    templateKey: "internal_admin_ops_saas",
    qualityGates: true,
    baselineCompare: true,
    templateSmoke: true,
    runtimeVerification: true,
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const CONFIG_MAP = new Map(
  REGRESSION_CONFIG_REGISTRY.map((c) => [c.templateKey, c])
);

/** Get regression config for a template. Returns default if not registered. */
export function getTemplateRegressionConfig(
  templateKey: string
): TemplateRegressionConfig {
  return (
    CONFIG_MAP.get(templateKey) ?? {
      templateKey,
      qualityGates: true,
      baselineCompare: true,
      templateSmoke: false,
      runtimeVerification: false,
    }
  );
}

/** Resolved template info for regression — manifest + catalog + config. */
export interface ResolvedRegressionTemplate {
  templateKey: string;
  shortName: string;
  label: string;
  manifest: TemplateManifest;
  catalog: TemplateCatalogEntry;
  config: TemplateRegressionConfig;
}

/** Resolve all GREEN templates with their regression config. */
export function resolveGreenTemplatesForRegression(): ResolvedRegressionTemplate[] {
  return TEMPLATE_CATALOG
    .filter((c) => c.statusBadge === "GREEN")
    .map((catalog) => {
      const manifest = TEMPLATE_REGISTRY[catalog.templateKey];
      if (!manifest) return null;
      return {
        templateKey: catalog.templateKey,
        shortName: manifest.shortName,
        label: catalog.label,
        manifest,
        catalog,
        config: getTemplateRegressionConfig(catalog.templateKey),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null);
}

/** Resolve specific templates by key list. */
export function resolveTemplatesForRegression(
  templateKeys: string[]
): ResolvedRegressionTemplate[] {
  return templateKeys
    .map((tk) => {
      const manifest = TEMPLATE_REGISTRY[tk];
      const catalog = TEMPLATE_CATALOG.find((c) => c.templateKey === tk);
      if (!manifest || !catalog) return null;
      return {
        templateKey: tk,
        shortName: manifest.shortName,
        label: catalog.label,
        manifest,
        catalog,
        config: getTemplateRegressionConfig(tk),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null);
}
