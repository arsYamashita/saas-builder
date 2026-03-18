/**
 * Template Recommendation Engine v1
 *
 * Provides:
 *   1. Deterministic template recommendations from existing analytics/ranking data
 *   2. Recommendation by use case / intent
 *   3. Recommendation by domain
 *   4. Best derivation parent identification
 *   5. Underused but high-quality template surfacing
 *   6. Rising template detection
 *   7. Safest production template identification
 *
 * Read-only. No template state mutation. No ML. No external APIs.
 * All recommendations are explainable and deterministic.
 */

import {
  buildTemplateRankingReport,
  type TemplateAnalytics,
  type TemplateRankingReport,
} from "./template-analytics-ranking";
import {
  buildMarketplaceReport,
  type MarketplaceReport,
} from "./template-marketplace";
import {
  buildDerivationReport,
  type DerivationReport,
} from "./marketplace-derivation-pipeline";
import {
  buildTemplateReleaseReport,
  type TemplateReleaseReport,
} from "./template-release-management";
import {
  TEMPLATE_DOMAIN_MAP,
  type TemplateDomain,
} from "./template-evolution-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecommendationType =
  | "by_domain"
  | "by_use_case"
  | "best_derivation_parent"
  | "safest_production_template"
  | "underused_high_quality"
  | "rising_template";

export type UseCaseCategory =
  | "booking"
  | "crm"
  | "community"
  | "operations"
  | "education"
  | "marketplace"
  | "finance"
  | "support";

export interface RecommendationRecord {
  recommendationType: RecommendationType;
  useCase: UseCaseCategory | null;
  domain: string | null;
  templateId: string;
  label: string;
  score: number;
  confidence: number;
  reasons: string[];
  alternatives: string[];
}

export interface RecommendationReport {
  byUseCase: Record<UseCaseCategory, RecommendationRecord[]>;
  byDomain: Record<string, RecommendationRecord[]>;
  bestDerivationParents: RecommendationRecord[];
  safestProductionTemplates: RecommendationRecord[];
  underusedHighQuality: RecommendationRecord[];
  risingTemplates: RecommendationRecord[];
  summary: {
    totalRecommendations: number;
    useCasesCovered: number;
    domainsCovered: number;
    bestDerivationParentCount: number;
    underusedCount: number;
    risingCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Use Case → Domain Mapping
// ---------------------------------------------------------------------------

export const USE_CASE_DOMAINS: Record<UseCaseCategory, TemplateDomain[]> = {
  booking: ["reservation"],
  crm: ["crm"],
  community: ["community", "membership"],
  operations: ["operations"],
  education: ["community", "membership"],
  marketplace: ["marketplace", "commerce"],
  finance: ["finance", "commerce"],
  support: ["support", "operations"],
};

export const ALL_USE_CASES: UseCaseCategory[] = [
  "booking",
  "crm",
  "community",
  "operations",
  "education",
  "marketplace",
  "finance",
  "support",
];

// ---------------------------------------------------------------------------
// Scoring Weights for Recommendation
// ---------------------------------------------------------------------------

const RECOMMENDATION_WEIGHTS = {
  overallRank: 0.30,
  health: 0.25,
  stability: 0.20,
  marketplaceMaturity: 0.10,
  derivationReadiness: 0.10,
  releaseStage: 0.05,
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function getTemplateDomains(templateId: string): TemplateDomain[] {
  return TEMPLATE_DOMAIN_MAP[templateId] ?? [];
}

function computeRecommendationScore(
  analytics: TemplateAnalytics,
  releaseStageScore: number,
): number {
  const score =
    analytics.overallRankScore * RECOMMENDATION_WEIGHTS.overallRank +
    analytics.healthScore * RECOMMENDATION_WEIGHTS.health +
    analytics.stabilityScore * RECOMMENDATION_WEIGHTS.stability +
    analytics.marketplaceMaturityScore * RECOMMENDATION_WEIGHTS.marketplaceMaturity +
    analytics.derivationReadinessScore * RECOMMENDATION_WEIGHTS.derivationReadiness +
    releaseStageScore * RECOMMENDATION_WEIGHTS.releaseStage;

  return Math.round(score * 100) / 100;
}

function computeConfidence(analytics: TemplateAnalytics): number {
  let confidence = 0.5;

  if (analytics.healthState === "green") confidence += 0.2;
  if (analytics.stabilityScore >= 0.8) confidence += 0.1;
  if (analytics.marketplaceMaturityScore >= 0.8) confidence += 0.1;
  if (analytics.overallRankScore >= 0.7) confidence += 0.1;

  return Math.min(Math.round(confidence * 100) / 100, 1.0);
}

function getReleaseStageScore(
  templateId: string,
  releaseReport: TemplateReleaseReport,
): number {
  const entry = releaseReport.catalog.find((e) => e.templateId === templateId);
  if (!entry) return 0;
  switch (entry.stage) {
    case "prod": return 1.0;
    case "staging": return 0.7;
    case "dev": return 0.4;
    case "candidate": return 0.1;
    default: return 0;
  }
}

function buildReasons(
  analytics: TemplateAnalytics,
  releaseStageScore: number,
  extra?: string[],
): string[] {
  const reasons: string[] = [];

  if (analytics.healthState === "green") {
    reasons.push("green and production-ready");
  } else {
    reasons.push(`health state: ${analytics.healthState}`);
  }

  if (analytics.overallRankScore >= 0.8) {
    reasons.push("highest overall rank tier");
  } else if (analytics.overallRankScore >= 0.6) {
    reasons.push("above-average overall rank");
  }

  if (analytics.stabilityScore >= 0.8) {
    reasons.push("stable regression history");
  }

  if (analytics.marketplaceMaturityScore >= 0.8) {
    reasons.push("high marketplace maturity");
  }

  if (analytics.derivationReadinessScore >= 0.8) {
    reasons.push("high derivation readiness");
  }

  if (releaseStageScore >= 0.7) {
    reasons.push("advanced release stage");
  }

  if (analytics.adoptionIntentCount > 0) {
    reasons.push(`${analytics.adoptionIntentCount} adoption intent(s)`);
  }

  if (analytics.derivationIntentCount > 0) {
    reasons.push(`${analytics.derivationIntentCount} derivation intent(s)`);
  }

  if (extra) {
    reasons.push(...extra);
  }

  return reasons;
}

function findAlternatives(
  candidates: TemplateAnalytics[],
  primaryId: string,
  maxAlternatives: number = 3,
): string[] {
  return candidates
    .filter((c) => c.templateId !== primaryId)
    .slice(0, maxAlternatives)
    .map((c) => c.templateId);
}

// ---------------------------------------------------------------------------
// Data Collection
// ---------------------------------------------------------------------------

interface RecommendationInputs {
  rankingReport: TemplateRankingReport;
  marketplaceReport: MarketplaceReport;
  derivationReport: DerivationReport;
  releaseReport: TemplateReleaseReport;
}

function collectInputs(overrides?: Partial<RecommendationInputs>): RecommendationInputs {
  return {
    rankingReport: overrides?.rankingReport ?? buildTemplateRankingReport(),
    marketplaceReport: overrides?.marketplaceReport ?? buildMarketplaceReport(),
    derivationReport: overrides?.derivationReport ?? buildDerivationReport(),
    releaseReport: overrides?.releaseReport ?? buildTemplateReleaseReport(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recommend templates for a specific domain.
 * Returns ranked list of templates matching the domain.
 */
export function recommendTemplatesByDomain(
  domain: string,
  overrides?: Partial<RecommendationInputs>,
): RecommendationRecord[] {
  const inputs = collectInputs(overrides);
  const { rankingReport, releaseReport } = inputs;

  const domainTemplates = rankingReport.rankings.filter((a) => {
    const domains = getTemplateDomains(a.templateId);
    return domains.includes(domain as TemplateDomain) || a.domain.includes(domain);
  });

  const sorted = [...domainTemplates].sort(
    (a, b) => b.overallRankScore - a.overallRankScore,
  );

  return sorted.map((analytics) => {
    const releaseStageScore = getReleaseStageScore(analytics.templateId, releaseReport);
    const score = computeRecommendationScore(analytics, releaseStageScore);
    const confidence = computeConfidence(analytics);

    return {
      recommendationType: "by_domain" as RecommendationType,
      useCase: null,
      domain,
      templateId: analytics.templateId,
      label: analytics.label,
      score,
      confidence,
      reasons: buildReasons(analytics, releaseStageScore, [
        `strongest in "${domain}" domain`,
      ]),
      alternatives: findAlternatives(sorted, analytics.templateId),
    };
  });
}

/**
 * Recommend templates for a specific use case.
 * Maps use case to domains and returns best matches.
 */
export function recommendTemplatesByUseCase(
  useCase: UseCaseCategory,
  overrides?: Partial<RecommendationInputs>,
): RecommendationRecord[] {
  const domains = USE_CASE_DOMAINS[useCase];
  if (!domains || domains.length === 0) return [];

  const inputs = collectInputs(overrides);
  const { rankingReport, releaseReport } = inputs;

  const matchingTemplates = rankingReport.rankings.filter((a) => {
    const templateDomains = getTemplateDomains(a.templateId);
    return domains.some((d) => templateDomains.includes(d));
  });

  const sorted = [...matchingTemplates].sort(
    (a, b) => b.overallRankScore - a.overallRankScore,
  );

  return sorted.map((analytics) => {
    const releaseStageScore = getReleaseStageScore(analytics.templateId, releaseReport);
    const score = computeRecommendationScore(analytics, releaseStageScore);
    const confidence = computeConfidence(analytics);

    return {
      recommendationType: "by_use_case" as RecommendationType,
      useCase,
      domain: analytics.domain,
      templateId: analytics.templateId,
      label: analytics.label,
      score,
      confidence,
      reasons: buildReasons(analytics, releaseStageScore, [
        `best match for "${useCase}" use case`,
        `mapped domains: ${domains.join(", ")}`,
      ]),
      alternatives: findAlternatives(sorted, analytics.templateId),
    };
  });
}

/**
 * Recommend best derivation parents.
 * Favors green, stable templates with high derivation readiness.
 */
export function recommendBestDerivationParents(
  overrides?: Partial<RecommendationInputs>,
): RecommendationRecord[] {
  const inputs = collectInputs(overrides);
  const { rankingReport, releaseReport, derivationReport } = inputs;

  // Score by derivation-specific criteria
  const scored = rankingReport.rankings.map((analytics) => {
    let derivScore = 0;

    if (analytics.healthState === "green") derivScore += 0.30;
    derivScore += analytics.stabilityScore * 0.25;
    derivScore += analytics.derivationReadinessScore * 0.25;
    derivScore += analytics.overallRankScore * 0.10;
    derivScore += analytics.marketplaceMaturityScore * 0.10;

    // Boost if existing derivation interest
    if (analytics.derivationIntentCount > 0) {
      derivScore = Math.min(derivScore + 0.05 * analytics.derivationIntentCount, 1.0);
    }

    // Boost if has active derivation plans
    const hasPlans = derivationReport.plans.some(
      (p) => p.parentTemplateId === analytics.templateId && p.status !== "skipped",
    );
    if (hasPlans) derivScore = Math.min(derivScore + 0.05, 1.0);

    return { analytics, derivScore };
  });

  const sorted = scored
    .filter((s) => s.analytics.healthState === "green" || s.analytics.healthState === "at_risk")
    .sort((a, b) => b.derivScore - a.derivScore);

  return sorted.map(({ analytics, derivScore }) => {
    const releaseStageScore = getReleaseStageScore(analytics.templateId, releaseReport);
    const score = Math.round(derivScore * 100) / 100;
    const confidence = computeConfidence(analytics);

    return {
      recommendationType: "best_derivation_parent" as RecommendationType,
      useCase: null,
      domain: analytics.domain,
      templateId: analytics.templateId,
      label: analytics.label,
      score,
      confidence,
      reasons: buildReasons(analytics, releaseStageScore, [
        "recommended as derivation parent",
      ]),
      alternatives: findAlternatives(
        sorted.map((s) => s.analytics),
        analytics.templateId,
      ),
    };
  });
}

/**
 * Recommend underused but high-quality templates.
 * Identifies templates with strong health/stability/rank but low adoption.
 */
export function recommendUnderusedHighQualityTemplates(
  overrides?: Partial<RecommendationInputs>,
): RecommendationRecord[] {
  const inputs = collectInputs(overrides);
  const { rankingReport, releaseReport } = inputs;

  const underused = rankingReport.rankings.filter((a) => {
    const isHighQuality =
      a.healthScore >= 0.7 &&
      a.stabilityScore >= 0.6 &&
      a.overallRankScore >= 0.5;
    const isLowAdoption = a.adoptionIntentCount === 0;
    return isHighQuality && isLowAdoption;
  });

  const sorted = [...underused].sort(
    (a, b) => b.overallRankScore - a.overallRankScore,
  );

  return sorted.map((analytics) => {
    const releaseStageScore = getReleaseStageScore(analytics.templateId, releaseReport);
    const score = computeRecommendationScore(analytics, releaseStageScore);
    const confidence = computeConfidence(analytics);

    return {
      recommendationType: "underused_high_quality" as RecommendationType,
      useCase: null,
      domain: analytics.domain,
      templateId: analytics.templateId,
      label: analytics.label,
      score,
      confidence,
      reasons: buildReasons(analytics, releaseStageScore, [
        "high quality but no adoption intents",
        "potential growth opportunity",
      ]),
      alternatives: findAlternatives(sorted, analytics.templateId),
    };
  });
}

/**
 * Recommend safest templates for production use.
 * Favors green, stable, production_ready templates at advanced release stages.
 */
export function recommendSafestProductionTemplates(
  overrides?: Partial<RecommendationInputs>,
): RecommendationRecord[] {
  const inputs = collectInputs(overrides);
  const { rankingReport, releaseReport } = inputs;

  const prodCandidates = rankingReport.rankings.filter((a) => {
    return a.healthState === "green" && a.stabilityScore >= 0.7;
  });

  const scored = prodCandidates.map((analytics) => {
    const releaseStageScore = getReleaseStageScore(analytics.templateId, releaseReport);
    let prodScore =
      analytics.healthScore * 0.30 +
      analytics.stabilityScore * 0.30 +
      analytics.marketplaceMaturityScore * 0.15 +
      releaseStageScore * 0.15 +
      analytics.overallRankScore * 0.10;
    prodScore = Math.round(prodScore * 100) / 100;
    return { analytics, prodScore, releaseStageScore };
  });

  const sorted = scored.sort((a, b) => b.prodScore - a.prodScore);

  return sorted.map(({ analytics, prodScore, releaseStageScore }) => {
    const confidence = computeConfidence(analytics);

    return {
      recommendationType: "safest_production_template" as RecommendationType,
      useCase: null,
      domain: analytics.domain,
      templateId: analytics.templateId,
      label: analytics.label,
      score: prodScore,
      confidence,
      reasons: buildReasons(analytics, releaseStageScore, [
        "safest for production deployment",
      ]),
      alternatives: findAlternatives(
        sorted.map((s) => s.analytics),
        analytics.templateId,
      ),
    };
  });
}

/**
 * Recommend rising templates (trending upward).
 */
export function recommendRisingTemplates(
  overrides?: Partial<RecommendationInputs>,
): RecommendationRecord[] {
  const inputs = collectInputs(overrides);
  const { rankingReport, releaseReport } = inputs;

  const rising = rankingReport.rankings.filter((a) => a.trend === "rising");

  const sorted = [...rising].sort(
    (a, b) => b.overallRankScore - a.overallRankScore,
  );

  return sorted.map((analytics) => {
    const releaseStageScore = getReleaseStageScore(analytics.templateId, releaseReport);
    const score = computeRecommendationScore(analytics, releaseStageScore);
    const confidence = computeConfidence(analytics);

    return {
      recommendationType: "rising_template" as RecommendationType,
      useCase: null,
      domain: analytics.domain,
      templateId: analytics.templateId,
      label: analytics.label,
      score,
      confidence,
      reasons: buildReasons(analytics, releaseStageScore, [
        "trending upward",
        `trend: ${analytics.trend}`,
      ]),
      alternatives: findAlternatives(sorted, analytics.templateId),
    };
  });
}

/**
 * Build all recommendations across all types.
 */
export function buildTemplateRecommendations(
  overrides?: Partial<RecommendationInputs>,
): {
  byUseCase: Record<UseCaseCategory, RecommendationRecord[]>;
  byDomain: Record<string, RecommendationRecord[]>;
  bestDerivationParents: RecommendationRecord[];
  safestProductionTemplates: RecommendationRecord[];
  underusedHighQuality: RecommendationRecord[];
  risingTemplates: RecommendationRecord[];
} {
  const inputs = collectInputs(overrides);

  // By use case
  const byUseCase = {} as Record<UseCaseCategory, RecommendationRecord[]>;
  for (const uc of ALL_USE_CASES) {
    byUseCase[uc] = recommendTemplatesByUseCase(uc, inputs);
  }

  // By domain (all domains that have templates)
  const allDomains = new Set<string>();
  for (const domains of Object.values(TEMPLATE_DOMAIN_MAP)) {
    for (const d of domains) allDomains.add(d);
  }
  const byDomain: Record<string, RecommendationRecord[]> = {};
  for (const domain of Array.from(allDomains)) {
    const recs = recommendTemplatesByDomain(domain, inputs);
    if (recs.length > 0) {
      byDomain[domain] = recs;
    }
  }

  return {
    byUseCase,
    byDomain,
    bestDerivationParents: recommendBestDerivationParents(inputs),
    safestProductionTemplates: recommendSafestProductionTemplates(inputs),
    underusedHighQuality: recommendUnderusedHighQualityTemplates(inputs),
    risingTemplates: recommendRisingTemplates(inputs),
  };
}

/**
 * Build a full recommendation report with summary.
 */
export function buildTemplateRecommendationReport(
  overrides?: Partial<RecommendationInputs>,
): RecommendationReport {
  const recs = buildTemplateRecommendations(overrides);

  let totalRecommendations = 0;
  const useCasesCovered = Object.values(recs.byUseCase).filter((v) => v.length > 0).length;
  const domainsCovered = Object.keys(recs.byDomain).length;

  // Count all unique recommendations
  const seen = new Set<string>();
  const countUnique = (records: RecommendationRecord[]) => {
    for (const r of records) {
      const key = `${r.recommendationType}:${r.templateId}:${r.useCase ?? ""}:${r.domain ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        totalRecommendations++;
      }
    }
  };

  for (const records of Object.values(recs.byUseCase)) countUnique(records);
  for (const records of Object.values(recs.byDomain)) countUnique(records);
  countUnique(recs.bestDerivationParents);
  countUnique(recs.safestProductionTemplates);
  countUnique(recs.underusedHighQuality);
  countUnique(recs.risingTemplates);

  return {
    ...recs,
    summary: {
      totalRecommendations,
      useCasesCovered,
      domainsCovered,
      bestDerivationParentCount: recs.bestDerivationParents.length,
      underusedCount: recs.underusedHighQuality.length,
      risingCount: recs.risingTemplates.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatRecommendationRecord(rec: RecommendationRecord): string {
  const lines: string[] = [];
  lines.push(`  [${rec.recommendationType}] ${rec.templateId}`);
  lines.push(`    Label: ${rec.label}`);
  if (rec.useCase) lines.push(`    Use Case: ${rec.useCase}`);
  if (rec.domain) lines.push(`    Domain: ${rec.domain}`);
  lines.push(`    Score: ${rec.score}  Confidence: ${rec.confidence}`);
  lines.push(`    Reasons: ${rec.reasons.join("; ")}`);
  if (rec.alternatives.length > 0) {
    lines.push(`    Alternatives: ${rec.alternatives.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatRecommendationReport(report: RecommendationReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push("  TEMPLATE RECOMMENDATION REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalRecommendations}  |  ` +
    `Use Cases: ${report.summary.useCasesCovered}  |  ` +
    `Domains: ${report.summary.domainsCovered}  |  ` +
    `Derivation Parents: ${report.summary.bestDerivationParentCount}  |  ` +
    `Underused: ${report.summary.underusedCount}  |  ` +
    `Rising: ${report.summary.risingCount}`,
  );

  // By Use Case
  for (const [uc, recs] of Object.entries(report.byUseCase)) {
    if (recs.length === 0) continue;
    lines.push("");
    lines.push(`  USE CASE: ${uc}`);
    for (const rec of recs) {
      lines.push(formatRecommendationRecord(rec));
    }
  }

  // Best Derivation Parents
  if (report.bestDerivationParents.length > 0) {
    lines.push("");
    lines.push("  BEST DERIVATION PARENTS:");
    for (const rec of report.bestDerivationParents) {
      lines.push(formatRecommendationRecord(rec));
    }
  }

  // Safest Production
  if (report.safestProductionTemplates.length > 0) {
    lines.push("");
    lines.push("  SAFEST PRODUCTION TEMPLATES:");
    for (const rec of report.safestProductionTemplates) {
      lines.push(formatRecommendationRecord(rec));
    }
  }

  // Underused High Quality
  if (report.underusedHighQuality.length > 0) {
    lines.push("");
    lines.push("  UNDERUSED HIGH-QUALITY:");
    for (const rec of report.underusedHighQuality) {
      lines.push(formatRecommendationRecord(rec));
    }
  }

  // Rising
  if (report.risingTemplates.length > 0) {
    lines.push("");
    lines.push("  RISING TEMPLATES:");
    for (const rec of report.risingTemplates) {
      lines.push(formatRecommendationRecord(rec));
    }
  }

  lines.push(hr);
  return lines.join("\n");
}
