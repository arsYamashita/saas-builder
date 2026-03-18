/**
 * Gap Detector — Identify template gaps in analyzed ideas
 *
 * Compares required features against available templates
 * to find functionality gaps and suggest new template opportunities.
 */

import type {
  NeedsAnalysis,
  TemplateCatalogAdapter,
} from "../core/types";

export interface GapAnalysis {
  /** Missing functionality relative to templates */
  missingFeatures: string[];
  /** Missing roles/personas in templates */
  missingRoles: string[];
  /** Gap severity (0-100) */
  gapSeverity: number;
  /** Suggested new template description */
  suggestedTemplate: string | null;
}

// ── Gap Detection ────────────────────────────────────────

export async function detectGaps(
  needs: NeedsAnalysis,
  catalog: TemplateCatalogAdapter
): Promise<GapAnalysis> {
  const templates = catalog.listTemplates();

  // Collect all features and roles from available templates
  const allTemplateFeatures = new Set<string>();
  const allTemplateRoles = new Set<string>();

  for (const template of templates) {
    (template.features || []).forEach((f) => allTemplateFeatures.add(f));
    (template.roles || []).forEach((r) => allTemplateRoles.add(r));
  }

  // Find missing items
  const missingFeatures = (needs.requiredFeatures || []).filter(
    (f) => !allTemplateFeatures.has(f)
  );

  const missingRoles = (needs.suggestedRoles || []).filter(
    (r) => !allTemplateRoles.has(r)
  );

  // Calculate gap severity
  const totalRequiredFeatures = needs.requiredFeatures?.length || 1;
  const totalRequiredRoles = needs.suggestedRoles?.length || 1;

  const featureGap = (missingFeatures.length / totalRequiredFeatures) * 50;
  const roleGap = (missingRoles.length / totalRequiredRoles) * 50;

  const gapSeverity = Math.min(100, Math.round(featureGap + roleGap));

  // Suggest new template if gaps are significant
  let suggestedTemplate = null;
  if (gapSeverity > 40) {
    suggestedTemplate = `New template for ${needs.targetUsers}: ${needs.problemStatement}`;
  }

  return {
    missingFeatures,
    missingRoles,
    gapSeverity,
    suggestedTemplate,
  };
}

// ── Gap Report ───────────────────────────────────────────

export function generateGapReport(gap: GapAnalysis): string {
  let report = "";

  if (gap.missingFeatures.length > 0) {
    report += `Missing Features (${gap.missingFeatures.length}):\n`;
    report += gap.missingFeatures.map((f) => `  - ${f}`).join("\n");
    report += "\n\n";
  }

  if (gap.missingRoles.length > 0) {
    report += `Missing Roles (${gap.missingRoles.length}):\n`;
    report += gap.missingRoles.map((r) => `  - ${r}`).join("\n");
    report += "\n\n";
  }

  if (gap.suggestedTemplate) {
    report += `New Template Opportunity:\n${gap.suggestedTemplate}\n\n`;
  }

  report += `Gap Severity: ${gap.gapSeverity}/100`;

  return report;
}

// ── Severity Description ────────────────────────────────

export function describeSeverity(severity: number): string {
  if (severity >= 75) {
    return "Critical - Significant gaps in available templates";
  } else if (severity >= 50) {
    return "Moderate - Notable gaps requiring extension";
  } else if (severity >= 25) {
    return "Minor - Small gaps, mostly compatible";
  } else {
    return "Minimal - Well covered by existing templates";
  }
}
