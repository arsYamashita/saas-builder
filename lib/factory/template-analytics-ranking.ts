/**
 * Template Analytics / Ranking v1
 *
 * Provides:
 *   1. Per-template analytics computed from existing Factory signals
 *   2. Deterministic ranking with stable tie-breakers
 *   3. Filtering / sorting by analytics dimensions
 *   4. Trend classification (rising / stable / declining)
 *   5. Marketplace-friendly ranking report
 *
 * Read-only — does NOT modify template or marketplace state.
 */

import {
  buildMarketplaceCatalog,
  buildMarketplaceReport,
  type MarketplaceItem,
  type MarketplaceReport,
} from "./template-marketplace";

import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
  type TemplateGovernanceResult,
} from "./template-health-governance";

import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";

import {
  buildDerivationReport,
  type DerivationReport,
} from "./marketplace-derivation-pipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsTrend = "rising" | "stable" | "declining";

export type AnalyticsSortKey =
  | "overallRankScore"
  | "healthScore"
  | "stabilityScore"
  | "adoptionIntentCount"
  | "derivationIntentCount"
  | "derivationReadinessScore"
  | "marketplaceMaturityScore";

export interface TemplateAnalytics {
  templateId: string;
  label: string;
  domain: string;
  healthState: string;
  marketplaceStatus: string;
  healthScore: number;
  stabilityScore: number;
  adoptionIntentCount: number;
  derivationIntentCount: number;
  derivationReadinessScore: number;
  marketplaceMaturityScore: number;
  overallRankScore: number;
  trend: AnalyticsTrend;
  reasons: string[];
}

export interface TemplateAnalyticsFilters {
  healthState?: string;
  domain?: string;
  status?: string;
  trend?: AnalyticsTrend;
}

export interface TemplateRankingReport {
  rankings: TemplateAnalytics[];
  topRanked: TemplateAnalytics[];
  bestDerivationParents: TemplateAnalytics[];
  underusedHealthy: TemplateAnalytics[];
  summary: {
    totalTemplates: number;
    risingCount: number;
    stableCount: number;
    decliningCount: number;
    averageOverallScore: number;
    averageHealthScore: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Scoring weights (deterministic, fixed for v1)
// ---------------------------------------------------------------------------

const WEIGHTS = {
  health: 0.30,
  stability: 0.25,
  adoptionIntent: 0.15,
  derivationIntent: 0.10,
  derivationReadiness: 0.10,
  marketplaceMaturity: 0.10,
} as const;

// ---------------------------------------------------------------------------
// Helpers — score computation
// ---------------------------------------------------------------------------

function healthStateToScore(state: string): number {
  switch (state) {
    case "green": return 1.0;
    case "at_risk": return 0.6;
    case "degraded": return 0.3;
    case "demoted": return 0.1;
    case "candidate": return 0.5;
    default: return 0.0;
  }
}

function computeStabilityScore(governance: TemplateGovernanceResult): number {
  const { recentPassCount, recentFailCount, recentDegradedCount } =
    governance.signals;

  const total = recentPassCount + recentFailCount + recentDegradedCount;
  if (total === 0) return 0.5; // no data → neutral

  // Base: pass ratio
  const passRatio = recentPassCount / total;

  // Penalty for degraded/fail
  const degradedPenalty = recentDegradedCount * 0.05;
  const failPenalty = recentFailCount * 0.1;

  // Bonus for consecutive passes
  const consecutiveBonus = governance.signals.consecutivePassCount >= 3 ? 0.1 : 0;

  return Math.max(0, Math.min(1, passRatio - degradedPenalty - failPenalty + consecutiveBonus));
}

function normalizeIntentCount(count: number, maxExpected: number): number {
  if (count <= 0) return 0;
  return Math.min(1, count / maxExpected);
}

function computeDerivationReadinessScore(
  item: MarketplaceItem,
  governance: TemplateGovernanceResult,
): number {
  let score = 0;

  // Published
  if (item.status === "published") score += 0.3;
  else if (item.status === "experimental") score += 0.1;

  // Green health
  if (governance.nextState === "green") score += 0.3;
  else if (governance.nextState === "at_risk") score += 0.1;

  // Production ready maturity
  if (item.maturity === "production_ready") score += 0.2;

  // Has derivation hints
  if (item.derivationHints.length > 0) score += 0.1;

  // Green criteria eligible
  if (governance.signals.greenCriteriaEligible) score += 0.1;

  return Math.min(1, score);
}

function computeMarketplaceMaturityScore(
  item: MarketplaceItem,
  governance: TemplateGovernanceResult,
): number {
  let score = 0;

  // Publication status
  if (item.status === "published") score += 0.35;
  else if (item.status === "experimental") score += 0.15;

  // Health state
  if (governance.nextState === "green") score += 0.25;
  else if (governance.nextState === "at_risk") score += 0.1;

  // Stability indicators
  if (governance.signals.latestBaselinePassed) score += 0.15;
  if (governance.signals.latestQualityGatesPassed) score += 0.15;

  // Maturity level
  if (item.maturity === "production_ready") score += 0.1;

  return Math.min(1, score);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the overall rank score from individual dimensions.
 */
export function computeTemplateRankScore(analytics: {
  healthScore: number;
  stabilityScore: number;
  adoptionIntentNorm: number;
  derivationIntentNorm: number;
  derivationReadinessScore: number;
  marketplaceMaturityScore: number;
}): number {
  const raw =
    analytics.healthScore * WEIGHTS.health +
    analytics.stabilityScore * WEIGHTS.stability +
    analytics.adoptionIntentNorm * WEIGHTS.adoptionIntent +
    analytics.derivationIntentNorm * WEIGHTS.derivationIntent +
    analytics.derivationReadinessScore * WEIGHTS.derivationReadiness +
    analytics.marketplaceMaturityScore * WEIGHTS.marketplaceMaturity;

  return Math.round(raw * 1000) / 1000;
}

/**
 * Classify a template's trend based on health, stability, and intent signals.
 */
export function classifyTemplateTrend(opts: {
  healthScore: number;
  stabilityScore: number;
  adoptionIntentCount: number;
  derivationIntentCount: number;
  governanceDecision: string;
}): AnalyticsTrend {
  const { healthScore, stabilityScore, adoptionIntentCount, derivationIntentCount, governanceDecision } = opts;

  // Declining signals
  const decliningDecisions = ["mark_degraded", "demote", "mark_at_risk"];
  if (decliningDecisions.includes(governanceDecision)) return "declining";
  if (healthScore < 0.4) return "declining";
  if (stabilityScore < 0.3) return "declining";

  // Rising signals
  const risingDecisions = ["promote_to_green", "eligible_for_repromotion"];
  if (risingDecisions.includes(governanceDecision)) return "rising";
  if (healthScore >= 0.8 && (adoptionIntentCount > 0 || derivationIntentCount > 0)) return "rising";

  return "stable";
}

/**
 * Build analytics for all templates.
 */
export function buildTemplateAnalytics(overrides?: {
  marketplaceReport?: MarketplaceReport;
  governanceResults?: TemplateGovernanceResult[];
  derivationReport?: DerivationReport;
}): TemplateAnalytics[] {
  // Gather data from sources
  const marketplaceReport = overrides?.marketplaceReport ?? buildMarketplaceReport();
  const derivationReport = overrides?.derivationReport ?? buildDerivationReport();

  // Build governance results
  let governanceResults: TemplateGovernanceResult[];
  if (overrides?.governanceResults) {
    governanceResults = overrides.governanceResults;
  } else {
    const templatesWithSignals = TEMPLATE_CATALOG.map((entry) => ({
      templateKey: entry.templateKey,
      signals: buildDefaultSignals(entry),
    }));
    const batch = evaluateAllTemplateHealth(templatesWithSignals);
    governanceResults = batch.results;
  }

  // Index data for lookup
  const itemMap = new Map<string, MarketplaceItem>();
  for (const item of marketplaceReport.items) {
    itemMap.set(item.templateId, item);
  }

  const governanceMap = new Map<string, TemplateGovernanceResult>();
  for (const result of governanceResults) {
    governanceMap.set(result.templateKey, result);
  }

  // Count intents per template
  const adoptionCounts = new Map<string, number>();
  for (const intent of marketplaceReport.adoptionIntents) {
    adoptionCounts.set(
      intent.templateId,
      (adoptionCounts.get(intent.templateId) ?? 0) + 1,
    );
  }

  const derivationCounts = new Map<string, number>();
  for (const intent of marketplaceReport.derivationIntents) {
    derivationCounts.set(
      intent.parentTemplateId,
      (derivationCounts.get(intent.parentTemplateId) ?? 0) + 1,
    );
  }

  // Find max intent counts for normalization
  const allAdoptionCounts = Array.from(adoptionCounts.values());
  const allDerivationCounts = Array.from(derivationCounts.values());
  const maxAdoption = Math.max(1, ...allAdoptionCounts);
  const maxDerivation = Math.max(1, ...allDerivationCounts);

  // Build analytics per template
  const analytics: TemplateAnalytics[] = [];

  for (const catalogEntry of TEMPLATE_CATALOG) {
    const templateId = catalogEntry.templateKey;
    const item = itemMap.get(templateId);
    const governance = governanceMap.get(templateId);

    if (!item || !governance) continue;

    const healthScore = healthStateToScore(governance.nextState);
    const stabilityScore = computeStabilityScore(governance);
    const adoptionCount = adoptionCounts.get(templateId) ?? 0;
    const derivationCount = derivationCounts.get(templateId) ?? 0;
    const adoptionNorm = normalizeIntentCount(adoptionCount, maxAdoption);
    const derivationNorm = normalizeIntentCount(derivationCount, maxDerivation);
    const derivationReadiness = computeDerivationReadinessScore(item, governance);
    const marketplaceMaturity = computeMarketplaceMaturityScore(item, governance);

    const overallRankScore = computeTemplateRankScore({
      healthScore,
      stabilityScore,
      adoptionIntentNorm: adoptionNorm,
      derivationIntentNorm: derivationNorm,
      derivationReadinessScore: derivationReadiness,
      marketplaceMaturityScore: marketplaceMaturity,
    });

    const trend = classifyTemplateTrend({
      healthScore,
      stabilityScore,
      adoptionIntentCount: adoptionCount,
      derivationIntentCount: derivationCount,
      governanceDecision: governance.decision,
    });

    const reasons = buildExplainableReasons({
      healthScore,
      stabilityScore,
      adoptionCount,
      derivationCount,
      item,
      governance,
      trend,
    });

    analytics.push({
      templateId,
      label: catalogEntry.label,
      domain: item.domain,
      healthState: governance.nextState,
      marketplaceStatus: item.status,
      healthScore,
      stabilityScore,
      adoptionIntentCount: adoptionCount,
      derivationIntentCount: derivationCount,
      derivationReadinessScore: derivationReadiness,
      marketplaceMaturityScore: marketplaceMaturity,
      overallRankScore,
      trend,
      reasons,
    });
  }

  return analytics;
}

/**
 * Rank templates by overallRankScore with stable tie-breakers.
 */
export function rankTemplates(
  analytics: TemplateAnalytics[],
  sortKey: AnalyticsSortKey = "overallRankScore",
): TemplateAnalytics[] {
  const sorted = [...analytics];

  sorted.sort((a, b) => {
    // Primary: requested sort key (descending)
    const diff = (b[sortKey] as number) - (a[sortKey] as number);
    if (diff !== 0) return diff;

    // Tie-breaker 1: healthScore descending
    if (sortKey !== "healthScore") {
      const healthDiff = b.healthScore - a.healthScore;
      if (healthDiff !== 0) return healthDiff;
    }

    // Tie-breaker 2: templateId ascending
    return a.templateId.localeCompare(b.templateId);
  });

  return sorted;
}

/**
 * Filter template analytics by dimensions.
 */
export function filterTemplateAnalytics(
  analytics: TemplateAnalytics[],
  filters: TemplateAnalyticsFilters,
): TemplateAnalytics[] {
  return analytics.filter((a) => {
    if (filters.healthState && a.healthState !== filters.healthState) return false;
    if (filters.domain && a.domain !== filters.domain) return false;
    if (filters.status && a.marketplaceStatus !== filters.status) return false;
    if (filters.trend && a.trend !== filters.trend) return false;
    return true;
  });
}

/**
 * Build a complete ranking report for dashboard / marketplace integration.
 */
export function buildTemplateRankingReport(overrides?: {
  marketplaceReport?: MarketplaceReport;
  governanceResults?: TemplateGovernanceResult[];
  derivationReport?: DerivationReport;
}): TemplateRankingReport {
  const analytics = buildTemplateAnalytics(overrides);
  const rankings = rankTemplates(analytics);

  // Top ranked (top 3 or all if fewer)
  const topRanked = rankings.slice(0, 3);

  // Best derivation parents: highest derivationReadinessScore, must be published
  const bestDerivationParents = rankTemplates(
    analytics.filter((a) => a.marketplaceStatus === "published"),
    "derivationReadinessScore",
  ).slice(0, 3);

  // Underused but healthy: green/stable but low adoption
  const underusedHealthy = analytics
    .filter(
      (a) =>
        a.healthScore >= 0.8 &&
        a.stabilityScore >= 0.7 &&
        a.adoptionIntentCount === 0,
    )
    .sort((a, b) => b.overallRankScore - a.overallRankScore);

  // Summary
  const risingCount = analytics.filter((a) => a.trend === "rising").length;
  const stableCount = analytics.filter((a) => a.trend === "stable").length;
  const decliningCount = analytics.filter((a) => a.trend === "declining").length;
  const averageOverallScore =
    analytics.length > 0
      ? Math.round(
          (analytics.reduce((sum, a) => sum + a.overallRankScore, 0) /
            analytics.length) *
            1000,
        ) / 1000
      : 0;
  const averageHealthScore =
    analytics.length > 0
      ? Math.round(
          (analytics.reduce((sum, a) => sum + a.healthScore, 0) /
            analytics.length) *
            1000,
        ) / 1000
      : 0;

  return {
    rankings,
    topRanked,
    bestDerivationParents,
    underusedHealthy,
    summary: {
      totalTemplates: analytics.length,
      risingCount,
      stableCount,
      decliningCount,
      averageOverallScore,
      averageHealthScore,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatTemplateRankingReport(
  report: TemplateRankingReport,
): string {
  const lines: string[] = [];
  const hr = "─".repeat(90);

  lines.push(hr);
  lines.push("  TEMPLATE ANALYTICS / RANKING REPORT");
  lines.push(hr);
  lines.push(
    `  Templates: ${report.summary.totalTemplates}  |  ` +
    `Rising: ${report.summary.risingCount}  |  ` +
    `Stable: ${report.summary.stableCount}  |  ` +
    `Declining: ${report.summary.decliningCount}  |  ` +
    `Avg Score: ${report.summary.averageOverallScore.toFixed(3)}`,
  );

  lines.push("");
  lines.push("  RANKINGS:");

  const header = "  " +
    "#".padEnd(4) +
    "Template".padEnd(32) +
    "Health".padEnd(8) +
    "Stab".padEnd(8) +
    "Adopt".padEnd(7) +
    "Deriv".padEnd(7) +
    "Rank".padEnd(8) +
    "Trend".padEnd(10);
  lines.push(header);
  lines.push("  " + "─".repeat(86));

  for (let i = 0; i < report.rankings.length; i++) {
    const a = report.rankings[i]!;
    const rank = String(i + 1).padEnd(4);
    const tpl = a.templateId.padEnd(32);
    const health = a.healthScore.toFixed(2).padEnd(8);
    const stab = a.stabilityScore.toFixed(2).padEnd(8);
    const adopt = String(a.adoptionIntentCount).padEnd(7);
    const deriv = String(a.derivationIntentCount).padEnd(7);
    const score = a.overallRankScore.toFixed(3).padEnd(8);
    const trend = a.trend.padEnd(10);
    lines.push(`  ${rank}${tpl}${health}${stab}${adopt}${deriv}${score}${trend}`);
  }

  if (report.topRanked.length > 0) {
    lines.push("");
    lines.push("  TOP RANKED:");
    for (const a of report.topRanked) {
      lines.push(`    ${a.templateId}: ${a.overallRankScore.toFixed(3)} (${a.trend})`);
      for (const r of a.reasons) {
        lines.push(`      - ${r}`);
      }
    }
  }

  if (report.bestDerivationParents.length > 0) {
    lines.push("");
    lines.push("  BEST DERIVATION PARENTS:");
    for (const a of report.bestDerivationParents) {
      lines.push(
        `    ${a.templateId}: readiness=${a.derivationReadinessScore.toFixed(2)} intents=${a.derivationIntentCount}`,
      );
    }
  }

  if (report.underusedHealthy.length > 0) {
    lines.push("");
    lines.push("  UNDERUSED BUT HEALTHY:");
    for (const a of report.underusedHealthy) {
      lines.push(
        `    ${a.templateId}: health=${a.healthScore.toFixed(2)} adoption=${a.adoptionIntentCount}`,
      );
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildDefaultSignals(catalogEntry: TemplateCatalogEntry): TemplateHealthSignals {
  const isGreen = catalogEntry.statusBadge === "GREEN";
  return {
    currentState: isGreen ? "green" : "candidate",
    greenCriteria: {
      pipelineComplete: isGreen,
      qualityGatesPass: isGreen,
      baselinePass: isGreen,
      tenantIsolationVerified: isGreen,
      rbacVerified: isGreen,
      runtimeVerificationDone: isGreen,
    },
    recentRegressionStatuses: isGreen ? ["pass", "pass", "pass"] : [],
    latestBaselinePassed: isGreen,
    latestQualityGatesPassed: isGreen,
  };
}

function buildExplainableReasons(opts: {
  healthScore: number;
  stabilityScore: number;
  adoptionCount: number;
  derivationCount: number;
  item: MarketplaceItem;
  governance: TemplateGovernanceResult;
  trend: AnalyticsTrend;
}): string[] {
  const reasons: string[] = [];

  // Health
  if (opts.healthScore >= 0.8) {
    reasons.push(`Health: ${opts.governance.nextState} (strong)`);
  } else if (opts.healthScore >= 0.5) {
    reasons.push(`Health: ${opts.governance.nextState} (moderate)`);
  } else {
    reasons.push(`Health: ${opts.governance.nextState} (weak)`);
  }

  // Stability
  if (opts.stabilityScore >= 0.8) {
    reasons.push("Stability: recent regressions pass consistently");
  } else if (opts.stabilityScore >= 0.5) {
    reasons.push("Stability: some recent regression issues");
  } else {
    reasons.push("Stability: frequent regression failures");
  }

  // Marketplace
  if (opts.item.status === "published" && opts.item.maturity === "production_ready") {
    reasons.push("Marketplace: published and production-ready");
  } else if (opts.item.status === "published") {
    reasons.push("Marketplace: published");
  } else if (opts.item.status === "experimental") {
    reasons.push("Marketplace: experimental");
  } else {
    reasons.push("Marketplace: unpublished");
  }

  // Adoption
  if (opts.adoptionCount > 0) {
    reasons.push(`Adoption: ${opts.adoptionCount} intent(s) recorded`);
  }

  // Derivation
  if (opts.derivationCount > 0) {
    reasons.push(`Derivation: ${opts.derivationCount} intent(s) as parent`);
  }

  // Trend
  if (opts.trend === "rising") {
    reasons.push("Trend: rising — improving signals or growing interest");
  } else if (opts.trend === "declining") {
    reasons.push("Trend: declining — degrading stability or health");
  }

  return reasons;
}
