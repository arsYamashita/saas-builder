/**
 * Template Matcher — Match ideas to existing templates
 *
 * Finds best matching templates based on required features and roles.
 * Scores based on overlap and compatibility.
 */

import type {
  NeedsAnalysis,
  TemplateCatalogAdapter,
  TemplateMatch,
} from "../core/types";

// ── Template Matching ────────────────────────────────────

export interface TemplateMatchResult {
  templateKey: string;
  domain: string;
  confidence: number; // 0-100
  featureOverlap: string[];
  missingFeatures: string[];
  roleCompatibility: string[];
  missingRoles: string[];
}

export async function matchTemplate(
  needs: NeedsAnalysis,
  catalog: TemplateCatalogAdapter
): Promise<TemplateMatchResult[]> {
  const templates = catalog.listTemplates();
  const requiredFeatures = new Set(needs.requiredFeatures || []);
  const requiredRoles = new Set(needs.suggestedRoles || []);

  const matches: TemplateMatchResult[] = [];

  for (const template of templates) {
    // Calculate feature overlap
    const templateFeatures = new Set(template.features || []);
    const overlapFeatures = Array.from(requiredFeatures).filter((f) =>
      templateFeatures.has(f)
    );

    // Calculate role compatibility
    const templateRoles = new Set(template.roles || []);
    const compatibleRoles = Array.from(requiredRoles).filter((r) =>
      templateRoles.has(r)
    );

    // Score the match
    const featureScore = calculateFeatureScore(
      overlapFeatures.length,
      requiredFeatures.size,
      templateFeatures.size
    );

    const roleScore = calculateRoleScore(
      compatibleRoles.length,
      requiredRoles.size,
      templateRoles.size
    );

    const totalScore = featureScore * 0.6 + roleScore * 0.4;

    if (totalScore > 0.1) {
      // Only include if there's some overlap
      matches.push({
        templateKey: template.key,
        domain: template.domain,
        confidence: Math.round(totalScore * 100),
        featureOverlap: overlapFeatures,
        missingFeatures: Array.from(requiredFeatures).filter(
          (f) => !templateFeatures.has(f)
        ),
        roleCompatibility: compatibleRoles,
        missingRoles: Array.from(requiredRoles).filter(
          (r) => !templateRoles.has(r)
        ),
      });
    }
  }

  // Sort by confidence score (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}

// ── Feature Scoring ─────────────────────────────────────

function calculateFeatureScore(
  overlap: number,
  requiredCount: number,
  templateCount: number
): number {
  if (requiredCount === 0 || templateCount === 0) {
    return 0;
  }

  // Jaccard similarity: intersection / union
  const union = requiredCount + templateCount - overlap;
  return overlap / union;
}

// ── Role Compatibility Scoring ──────────────────────────

function calculateRoleScore(
  compatible: number,
  requiredCount: number,
  templateCount: number
): number {
  if (requiredCount === 0 || templateCount === 0) {
    return 0;
  }

  // Similar to Jaccard but also consider if template has more roles
  const union = requiredCount + templateCount - compatible;
  const baseScore = compatible / union;

  // Bonus if template has extra roles (supports more use cases)
  const templateExtra = Math.max(0, templateCount - requiredCount);
  const extraBonus = Math.min(templateExtra * 0.05, 0.15);

  return Math.min(1, baseScore + extraBonus);
}

// ── Match Report ────────────────────────────────────────

export function generateMatchReport(matches: TemplateMatchResult[]): string {
  if (matches.length === 0) {
    return "No matching templates found.";
  }

  let report = "Template Matches:\n";

  for (let i = 0; i < Math.min(3, matches.length); i++) {
    const match = matches[i];
    report += `\n${i + 1}. ${match.templateKey} (${match.confidence}% match)\n`;
    report += `   Domain: ${match.domain}\n`;
    report += `   Overlapping Features: ${match.featureOverlap.join(", ") || "none"}\n`;
    report += `   Missing Features: ${match.missingFeatures.join(", ") || "none"}\n`;
    report += `   Compatible Roles: ${match.roleCompatibility.join(", ") || "none"}\n`;
  }

  return report;
}

// ── Find best match ─────────────────────────────────────

export function getBestMatch(
  matches: TemplateMatchResult[]
): TemplateMatchResult | null {
  return matches.length > 0 ? matches[0] : null;
}
