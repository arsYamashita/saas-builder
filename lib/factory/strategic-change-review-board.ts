/**
 * Strategic Change Review Board v1
 *
 * Provides:
 *   1. Review packet generation from strategic data
 *   2. Readiness classification (ready / caution / blocked)
 *   3. Risk classification (low / medium / high)
 *   4. Deterministic prioritization
 *   5. Explainable reasons with linked evidence
 *
 * Review packaging only. Does NOT execute, approve, or mutate Factory state.
 */

import {
  buildStrategicKpiReport,
  type StrategicKpiReport,
  type KpiRecord,
} from "./strategic-kpi-layer";
import {
  buildPortfolioStrategyReport,
  type PortfolioStrategyReport,
  type DomainStrategyRecord,
  type PortfolioGap,
} from "./template-portfolio-strategy";
import {
  buildScenarioReport,
  type ScenarioReport,
  type FactoryScenario,
} from "./factory-scenario-planner";
import {
  validateScenarioExecution,
  type ExecutionEligibility,
} from "./scenario-execution-bridge";
import {
  buildTemplateRecommendationReport,
  type RecommendationReport,
} from "./template-recommendation-engine";
import {
  buildTemplateRankingReport,
  type TemplateRankingReport,
} from "./template-analytics-ranking";
import {
  evaluateAllTemplateHealth,
  type GovernanceSummaryRollup,
} from "./template-health-governance";
import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "../templates/template-catalog";
import type { TemplateHealthSignals } from "./template-health-governance";
import type { FactoryActor } from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReviewType =
  | "scenario"
  | "portfolio_priority"
  | "strategic_gap"
  | "release_readiness"
  | "stabilization_priority";

export type ReviewReadiness = "ready" | "caution" | "blocked";

export type ReviewRisk = "low" | "medium" | "high";

export type ReviewDecision =
  | "approve"
  | "defer"
  | "reject"
  | "needs_investigation";

export type ReviewStatus =
  | "pending"
  | "reviewed"
  | "approved_candidate"
  | "deferred_candidate";

export interface LinkedArtifacts {
  scenarioId?: string;
  kpiKeys?: string[];
  domainStrategy?: string;
  gapDomain?: string;
  recommendationTypes?: string[];
}

export interface ReviewItem {
  reviewId: string;
  reviewType: ReviewType;
  title: string;
  domain: string;
  priority: number;
  readiness: ReviewReadiness;
  risk: ReviewRisk;
  recommendedDecision: ReviewDecision;
  status: ReviewStatus;
  reasons: string[];
  linkedArtifacts: LinkedArtifacts;
}

export interface ReviewBoardReport {
  items: ReviewItem[];
  readyItems: ReviewItem[];
  cautionItems: ReviewItem[];
  blockedItems: ReviewItem[];
  summary: {
    totalItems: number;
    readyCount: number;
    cautionCount: number;
    blockedCount: number;
    approveCount: number;
    deferCount: number;
    rejectCount: number;
    averagePriority: number;
  };
  generatedAt: string;
}

export interface ReviewBoardInputs {
  kpiReport: StrategicKpiReport;
  portfolioReport: PortfolioStrategyReport;
  scenarioReport: ScenarioReport;
  recommendationReport: RecommendationReport;
  rankingReport: TemplateRankingReport;
  governanceSummary: GovernanceSummaryRollup;
  actor: FactoryActor;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function buildDefaultGovernanceSummary(): GovernanceSummaryRollup {
  const templatesWithSignals = TEMPLATE_CATALOG.map((entry: TemplateCatalogEntry) => ({
    templateKey: entry.templateKey,
    signals: buildDefaultSignals(entry),
  }));
  const batch = evaluateAllTemplateHealth(templatesWithSignals);
  return batch.summary;
}

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

const DEFAULT_ACTOR: FactoryActor = { actorId: "review-board", role: "admin" };

// ---------------------------------------------------------------------------
// Readiness classification
// ---------------------------------------------------------------------------

export function classifyReviewReadiness(
  signals: {
    hasViableScenario: boolean;
    executionEligible: boolean;
    healthStable: boolean;
    hasDegradedOrDemoted: boolean;
    hasParentTemplate: boolean;
    kpiStatus: string;
  },
): ReviewReadiness {
  // Blocked conditions
  if (signals.hasDegradedOrDemoted) return "blocked";
  if (!signals.healthStable) return "blocked";
  if (!signals.hasParentTemplate && signals.hasViableScenario) return "blocked";
  if (!signals.executionEligible && signals.hasViableScenario) return "blocked";

  // Caution conditions
  if (signals.kpiStatus === "warning" || signals.kpiStatus === "weak") return "caution";
  if (!signals.hasViableScenario) return "caution";

  return "ready";
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

export function classifyReviewRisk(
  signals: {
    governanceDemotedCount: number;
    governanceDegradedCount: number;
    governanceAtRiskCount: number;
    averageHealthScore: number;
    averageStabilityScore: number;
    scenarioPriority: number;
    templateCount: number;
  },
): ReviewRisk {
  // High risk
  if (signals.governanceDemotedCount > 0) return "high";
  if (signals.governanceDegradedCount > 1) return "high";
  if (signals.averageHealthScore < 0.4) return "high";
  if (signals.averageStabilityScore < 0.3) return "high";

  // Medium risk
  if (signals.governanceAtRiskCount > 0) return "medium";
  if (signals.governanceDegradedCount > 0) return "medium";
  if (signals.averageHealthScore < 0.6) return "medium";
  if (signals.averageStabilityScore < 0.5) return "medium";
  if (signals.templateCount === 0) return "medium";

  return "low";
}

// ---------------------------------------------------------------------------
// Decision recommendation
// ---------------------------------------------------------------------------

function recommendDecision(readiness: ReviewReadiness, risk: ReviewRisk): ReviewDecision {
  if (readiness === "blocked") return "reject";
  if (readiness === "caution" && risk === "high") return "reject";
  if (readiness === "caution") return "defer";
  if (risk === "high") return "defer";
  if (risk === "medium") return "approve";
  return "approve";
}

// ---------------------------------------------------------------------------
// Review item builders
// ---------------------------------------------------------------------------

function buildScenarioReviewItems(
  scenarios: FactoryScenario[],
  portfolioReport: PortfolioStrategyReport,
  governanceSummary: GovernanceSummaryRollup,
  actor: FactoryActor,
): ReviewItem[] {
  return scenarios.map((scenario) => {
    const domainStrategy = portfolioReport.domainStrategies.find(
      (d) => d.domain === scenario.domain,
    );

    const eligibility = validateScenarioExecution(scenario, actor, { governanceSummary });

    const healthStable = governanceSummary.degradedCount === 0 && governanceSummary.demotedCount === 0;
    const hasParent = scenario.steps
      .filter((s) => s.stepType === "derive_template")
      .every((s) => s.parentTemplateId !== null);

    const readiness = classifyReviewReadiness({
      hasViableScenario: true,
      executionEligible: eligibility.allowed,
      healthStable,
      hasDegradedOrDemoted: governanceSummary.degradedCount > 0 || governanceSummary.demotedCount > 0,
      hasParentTemplate: hasParent,
      kpiStatus: domainStrategy ? (domainStrategy.averageHealthScore >= 0.6 ? "healthy" : "warning") : "warning",
    });

    const risk = classifyReviewRisk({
      governanceDemotedCount: governanceSummary.demotedCount,
      governanceDegradedCount: governanceSummary.degradedCount,
      governanceAtRiskCount: governanceSummary.atRiskCount,
      averageHealthScore: domainStrategy?.averageHealthScore ?? 0,
      averageStabilityScore: domainStrategy?.averageStabilityScore ?? 0,
      scenarioPriority: scenario.priorityScore,
      templateCount: domainStrategy?.templateCount ?? 0,
    });

    const decision = recommendDecision(readiness, risk);

    const reasons: string[] = [...scenario.reasons];
    if (eligibility.allowed) reasons.push("scenario execution plan is valid");
    if (!eligibility.allowed) reasons.push(...eligibility.blockedReasons);
    if (healthStable) reasons.push("current governance signals are stable");
    if (hasParent) reasons.push("parent template available for derivation");

    return {
      reviewId: `review-${scenario.scenarioId}`,
      reviewType: "scenario" as ReviewType,
      title: `${scenarioTypeLabel(scenario.type)}: ${scenario.domain} (${scenario.currentTemplateCount} → ${scenario.targetTemplateCount})`,
      domain: scenario.domain,
      priority: scenario.priorityScore,
      readiness,
      risk,
      recommendedDecision: decision,
      status: "pending" as ReviewStatus,
      reasons,
      linkedArtifacts: {
        scenarioId: scenario.scenarioId,
        domainStrategy: scenario.domain,
      },
    };
  });
}

function buildPortfolioPriorityReviewItems(
  portfolioReport: PortfolioStrategyReport,
  governanceSummary: GovernanceSummaryRollup,
  kpiReport: StrategicKpiReport,
): ReviewItem[] {
  return portfolioReport.expansionPriorities.map((domain) => {
    const kpiStatus = getKpiStatusForDomain(domain.domain, kpiReport);

    const readiness = classifyReviewReadiness({
      hasViableScenario: domain.expansionPriorityScore > 0.3,
      executionEligible: true,
      healthStable: governanceSummary.degradedCount === 0 && governanceSummary.demotedCount === 0,
      hasDegradedOrDemoted: governanceSummary.degradedCount > 0 || governanceSummary.demotedCount > 0,
      hasParentTemplate: true,
      kpiStatus,
    });

    const risk = classifyReviewRisk({
      governanceDemotedCount: governanceSummary.demotedCount,
      governanceDegradedCount: governanceSummary.degradedCount,
      governanceAtRiskCount: governanceSummary.atRiskCount,
      averageHealthScore: domain.averageHealthScore,
      averageStabilityScore: domain.averageStabilityScore,
      scenarioPriority: domain.expansionPriorityScore,
      templateCount: domain.templateCount,
    });

    const decision = recommendDecision(readiness, risk);

    return {
      reviewId: `review-portfolio-${domain.domain}`,
      reviewType: "portfolio_priority" as ReviewType,
      title: `Portfolio expansion: ${domain.domain}`,
      domain: domain.domain,
      priority: domain.expansionPriorityScore,
      readiness,
      risk,
      recommendedDecision: decision,
      status: "pending" as ReviewStatus,
      reasons: [
        ...domain.reasons,
        `Coverage score: ${domain.coverageScore.toFixed(2)}`,
        `Templates: ${domain.templateCount} (GREEN: ${domain.greenCount})`,
      ],
      linkedArtifacts: {
        domainStrategy: domain.domain,
        kpiKeys: [`portfolio_domain_coverage`],
      },
    };
  });
}

function buildStrategicGapReviewItems(
  portfolioReport: PortfolioStrategyReport,
  governanceSummary: GovernanceSummaryRollup,
): ReviewItem[] {
  return portfolioReport.gaps.map((gap) => {
    const readiness = classifyReviewReadiness({
      hasViableScenario: gap.evolutionProposalCount > 0,
      executionEligible: true,
      healthStable: governanceSummary.degradedCount === 0 && governanceSummary.demotedCount === 0,
      hasDegradedOrDemoted: governanceSummary.degradedCount > 0 || governanceSummary.demotedCount > 0,
      hasParentTemplate: gap.adjacentTemplateCount > 0,
      kpiStatus: gap.averageProposalConfidence >= 0.5 ? "healthy" : "warning",
    });

    const risk = classifyReviewRisk({
      governanceDemotedCount: governanceSummary.demotedCount,
      governanceDegradedCount: governanceSummary.degradedCount,
      governanceAtRiskCount: governanceSummary.atRiskCount,
      averageHealthScore: 0, // gaps have no templates yet
      averageStabilityScore: 0,
      scenarioPriority: gap.fillPriority,
      templateCount: 0,
    });

    const decision = recommendDecision(readiness, risk);

    return {
      reviewId: `review-gap-${gap.domain}`,
      reviewType: "strategic_gap" as ReviewType,
      title: `Strategic gap: ${gap.domain}`,
      domain: gap.domain,
      priority: gap.fillPriority,
      readiness,
      risk,
      recommendedDecision: decision,
      status: "pending" as ReviewStatus,
      reasons: [
        ...gap.reasons,
        `Adjacent domains: ${gap.adjacentDomains.join(", ")}`,
        `Evolution proposals: ${gap.evolutionProposalCount}`,
      ],
      linkedArtifacts: {
        gapDomain: gap.domain,
        kpiKeys: ["portfolio_gap_count"],
      },
    };
  });
}

function buildStabilizationReviewItems(
  portfolioReport: PortfolioStrategyReport,
  governanceSummary: GovernanceSummaryRollup,
  kpiReport: StrategicKpiReport,
): ReviewItem[] {
  return portfolioReport.stabilizationPriorities.map((domain) => {
    const kpiStatus = getKpiStatusForDomain(domain.domain, kpiReport);

    const readiness = classifyReviewReadiness({
      hasViableScenario: true,
      executionEligible: true,
      healthStable: domain.averageHealthScore >= 0.5,
      hasDegradedOrDemoted: governanceSummary.degradedCount > 0 || governanceSummary.demotedCount > 0,
      hasParentTemplate: true,
      kpiStatus,
    });

    const risk = classifyReviewRisk({
      governanceDemotedCount: governanceSummary.demotedCount,
      governanceDegradedCount: governanceSummary.degradedCount,
      governanceAtRiskCount: governanceSummary.atRiskCount,
      averageHealthScore: domain.averageHealthScore,
      averageStabilityScore: domain.averageStabilityScore,
      scenarioPriority: domain.expansionPriorityScore,
      templateCount: domain.templateCount,
    });

    const decision = recommendDecision(readiness, risk);

    return {
      reviewId: `review-stabilize-${domain.domain}`,
      reviewType: "stabilization_priority" as ReviewType,
      title: `Stabilization needed: ${domain.domain}`,
      domain: domain.domain,
      priority: 1 - domain.averageStabilityScore, // less stable = higher priority
      readiness,
      risk,
      recommendedDecision: decision,
      status: "pending" as ReviewStatus,
      reasons: [
        ...domain.reasons,
        `Health score: ${domain.averageHealthScore.toFixed(2)}`,
        `Stability score: ${domain.averageStabilityScore.toFixed(2)}`,
      ],
      linkedArtifacts: {
        domainStrategy: domain.domain,
        kpiKeys: ["quality_avg_health_score", "quality_stable_rate"],
      },
    };
  });
}

function buildReleaseReadinessReviewItems(
  rankingReport: TemplateRankingReport,
  recommendationReport: RecommendationReport,
  governanceSummary: GovernanceSummaryRollup,
): ReviewItem[] {
  // Build review items for templates that are safest for production
  return recommendationReport.safestProductionTemplates.map((rec) => {
    const template = rankingReport.rankings.find((r) => r.templateId === rec.templateId);

    const readiness = classifyReviewReadiness({
      hasViableScenario: true,
      executionEligible: true,
      healthStable: (template?.healthState === "green"),
      hasDegradedOrDemoted: governanceSummary.degradedCount > 0 || governanceSummary.demotedCount > 0,
      hasParentTemplate: true,
      kpiStatus: (template?.healthScore ?? 0) >= 0.6 ? "healthy" : "warning",
    });

    const risk = classifyReviewRisk({
      governanceDemotedCount: governanceSummary.demotedCount,
      governanceDegradedCount: governanceSummary.degradedCount,
      governanceAtRiskCount: governanceSummary.atRiskCount,
      averageHealthScore: template?.healthScore ?? 0,
      averageStabilityScore: template?.stabilityScore ?? 0,
      scenarioPriority: rec.score,
      templateCount: 1,
    });

    const decision = recommendDecision(readiness, risk);

    return {
      reviewId: `review-release-${rec.templateId}`,
      reviewType: "release_readiness" as ReviewType,
      title: `Release readiness: ${rec.label}`,
      domain: rec.domain ?? template?.domain ?? "unknown",
      priority: rec.score,
      readiness,
      risk,
      recommendedDecision: decision,
      status: "pending" as ReviewStatus,
      reasons: [
        ...rec.reasons,
        `Rank score: ${template?.overallRankScore.toFixed(2) ?? "N/A"}`,
        `Trend: ${template?.trend ?? "unknown"}`,
      ],
      linkedArtifacts: {
        recommendationTypes: [rec.recommendationType],
        kpiKeys: ["release_prod_count"],
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scenarioTypeLabel(type: string): string {
  switch (type) {
    case "expand_domain": return "Expand domain";
    case "fill_gap": return "Fill gap";
    case "stabilize_domain": return "Stabilize domain";
    default: return type;
  }
}

function getKpiStatusForDomain(domain: string, kpiReport: StrategicKpiReport): string {
  const rollup = kpiReport.domainRollups.find((r) => r.domain === domain);
  return rollup?.overallStatus ?? "warning";
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export function rankReviewItems(items: ReviewItem[]): ReviewItem[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    // 1. Readiness: ready > caution > blocked
    const readinessOrder: Record<ReviewReadiness, number> = { ready: 0, caution: 1, blocked: 2 };
    const readinessDiff = readinessOrder[a.readiness] - readinessOrder[b.readiness];
    if (readinessDiff !== 0) return readinessDiff;

    // 2. Priority descending
    if (a.priority !== b.priority) return b.priority - a.priority;

    // 3. Risk ascending: low < medium < high
    const riskOrder: Record<ReviewRisk, number> = { low: 0, medium: 1, high: 2 };
    const riskDiff = riskOrder[a.risk] - riskOrder[b.risk];
    if (riskDiff !== 0) return riskDiff;

    // 4. reviewId ascending (deterministic tie-breaker)
    return a.reviewId.localeCompare(b.reviewId);
  });
  return sorted;
}

// ---------------------------------------------------------------------------
// Main report builder
// ---------------------------------------------------------------------------

export function buildStrategicReviewBoard(
  overrides?: Partial<ReviewBoardInputs>,
): ReviewItem[] {
  const kpiReport = overrides?.kpiReport ?? buildStrategicKpiReport();
  const portfolioReport = overrides?.portfolioReport ?? buildPortfolioStrategyReport();
  const scenarioReport = overrides?.scenarioReport ?? buildScenarioReport();
  const recommendationReport = overrides?.recommendationReport ?? buildTemplateRecommendationReport();
  const rankingReport = overrides?.rankingReport ?? buildTemplateRankingReport();
  const governanceSummary = overrides?.governanceSummary ?? buildDefaultGovernanceSummary();
  const actor = overrides?.actor ?? DEFAULT_ACTOR;

  const allScenarios = [
    ...scenarioReport.expansionScenarios,
    ...scenarioReport.gapFillScenarios,
    ...scenarioReport.stabilizationScenarios,
  ];

  const items: ReviewItem[] = [
    ...buildScenarioReviewItems(allScenarios, portfolioReport, governanceSummary, actor),
    ...buildPortfolioPriorityReviewItems(portfolioReport, governanceSummary, kpiReport),
    ...buildStrategicGapReviewItems(portfolioReport, governanceSummary),
    ...buildStabilizationReviewItems(portfolioReport, governanceSummary, kpiReport),
    ...buildReleaseReadinessReviewItems(rankingReport, recommendationReport, governanceSummary),
  ];

  return rankReviewItems(items);
}

export function buildReviewBoardReport(
  overrides?: Partial<ReviewBoardInputs>,
): ReviewBoardReport {
  const items = buildStrategicReviewBoard(overrides);

  const readyItems = items.filter((i) => i.readiness === "ready");
  const cautionItems = items.filter((i) => i.readiness === "caution");
  const blockedItems = items.filter((i) => i.readiness === "blocked");

  const approveCount = items.filter((i) => i.recommendedDecision === "approve").length;
  const deferCount = items.filter((i) => i.recommendedDecision === "defer").length;
  const rejectCount = items.filter((i) => i.recommendedDecision === "reject").length;

  const totalPriority = items.reduce((sum, i) => sum + i.priority, 0);

  return {
    items,
    readyItems,
    cautionItems,
    blockedItems,
    summary: {
      totalItems: items.length,
      readyCount: readyItems.length,
      cautionCount: cautionItems.length,
      blockedCount: blockedItems.length,
      approveCount,
      deferCount,
      rejectCount,
      averagePriority: items.length > 0 ? totalPriority / items.length : 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const READINESS_ICONS: Record<ReviewReadiness, string> = {
  ready: "[READY]",
  caution: "[CAUTION]",
  blocked: "[BLOCKED]",
};

const RISK_ICONS: Record<ReviewRisk, string> = {
  low: "[LOW]",
  medium: "[MEDIUM]",
  high: "[HIGH]",
};

export function formatReviewItem(item: ReviewItem): string {
  const lines: string[] = [];
  lines.push(`${READINESS_ICONS[item.readiness]} ${item.title}`);
  lines.push(`  Type: ${item.reviewType} | Domain: ${item.domain} | Priority: ${item.priority.toFixed(2)}`);
  lines.push(`  Risk: ${RISK_ICONS[item.risk]} | Decision: ${item.recommendedDecision}`);
  for (const reason of item.reasons.slice(0, 4)) {
    lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}

export function formatReviewBoardReport(report: ReviewBoardReport): string {
  const lines: string[] = [];

  lines.push("=== Strategic Change Review Board ===");
  lines.push(`Total: ${report.summary.totalItems} | Ready: ${report.summary.readyCount} | Caution: ${report.summary.cautionCount} | Blocked: ${report.summary.blockedCount}`);
  lines.push(`Decisions: Approve ${report.summary.approveCount} | Defer ${report.summary.deferCount} | Reject ${report.summary.rejectCount}`);
  lines.push("");

  if (report.readyItems.length > 0) {
    lines.push("── Ready for Decision ──");
    for (const item of report.readyItems) {
      lines.push(formatReviewItem(item));
      lines.push("");
    }
  }

  if (report.cautionItems.length > 0) {
    lines.push("── Caution ──");
    for (const item of report.cautionItems) {
      lines.push(formatReviewItem(item));
      lines.push("");
    }
  }

  if (report.blockedItems.length > 0) {
    lines.push("── Blocked ──");
    for (const item of report.blockedItems) {
      lines.push(formatReviewItem(item));
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
