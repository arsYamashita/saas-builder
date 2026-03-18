/**
 * Template Portfolio Strategy v1
 *
 * Provides:
 *   1. Domain/category-level portfolio analysis
 *   2. Overrepresented / underrepresented area detection
 *   3. Strategic gap identification
 *   4. Expansion priority ranking
 *   5. Deterministic strategy report
 *
 * Read-only. No template state mutation. No ML. No external APIs.
 * All strategies are explainable and deterministic.
 */

import {
  ALL_DOMAINS,
  TEMPLATE_DOMAIN_MAP,
  buildEvolutionReport,
  detectDomainGaps,
  type TemplateDomain,
  type EvolutionReport,
} from "./template-evolution-engine";
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
  buildTemplateRecommendationReport,
  type RecommendationReport,
} from "./template-recommendation-engine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortfolioStrategy = "expand" | "stabilize" | "maintain" | "gap_fill";

export interface DomainStrategyRecord {
  domain: string;
  templateCount: number;
  greenCount: number;
  prodCount: number;
  averageHealthScore: number;
  averageStabilityScore: number;
  averageRankScore: number;
  adoptionInterest: number;
  derivationInterest: number;
  derivationPotential: number;
  coverageScore: number;
  expansionPriorityScore: number;
  strategy: PortfolioStrategy;
  reasons: string[];
}

export interface PortfolioGap {
  domain: string;
  adjacentDomains: string[];
  adjacentTemplateCount: number;
  evolutionProposalCount: number;
  averageProposalConfidence: number;
  fillPriority: number;
  reasons: string[];
}

export interface PortfolioStrategyReport {
  domainStrategies: DomainStrategyRecord[];
  expansionPriorities: DomainStrategyRecord[];
  stabilizationPriorities: DomainStrategyRecord[];
  maintainDomains: DomainStrategyRecord[];
  gaps: PortfolioGap[];
  summary: {
    totalDomains: number;
    coveredDomains: number;
    uncoveredDomains: number;
    expandCount: number;
    stabilizeCount: number;
    maintainCount: number;
    gapFillCount: number;
    averageCoverageScore: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface PortfolioInputs {
  rankingReport: TemplateRankingReport;
  marketplaceReport: MarketplaceReport;
  derivationReport: DerivationReport;
  releaseReport: TemplateReleaseReport;
  evolutionReport: EvolutionReport;
  recommendationReport: RecommendationReport;
}

function collectInputs(overrides?: Partial<PortfolioInputs>): PortfolioInputs {
  return {
    rankingReport: overrides?.rankingReport ?? buildTemplateRankingReport(),
    marketplaceReport: overrides?.marketplaceReport ?? buildMarketplaceReport(),
    derivationReport: overrides?.derivationReport ?? buildDerivationReport(),
    releaseReport: overrides?.releaseReport ?? buildTemplateReleaseReport(),
    evolutionReport: overrides?.evolutionReport ?? buildEvolutionReport(),
    recommendationReport: overrides?.recommendationReport ?? buildTemplateRecommendationReport(),
  };
}

// ---------------------------------------------------------------------------
// Adjacency Map
// ---------------------------------------------------------------------------

/**
 * Domain adjacency for gap analysis.
 * If domain A has templates but adjacent domain B does not,
 * B becomes a candidate for gap_fill.
 */
const DOMAIN_ADJACENCY: Record<string, TemplateDomain[]> = {
  membership: ["community", "commerce", "education"],
  commerce: ["membership", "marketplace", "finance"],
  crm: ["support", "operations", "communication"],
  reservation: ["operations", "commerce"],
  operations: ["crm", "analytics", "support"],
  community: ["membership", "education", "communication"],
  support: ["crm", "operations", "communication"],
  education: ["community", "membership"],
  marketplace: ["commerce", "membership"],
  finance: ["commerce", "analytics"],
  analytics: ["operations", "finance"],
  communication: ["community", "support", "crm"],
};

// ---------------------------------------------------------------------------
// Coverage Scoring Weights
// ---------------------------------------------------------------------------

const COVERAGE_WEIGHTS = {
  templateBreadth: 0.25,
  healthQuality: 0.25,
  releaseMaturity: 0.20,
  marketplacePresence: 0.15,
  derivationActivity: 0.15,
};

const EXPANSION_WEIGHTS = {
  quality: 0.25,
  demand: 0.25,
  derivationPotential: 0.20,
  narrowness: 0.15,
  marketplaceMaturity: 0.15,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze portfolio coverage per domain.
 * Returns a DomainStrategyRecord for each domain that has templates.
 */
export function analyzePortfolioCoverage(
  overrides?: Partial<PortfolioInputs>,
): DomainStrategyRecord[] {
  const inputs = collectInputs(overrides);
  const { rankingReport, marketplaceReport, derivationReport, releaseReport } = inputs;

  // Group analytics by domain
  const domainMap = new Map<string, TemplateAnalytics[]>();
  for (const analytics of rankingReport.rankings) {
    const domains = TEMPLATE_DOMAIN_MAP[analytics.templateId] ?? [];
    for (const d of domains) {
      const list = domainMap.get(d) ?? [];
      list.push(analytics);
      domainMap.set(d, list);
    }
  }

  const records: DomainStrategyRecord[] = [];

  for (const [domain, templates] of Array.from(domainMap.entries())) {
    const templateCount = templates.length;
    const greenCount = templates.filter((t) => t.healthState === "green").length;

    // Prod count from release catalog
    const prodCount = releaseReport.catalog.filter(
      (e) => e.stage === "prod" && templates.some((t) => t.templateId === e.templateId),
    ).length;

    const avgHealth = average(templates.map((t) => t.healthScore));
    const avgStability = average(templates.map((t) => t.stabilityScore));
    const avgRank = average(templates.map((t) => t.overallRankScore));

    const adoptionInterest = templates.reduce((s, t) => s + t.adoptionIntentCount, 0);
    const derivationInterest = templates.reduce((s, t) => s + t.derivationIntentCount, 0);
    const derivationPotential = average(templates.map((t) => t.derivationReadinessScore));

    // Coverage score
    const breadthNorm = Math.min(templateCount / 3, 1.0); // 3+ templates = full breadth
    const healthNorm = avgHealth;
    const releaseNorm = templateCount > 0 ? prodCount / templateCount : 0;
    const mktNorm = average(templates.map((t) => t.marketplaceMaturityScore));
    const derivNorm = derivationPotential;

    const coverageScore = round(
      breadthNorm * COVERAGE_WEIGHTS.templateBreadth +
      healthNorm * COVERAGE_WEIGHTS.healthQuality +
      releaseNorm * COVERAGE_WEIGHTS.releaseMaturity +
      mktNorm * COVERAGE_WEIGHTS.marketplacePresence +
      derivNorm * COVERAGE_WEIGHTS.derivationActivity,
    );

    // Expansion priority score
    const qualitySignal = avgHealth * 0.5 + avgStability * 0.5;
    const demandSignal = Math.min((adoptionInterest + derivationInterest) / 5, 1.0);
    const narrownessSignal = templateCount <= 1 ? 1.0 : templateCount <= 2 ? 0.6 : 0.2;
    const mktMaturity = mktNorm;

    const expansionPriorityScore = round(
      qualitySignal * EXPANSION_WEIGHTS.quality +
      demandSignal * EXPANSION_WEIGHTS.demand +
      derivationPotential * EXPANSION_WEIGHTS.derivationPotential +
      narrownessSignal * EXPANSION_WEIGHTS.narrowness +
      mktMaturity * EXPANSION_WEIGHTS.marketplaceMaturity,
    );

    // Strategy classification
    const strategy = classifyStrategy(
      templateCount, greenCount, avgHealth, avgStability,
      adoptionInterest, derivationInterest, derivationPotential,
      expansionPriorityScore,
    );

    const reasons = buildStrategyReasons(
      domain, strategy, templateCount, greenCount, prodCount,
      avgHealth, avgStability, adoptionInterest, derivationInterest,
      derivationPotential, expansionPriorityScore,
    );

    records.push({
      domain,
      templateCount,
      greenCount,
      prodCount,
      averageHealthScore: round(avgHealth),
      averageStabilityScore: round(avgStability),
      averageRankScore: round(avgRank),
      adoptionInterest,
      derivationInterest,
      derivationPotential: round(derivationPotential),
      coverageScore,
      expansionPriorityScore,
      strategy,
      reasons,
    });
  }

  // Sort: expansionPriorityScore desc, averageRankScore desc, domain asc
  records.sort((a, b) => {
    if (b.expansionPriorityScore !== a.expansionPriorityScore) {
      return b.expansionPriorityScore - a.expansionPriorityScore;
    }
    if (b.averageRankScore !== a.averageRankScore) {
      return b.averageRankScore - a.averageRankScore;
    }
    return a.domain.localeCompare(b.domain);
  });

  return records;
}

/**
 * Detect strategic gaps — domains with no templates but strong adjacent signals.
 */
export function detectPortfolioGaps(
  overrides?: Partial<PortfolioInputs>,
): PortfolioGap[] {
  const inputs = collectInputs(overrides);
  const { evolutionReport, rankingReport } = inputs;

  const domainGaps = detectDomainGaps();
  const gaps: PortfolioGap[] = [];

  for (const uncovered of domainGaps.uncoveredDomains) {
    const adjacent = DOMAIN_ADJACENCY[uncovered] ?? [];
    const coveredAdjacent = adjacent.filter((a) => !domainGaps.uncoveredDomains.includes(a));

    // Count adjacent templates
    let adjacentTemplateCount = 0;
    for (const adj of coveredAdjacent) {
      for (const [, domains] of Object.entries(TEMPLATE_DOMAIN_MAP)) {
        if (domains.includes(adj)) adjacentTemplateCount++;
      }
    }

    // Evolution proposals for this domain
    const proposals = evolutionReport.proposals.filter((p) => p.domain === uncovered);
    const avgConfidence = proposals.length > 0
      ? average(proposals.map((p) => p.confidence))
      : 0;

    // Fill priority
    let fillPriority = 0;
    fillPriority += Math.min(adjacentTemplateCount / 3, 1.0) * 0.30;
    fillPriority += Math.min(proposals.length / 2, 1.0) * 0.30;
    fillPriority += avgConfidence * 0.25;
    fillPriority += Math.min(coveredAdjacent.length / 3, 1.0) * 0.15;
    fillPriority = round(fillPriority);

    const reasons: string[] = [];
    if (adjacentTemplateCount > 0) {
      reasons.push(`${adjacentTemplateCount} adjacent template(s) in ${coveredAdjacent.join(", ")}`);
    }
    if (proposals.length > 0) {
      reasons.push(`${proposals.length} evolution proposal(s) with avg confidence ${round(avgConfidence)}`);
    }
    if (coveredAdjacent.length > 0) {
      reasons.push(`${coveredAdjacent.length} covered adjacent domain(s)`);
    }
    if (reasons.length === 0) {
      reasons.push("no adjacent template coverage or evolution proposals");
    }

    gaps.push({
      domain: uncovered,
      adjacentDomains: coveredAdjacent,
      adjacentTemplateCount,
      evolutionProposalCount: proposals.length,
      averageProposalConfidence: round(avgConfidence),
      fillPriority,
      reasons,
    });
  }

  // Sort by fillPriority desc, domain asc
  gaps.sort((a, b) => {
    if (b.fillPriority !== a.fillPriority) return b.fillPriority - a.fillPriority;
    return a.domain.localeCompare(b.domain);
  });

  return gaps;
}

/**
 * Rank domains by expansion priority.
 * Returns only domains with strategy "expand".
 */
export function rankExpansionPriorities(
  overrides?: Partial<PortfolioInputs>,
): DomainStrategyRecord[] {
  const coverage = analyzePortfolioCoverage(overrides);
  return coverage.filter((r) => r.strategy === "expand");
}

/**
 * Build a complete portfolio strategy.
 */
export function buildTemplatePortfolioStrategy(
  overrides?: Partial<PortfolioInputs>,
): {
  domainStrategies: DomainStrategyRecord[];
  gaps: PortfolioGap[];
} {
  return {
    domainStrategies: analyzePortfolioCoverage(overrides),
    gaps: detectPortfolioGaps(overrides),
  };
}

/**
 * Build a full portfolio strategy report with summary.
 */
export function buildPortfolioStrategyReport(
  overrides?: Partial<PortfolioInputs>,
): PortfolioStrategyReport {
  const domainStrategies = analyzePortfolioCoverage(overrides);
  const gaps = detectPortfolioGaps(overrides);

  const expandCount = domainStrategies.filter((d) => d.strategy === "expand").length;
  const stabilizeCount = domainStrategies.filter((d) => d.strategy === "stabilize").length;
  const maintainCount = domainStrategies.filter((d) => d.strategy === "maintain").length;
  const gapFillCount = gaps.length;

  const domainGaps = detectDomainGaps();
  const avgCoverage = domainStrategies.length > 0
    ? average(domainStrategies.map((d) => d.coverageScore))
    : 0;

  return {
    domainStrategies,
    expansionPriorities: domainStrategies.filter((d) => d.strategy === "expand"),
    stabilizationPriorities: domainStrategies.filter((d) => d.strategy === "stabilize"),
    maintainDomains: domainStrategies.filter((d) => d.strategy === "maintain"),
    gaps,
    summary: {
      totalDomains: ALL_DOMAINS.length,
      coveredDomains: domainGaps.coveredDomains.length,
      uncoveredDomains: domainGaps.uncoveredDomains.length,
      expandCount,
      stabilizeCount,
      maintainCount,
      gapFillCount,
      averageCoverageScore: round(avgCoverage),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDomainStrategyRecord(rec: DomainStrategyRecord): string {
  const lines: string[] = [];
  lines.push(`  [${rec.strategy.toUpperCase()}] ${rec.domain}`);
  lines.push(
    `    Templates: ${rec.templateCount} (green: ${rec.greenCount}, prod: ${rec.prodCount})`,
  );
  lines.push(
    `    Health: ${rec.averageHealthScore}  Stability: ${rec.averageStabilityScore}  Rank: ${rec.averageRankScore}`,
  );
  lines.push(
    `    Adoption: ${rec.adoptionInterest}  Derivation: ${rec.derivationInterest}  Deriv.Potential: ${rec.derivationPotential}`,
  );
  lines.push(
    `    Coverage: ${rec.coverageScore}  Expansion Priority: ${rec.expansionPriorityScore}`,
  );
  lines.push(`    Reasons: ${rec.reasons.join("; ")}`);
  return lines.join("\n");
}

export function formatPortfolioStrategyReport(report: PortfolioStrategyReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push("  TEMPLATE PORTFOLIO STRATEGY REPORT");
  lines.push(hr);
  lines.push(
    `  Domains: ${report.summary.totalDomains}  |  ` +
    `Covered: ${report.summary.coveredDomains}  |  ` +
    `Uncovered: ${report.summary.uncoveredDomains}  |  ` +
    `Avg Coverage: ${report.summary.averageCoverageScore}`,
  );
  lines.push(
    `  Expand: ${report.summary.expandCount}  |  ` +
    `Stabilize: ${report.summary.stabilizeCount}  |  ` +
    `Maintain: ${report.summary.maintainCount}  |  ` +
    `Gap Fill: ${report.summary.gapFillCount}`,
  );

  if (report.expansionPriorities.length > 0) {
    lines.push("");
    lines.push("  EXPANSION PRIORITIES:");
    for (const rec of report.expansionPriorities) {
      lines.push(formatDomainStrategyRecord(rec));
    }
  }

  if (report.gaps.length > 0) {
    lines.push("");
    lines.push("  STRATEGIC GAPS:");
    for (const gap of report.gaps) {
      lines.push(`  [GAP_FILL] ${gap.domain}`);
      lines.push(
        `    Adjacent: ${gap.adjacentDomains.join(", ") || "—"}  ` +
        `Adjacent Templates: ${gap.adjacentTemplateCount}  ` +
        `Proposals: ${gap.evolutionProposalCount}`,
      );
      lines.push(
        `    Avg Proposal Confidence: ${gap.averageProposalConfidence}  ` +
        `Fill Priority: ${gap.fillPriority}`,
      );
      lines.push(`    Reasons: ${gap.reasons.join("; ")}`);
    }
  }

  if (report.stabilizationPriorities.length > 0) {
    lines.push("");
    lines.push("  STABILIZATION PRIORITIES:");
    for (const rec of report.stabilizationPriorities) {
      lines.push(formatDomainStrategyRecord(rec));
    }
  }

  if (report.maintainDomains.length > 0) {
    lines.push("");
    lines.push("  MAINTAIN DOMAINS:");
    for (const rec of report.maintainDomains) {
      lines.push(formatDomainStrategyRecord(rec));
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyStrategy(
  templateCount: number,
  greenCount: number,
  avgHealth: number,
  avgStability: number,
  adoptionInterest: number,
  derivationInterest: number,
  derivationPotential: number,
  expansionPriorityScore: number,
): PortfolioStrategy {
  // Rule C: many templates but weak quality → stabilize
  if (templateCount >= 2 && (avgHealth < 0.6 || avgStability < 0.5)) {
    return "stabilize";
  }

  // Rule A: high quality, low breadth, good derivation → expand
  if (
    templateCount <= 2 &&
    avgHealth >= 0.7 &&
    avgStability >= 0.6 &&
    (derivationPotential >= 0.5 || adoptionInterest > 0 || derivationInterest > 0)
  ) {
    return "expand";
  }

  // Rule D: strong demand + maturity → expand
  if (
    (adoptionInterest + derivationInterest) >= 2 &&
    avgHealth >= 0.6 &&
    expansionPriorityScore >= 0.5
  ) {
    return "expand";
  }

  // Default: maintain if healthy enough
  if (avgHealth >= 0.7 && avgStability >= 0.6) {
    return "maintain";
  }

  // Weak health but not many templates → stabilize
  if (avgHealth < 0.7 || avgStability < 0.6) {
    return "stabilize";
  }

  return "maintain";
}

function buildStrategyReasons(
  domain: string,
  strategy: PortfolioStrategy,
  templateCount: number,
  greenCount: number,
  prodCount: number,
  avgHealth: number,
  avgStability: number,
  adoptionInterest: number,
  derivationInterest: number,
  derivationPotential: number,
  expansionPriority: number,
): string[] {
  const reasons: string[] = [];

  switch (strategy) {
    case "expand":
      if (avgHealth >= 0.8) reasons.push("Strong existing template quality");
      if (greenCount > 0) reasons.push("Healthy production-ready base");
      if (templateCount <= 1) reasons.push("Low template breadth — single template domain");
      else if (templateCount <= 2) reasons.push("Narrow template breadth");
      if (derivationPotential >= 0.7) reasons.push("Good derivation potential");
      if (derivationInterest > 0) reasons.push(`${derivationInterest} derivation interest(s)`);
      if (adoptionInterest > 0) reasons.push(`${adoptionInterest} adoption interest(s)`);
      reasons.push("High expansion leverage from current assets");
      break;

    case "stabilize":
      if (avgHealth < 0.6) reasons.push(`Low average health score (${round(avgHealth)})`);
      if (avgStability < 0.5) reasons.push(`Low average stability (${round(avgStability)})`);
      if (greenCount < templateCount) {
        reasons.push(`Only ${greenCount}/${templateCount} templates are green`);
      }
      reasons.push("Prioritize quality improvement before expansion");
      break;

    case "maintain":
      if (avgHealth >= 0.7) reasons.push("Healthy portfolio");
      if (avgStability >= 0.6) reasons.push("Stable regression history");
      if (prodCount > 0) reasons.push(`${prodCount} template(s) in production`);
      reasons.push("No immediate expansion or stabilization needed");
      break;

    case "gap_fill":
      reasons.push(`Domain "${domain}" has no templates`);
      break;
  }

  return reasons;
}
