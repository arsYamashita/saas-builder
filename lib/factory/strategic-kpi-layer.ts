/**
 * Strategic KPI Layer v1
 *
 * Provides:
 *   1. Deterministic KPI computation across 5 categories
 *   2. Status classification (strong / healthy / warning / weak)
 *   3. Domain-level rollups
 *   4. Strategy linkage (portfolio strategy → KPI impact)
 *   5. Explainable reasons per KPI
 *
 * Reporting only. No state mutation. No ML. No external APIs.
 * All KPIs are deterministic and explainable.
 */

import {
  evaluateAllTemplateHealth,
  type GovernanceSummaryRollup,
} from "./template-health-governance";
import {
  buildTemplateRankingReport,
  type TemplateRankingReport,
} from "./template-analytics-ranking";
import {
  buildMarketplaceReport,
  type MarketplaceReport,
} from "./template-marketplace";
import {
  buildTemplateReleaseReport,
  type TemplateReleaseReport,
} from "./template-release-management";
import {
  buildRuntimeExecutionReport,
  type RuntimeExecutionReport,
} from "./factory-runtime-execution";
import {
  buildOrchestrationReport,
  type OrchestrationReport,
} from "./factory-orchestration";
import {
  buildRollbackExecutionReport,
  type RollbackExecutionReport,
} from "./factory-audit-rollback";
import {
  buildPortfolioStrategyReport,
  type PortfolioStrategyReport,
  type DomainStrategyRecord,
} from "./template-portfolio-strategy";
import {
  buildScenarioReport,
  type ScenarioReport,
} from "./factory-scenario-planner";
import {
  buildTemplateRecommendationReport,
  type RecommendationReport,
} from "./template-recommendation-engine";
import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "../templates/template-catalog";
import type { TemplateHealthSignals } from "./template-health-governance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KpiCategory =
  | "portfolio"
  | "quality_stability"
  | "marketplace"
  | "release_runtime"
  | "strategy_scenario";

export type KpiStatus = "strong" | "healthy" | "warning" | "weak";

export interface KpiRecord {
  kpiKey: string;
  category: KpiCategory;
  label: string;
  value: number;
  unit: string;
  status: KpiStatus;
  reasons: string[];
}

export interface DomainKpiRollup {
  domain: string;
  strategy: string;
  kpis: KpiRecord[];
  overallStatus: KpiStatus;
}

export interface KpiCategorySummary {
  category: KpiCategory;
  label: string;
  kpis: KpiRecord[];
  strongCount: number;
  healthyCount: number;
  warningCount: number;
  weakCount: number;
  overallStatus: KpiStatus;
}

export interface StrategicKpiReport {
  categories: KpiCategorySummary[];
  domainRollups: DomainKpiRollup[];
  summary: {
    totalKpis: number;
    strongCount: number;
    healthyCount: number;
    warningCount: number;
    weakCount: number;
    overallStatus: KpiStatus;
    overallScore: number;
  };
  generatedAt: string;
}

export interface KpiInputs {
  governanceSummary: GovernanceSummaryRollup;
  rankingReport: TemplateRankingReport;
  marketplaceReport: MarketplaceReport;
  releaseReport: TemplateReleaseReport;
  runtimeReport: RuntimeExecutionReport;
  orchestrationReport: OrchestrationReport;
  rollbackReport: RollbackExecutionReport;
  portfolioReport: PortfolioStrategyReport;
  scenarioReport: ScenarioReport;
  recommendationReport: RecommendationReport;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<KpiCategory, string> = {
  portfolio: "ポートフォリオ",
  quality_stability: "品質・安定性",
  marketplace: "マーケットプレイス",
  release_runtime: "リリース・ランタイム",
  strategy_scenario: "戦略・シナリオ",
};

// ---------------------------------------------------------------------------
// Status classification helpers
// ---------------------------------------------------------------------------

function classifyRate(value: number, thresholds: { strong: number; healthy: number; warning: number }): KpiStatus {
  if (value >= thresholds.strong) return "strong";
  if (value >= thresholds.healthy) return "healthy";
  if (value >= thresholds.warning) return "warning";
  return "weak";
}

function classifyCount(value: number, thresholds: { strong: number; healthy: number; warning: number }): KpiStatus {
  if (value >= thresholds.strong) return "strong";
  if (value >= thresholds.healthy) return "healthy";
  if (value >= thresholds.warning) return "warning";
  return "weak";
}

function classifyCountInverse(value: number, thresholds: { strong: number; healthy: number; warning: number }): KpiStatus {
  // Lower is better
  if (value <= thresholds.strong) return "strong";
  if (value <= thresholds.healthy) return "healthy";
  if (value <= thresholds.warning) return "warning";
  return "weak";
}

// ---------------------------------------------------------------------------
// Category 1: Portfolio KPIs
// ---------------------------------------------------------------------------

export function computePortfolioKpis(inputs: KpiInputs): KpiRecord[] {
  const { governanceSummary, portfolioReport, rankingReport } = inputs;
  const kpis: KpiRecord[] = [];

  // KPI 1.1: Green rate
  const total = governanceSummary.greenCount + governanceSummary.candidateCount +
    governanceSummary.atRiskCount + governanceSummary.degradedCount + governanceSummary.demotedCount;
  const greenRate = total > 0 ? governanceSummary.greenCount / total : 0;
  const greenStatus = classifyRate(greenRate, { strong: 0.8, healthy: 0.6, warning: 0.4 });
  kpis.push({
    kpiKey: "portfolio_green_rate",
    category: "portfolio",
    label: "GREEN テンプレート率",
    value: Math.round(greenRate * 1000) / 10,
    unit: "%",
    status: greenStatus,
    reasons: [
      `${governanceSummary.greenCount}/${total} テンプレートが GREEN`,
      greenStatus === "strong" ? "高い GREEN 率を維持" : greenStatus === "weak" ? "GREEN 率の改善が必要" : "",
    ].filter(Boolean),
  });

  // KPI 1.2: Domain coverage rate
  const { coveredDomains, totalDomains } = portfolioReport.summary;
  const coverageRate = totalDomains > 0 ? coveredDomains / totalDomains : 0;
  const coverageStatus = classifyRate(coverageRate, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "portfolio_domain_coverage",
    category: "portfolio",
    label: "ドメインカバレッジ率",
    value: Math.round(coverageRate * 1000) / 10,
    unit: "%",
    status: coverageStatus,
    reasons: [
      `${coveredDomains}/${totalDomains} ドメインをカバー`,
      `未カバー: ${portfolioReport.summary.uncoveredDomains} ドメイン`,
    ],
  });

  // KPI 1.3: Average overall rank score
  const avgScore = rankingReport.summary.averageOverallScore;
  const avgScoreStatus = classifyRate(avgScore, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "portfolio_avg_rank_score",
    category: "portfolio",
    label: "平均ランクスコア",
    value: Math.round(avgScore * 1000) / 10,
    unit: "%",
    status: avgScoreStatus,
    reasons: [
      `${rankingReport.summary.totalTemplates} テンプレートの平均`,
      `Rising: ${rankingReport.summary.risingCount}, Declining: ${rankingReport.summary.decliningCount}`,
    ],
  });

  // KPI 1.4: Portfolio gap count
  const gapCount = portfolioReport.gaps.length;
  const gapStatus = classifyCountInverse(gapCount, { strong: 0, healthy: 2, warning: 4 });
  kpis.push({
    kpiKey: "portfolio_gap_count",
    category: "portfolio",
    label: "ポートフォリオギャップ数",
    value: gapCount,
    unit: "件",
    status: gapStatus,
    reasons: [
      gapCount === 0 ? "ギャップなし" : `${gapCount} ドメインにギャップ`,
      ...portfolioReport.gaps.slice(0, 3).map((g) => `${g.domain}: fillPriority=${g.fillPriority.toFixed(2)}`),
    ],
  });

  // KPI 1.5: Average coverage score
  const avgCoverage = portfolioReport.summary.averageCoverageScore;
  const avgCoverageStatus = classifyRate(avgCoverage, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "portfolio_avg_coverage_score",
    category: "portfolio",
    label: "平均カバレッジスコア",
    value: Math.round(avgCoverage * 1000) / 10,
    unit: "%",
    status: avgCoverageStatus,
    reasons: [
      `Expand: ${portfolioReport.summary.expandCount}, Stabilize: ${portfolioReport.summary.stabilizeCount}`,
      `Maintain: ${portfolioReport.summary.maintainCount}, Gap Fill: ${portfolioReport.summary.gapFillCount}`,
    ],
  });

  return kpis;
}

// ---------------------------------------------------------------------------
// Category 2: Quality & Stability KPIs
// ---------------------------------------------------------------------------

export function computeQualityStabilityKpis(inputs: KpiInputs): KpiRecord[] {
  const { governanceSummary, rankingReport, rollbackReport } = inputs;
  const kpis: KpiRecord[] = [];

  // KPI 2.1: Average health score
  const avgHealth = rankingReport.summary.averageHealthScore;
  const healthStatus = classifyRate(avgHealth, { strong: 0.8, healthy: 0.6, warning: 0.4 });
  kpis.push({
    kpiKey: "quality_avg_health_score",
    category: "quality_stability",
    label: "平均ヘルススコア",
    value: Math.round(avgHealth * 1000) / 10,
    unit: "%",
    status: healthStatus,
    reasons: [
      `${rankingReport.summary.totalTemplates} テンプレートの平均`,
      healthStatus === "strong" ? "全体的に健全" : "ヘルス改善の余地あり",
    ],
  });

  // KPI 2.2: At-risk + degraded rate
  const totalTemplates = governanceSummary.greenCount + governanceSummary.candidateCount +
    governanceSummary.atRiskCount + governanceSummary.degradedCount + governanceSummary.demotedCount;
  const riskCount = governanceSummary.atRiskCount + governanceSummary.degradedCount;
  const riskRate = totalTemplates > 0 ? riskCount / totalTemplates : 0;
  const riskStatus = classifyCountInverse(riskRate, { strong: 0, healthy: 0.1, warning: 0.3 });
  kpis.push({
    kpiKey: "quality_risk_rate",
    category: "quality_stability",
    label: "リスクテンプレート率",
    value: Math.round(riskRate * 1000) / 10,
    unit: "%",
    status: riskStatus,
    reasons: [
      `At Risk: ${governanceSummary.atRiskCount}, Degraded: ${governanceSummary.degradedCount}`,
      `Demoted: ${governanceSummary.demotedCount}`,
    ],
  });

  // KPI 2.3: Stable template ratio (from ranking trends)
  const stableRate = rankingReport.summary.totalTemplates > 0
    ? rankingReport.summary.stableCount / rankingReport.summary.totalTemplates
    : 0;
  const stableStatus = classifyRate(stableRate, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "quality_stable_rate",
    category: "quality_stability",
    label: "安定テンプレート率",
    value: Math.round(stableRate * 1000) / 10,
    unit: "%",
    status: stableStatus,
    reasons: [
      `Stable: ${rankingReport.summary.stableCount}/${rankingReport.summary.totalTemplates}`,
      `Rising: ${rankingReport.summary.risingCount}, Declining: ${rankingReport.summary.decliningCount}`,
    ],
  });

  // KPI 2.4: Rollback failure count
  const rollbackFailures = rollbackReport.summary.failedCount;
  const rollbackStatus = classifyCountInverse(rollbackFailures, { strong: 0, healthy: 1, warning: 3 });
  kpis.push({
    kpiKey: "quality_rollback_failures",
    category: "quality_stability",
    label: "ロールバック失敗数",
    value: rollbackFailures,
    unit: "件",
    status: rollbackStatus,
    reasons: [
      `総候補: ${rollbackReport.summary.totalCandidates}`,
      `成功: ${rollbackReport.summary.rolledBackCount}, スキップ: ${rollbackReport.summary.skippedCount}`,
      rollbackFailures > 0 ? `${rollbackFailures} 件のロールバック失敗` : "ロールバック失敗なし",
    ],
  });

  // KPI 2.5: Promote-eligible count
  const promoteEligible = governanceSummary.promoteToGreenCount;
  const promoteStatus = classifyCount(promoteEligible, { strong: 3, healthy: 1, warning: 0 });
  kpis.push({
    kpiKey: "quality_promote_eligible",
    category: "quality_stability",
    label: "GREEN昇格候補数",
    value: promoteEligible,
    unit: "件",
    status: promoteStatus,
    reasons: [
      `${promoteEligible} テンプレートが GREEN 昇格可能`,
      governanceSummary.eligibleForRepromotionCount > 0
        ? `再昇格候補: ${governanceSummary.eligibleForRepromotionCount}`
        : "",
    ].filter(Boolean),
  });

  return kpis;
}

// ---------------------------------------------------------------------------
// Category 3: Marketplace KPIs
// ---------------------------------------------------------------------------

export function computeMarketplaceKpis(inputs: KpiInputs): KpiRecord[] {
  const { marketplaceReport, recommendationReport } = inputs;
  const kpis: KpiRecord[] = [];

  // KPI 3.1: Published rate
  const totalItems = marketplaceReport.summary.totalItems;
  const publishedRate = totalItems > 0
    ? marketplaceReport.summary.publishedCount / totalItems
    : 0;
  const publishedStatus = classifyRate(publishedRate, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "marketplace_published_rate",
    category: "marketplace",
    label: "公開テンプレート率",
    value: Math.round(publishedRate * 1000) / 10,
    unit: "%",
    status: publishedStatus,
    reasons: [
      `Published: ${marketplaceReport.summary.publishedCount}/${totalItems}`,
      `Experimental: ${marketplaceReport.summary.experimentalCount}`,
    ],
  });

  // KPI 3.2: Adoption intent count
  const adoptionCount = marketplaceReport.summary.adoptionIntentCount;
  const adoptionStatus = classifyCount(adoptionCount, { strong: 5, healthy: 2, warning: 1 });
  kpis.push({
    kpiKey: "marketplace_adoption_intents",
    category: "marketplace",
    label: "アダプションインテント数",
    value: adoptionCount,
    unit: "件",
    status: adoptionStatus,
    reasons: [
      `${adoptionCount} 件のアダプションインテント`,
      adoptionCount === 0 ? "インテント獲得が必要" : "",
    ].filter(Boolean),
  });

  // KPI 3.3: Derivation intent count
  const derivationCount = marketplaceReport.summary.derivationIntentCount;
  const derivationStatus = classifyCount(derivationCount, { strong: 3, healthy: 1, warning: 0 });
  kpis.push({
    kpiKey: "marketplace_derivation_intents",
    category: "marketplace",
    label: "デリベーションインテント数",
    value: derivationCount,
    unit: "件",
    status: derivationStatus,
    reasons: [
      `${derivationCount} 件のデリベーションインテント`,
    ],
  });

  // KPI 3.4: Best derivation parent count
  const derivationParentCount = recommendationReport.summary.bestDerivationParentCount;
  const derivationParentStatus = classifyCount(derivationParentCount, { strong: 3, healthy: 1, warning: 0 });
  kpis.push({
    kpiKey: "marketplace_derivation_parents",
    category: "marketplace",
    label: "優良派生元テンプレート数",
    value: derivationParentCount,
    unit: "件",
    status: derivationParentStatus,
    reasons: [
      `${derivationParentCount} テンプレートが派生元として推奨`,
    ],
  });

  // KPI 3.5: Underused high-quality count
  const underusedCount = recommendationReport.summary.underusedCount;
  const underusedStatus = classifyCountInverse(underusedCount, { strong: 0, healthy: 1, warning: 3 });
  kpis.push({
    kpiKey: "marketplace_underused_count",
    category: "marketplace",
    label: "未活用高品質テンプレート数",
    value: underusedCount,
    unit: "件",
    status: underusedStatus,
    reasons: [
      underusedCount > 0
        ? `${underusedCount} 件の高品質テンプレートが未活用`
        : "全高品質テンプレートが活用済み",
    ],
  });

  return kpis;
}

// ---------------------------------------------------------------------------
// Category 4: Release & Runtime KPIs
// ---------------------------------------------------------------------------

export function computeReleaseRuntimeKpis(inputs: KpiInputs): KpiRecord[] {
  const { releaseReport, runtimeReport, orchestrationReport } = inputs;
  const kpis: KpiRecord[] = [];

  // KPI 4.1: Production template count
  const prodCount = releaseReport.summary.prodCount;
  const prodStatus = classifyCount(prodCount, { strong: 3, healthy: 1, warning: 0 });
  kpis.push({
    kpiKey: "release_prod_count",
    category: "release_runtime",
    label: "本番テンプレート数",
    value: prodCount,
    unit: "件",
    status: prodStatus,
    reasons: [
      `Dev: ${releaseReport.summary.devCount}, Staging: ${releaseReport.summary.stagingCount}, Prod: ${prodCount}`,
      `候補: ${releaseReport.summary.candidateCount}`,
    ],
  });

  // KPI 4.2: Release pipeline depth
  const pipelineDepth = releaseReport.summary.devCount + releaseReport.summary.stagingCount + prodCount;
  const totalReleasable = pipelineDepth + releaseReport.summary.candidateCount;
  const pipelineRate = totalReleasable > 0 ? pipelineDepth / totalReleasable : 0;
  const pipelineStatus = classifyRate(pipelineRate, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "release_pipeline_rate",
    category: "release_runtime",
    label: "リリースパイプライン進捗率",
    value: Math.round(pipelineRate * 1000) / 10,
    unit: "%",
    status: pipelineStatus,
    reasons: [
      `${pipelineDepth}/${totalReleasable} テンプレートがパイプラインに乗っている`,
    ],
  });

  // KPI 4.3: Runtime success rate
  const recentRuns = runtimeReport.recentRuns;
  const completedRuns = recentRuns.filter((r) => r.status === "completed").length;
  const runtimeSuccessRate = recentRuns.length > 0 ? completedRuns / recentRuns.length : 0;
  const runtimeStatus = classifyRate(runtimeSuccessRate, { strong: 0.9, healthy: 0.7, warning: 0.5 });
  kpis.push({
    kpiKey: "release_runtime_success_rate",
    category: "release_runtime",
    label: "ランタイム成功率",
    value: Math.round(runtimeSuccessRate * 1000) / 10,
    unit: "%",
    status: runtimeStatus,
    reasons: [
      `${completedRuns}/${recentRuns.length} 回の実行が成功`,
      runtimeReport.summary.lastRunStatus
        ? `最終実行: ${runtimeReport.summary.lastRunStatus}`
        : "実行履歴なし",
    ],
  });

  // KPI 4.4: Orchestration success rate
  const orchRuns = orchestrationReport.recentRuns;
  const orchCompleted = orchRuns.filter((r) => r.status === "completed").length;
  const orchSuccessRate = orchRuns.length > 0 ? orchCompleted / orchRuns.length : 0;
  const orchStatus = classifyRate(orchSuccessRate, { strong: 0.9, healthy: 0.7, warning: 0.5 });
  kpis.push({
    kpiKey: "release_orchestration_success_rate",
    category: "release_runtime",
    label: "オーケストレーション成功率",
    value: Math.round(orchSuccessRate * 1000) / 10,
    unit: "%",
    status: orchStatus,
    reasons: [
      `${orchCompleted}/${orchRuns.length} 回のオーケストレーションが成功`,
      `総ジョブ数: ${orchestrationReport.summary.totalJobs}`,
    ],
  });

  // KPI 4.5: Total runtime runs
  const totalRuns = runtimeReport.summary.totalRuns;
  const runsStatus = classifyCount(totalRuns, { strong: 5, healthy: 2, warning: 1 });
  kpis.push({
    kpiKey: "release_total_runs",
    category: "release_runtime",
    label: "総実行回数",
    value: totalRuns,
    unit: "回",
    status: runsStatus,
    reasons: [
      `累計 ${totalRuns} 回の実行`,
      runtimeReport.summary.lastRunAt
        ? `最終実行: ${runtimeReport.summary.lastRunAt}`
        : "未実行",
    ],
  });

  return kpis;
}

// ---------------------------------------------------------------------------
// Category 5: Strategy & Scenario KPIs
// ---------------------------------------------------------------------------

export function computeStrategyScenarioKpis(inputs: KpiInputs): KpiRecord[] {
  const { portfolioReport, scenarioReport } = inputs;
  const kpis: KpiRecord[] = [];

  // KPI 5.1: Total scenario count
  const totalScenarios = scenarioReport.summary.totalScenarios;
  const scenarioStatus = classifyCount(totalScenarios, { strong: 5, healthy: 2, warning: 1 });
  kpis.push({
    kpiKey: "strategy_total_scenarios",
    category: "strategy_scenario",
    label: "シナリオ総数",
    value: totalScenarios,
    unit: "件",
    status: scenarioStatus,
    reasons: [
      `Expand: ${scenarioReport.summary.expansionCount}`,
      `Gap Fill: ${scenarioReport.summary.gapFillCount}`,
      `Stabilize: ${scenarioReport.summary.stabilizationCount}`,
    ],
  });

  // KPI 5.2: Average scenario priority
  const avgPriority = scenarioReport.summary.averagePriority;
  const priorityStatus = classifyRate(avgPriority, { strong: 0.7, healthy: 0.5, warning: 0.3 });
  kpis.push({
    kpiKey: "strategy_avg_priority",
    category: "strategy_scenario",
    label: "平均シナリオ優先度",
    value: Math.round(avgPriority * 1000) / 10,
    unit: "%",
    status: priorityStatus,
    reasons: [
      `${totalScenarios} シナリオの平均優先度`,
      `新規テンプレート計画: ${scenarioReport.summary.totalNewTemplates}`,
    ],
  });

  // KPI 5.3: Expand strategy domains
  const expandCount = portfolioReport.summary.expandCount;
  const expandStatus = classifyCount(expandCount, { strong: 3, healthy: 1, warning: 0 });
  kpis.push({
    kpiKey: "strategy_expand_domains",
    category: "strategy_scenario",
    label: "拡大戦略ドメイン数",
    value: expandCount,
    unit: "件",
    status: expandStatus,
    reasons: [
      `${expandCount} ドメインが拡大対象`,
    ],
  });

  // KPI 5.4: Stabilize strategy domains
  const stabilizeCount = portfolioReport.summary.stabilizeCount;
  const stabilizeStatus = classifyCountInverse(stabilizeCount, { strong: 0, healthy: 1, warning: 3 });
  kpis.push({
    kpiKey: "strategy_stabilize_domains",
    category: "strategy_scenario",
    label: "安定化必要ドメイン数",
    value: stabilizeCount,
    unit: "件",
    status: stabilizeStatus,
    reasons: [
      stabilizeCount === 0
        ? "安定化が必要なドメインなし"
        : `${stabilizeCount} ドメインで安定化が必要`,
    ],
  });

  // KPI 5.5: Total planned new templates
  const plannedNewTemplates = scenarioReport.summary.totalNewTemplates;
  const plannedStatus = classifyCount(plannedNewTemplates, { strong: 5, healthy: 2, warning: 1 });
  kpis.push({
    kpiKey: "strategy_planned_templates",
    category: "strategy_scenario",
    label: "計画中の新規テンプレート数",
    value: plannedNewTemplates,
    unit: "件",
    status: plannedStatus,
    reasons: [
      `${plannedNewTemplates} テンプレートの追加を計画中`,
    ],
  });

  return kpis;
}

// ---------------------------------------------------------------------------
// Domain-level rollups
// ---------------------------------------------------------------------------

export function computeDomainKpiRollups(inputs: KpiInputs): DomainKpiRollup[] {
  const { portfolioReport, rankingReport } = inputs;
  const rollups: DomainKpiRollup[] = [];

  for (const domainStrategy of portfolioReport.domainStrategies) {
    const domainTemplates = rankingReport.rankings.filter(
      (r) => r.domain === domainStrategy.domain
    );

    const domainKpis: KpiRecord[] = [];

    // Domain health score
    const healthScore = domainStrategy.averageHealthScore;
    domainKpis.push({
      kpiKey: `domain_health_${domainStrategy.domain}`,
      category: "quality_stability",
      label: "ドメインヘルススコア",
      value: Math.round(healthScore * 1000) / 10,
      unit: "%",
      status: classifyRate(healthScore, { strong: 0.8, healthy: 0.6, warning: 0.4 }),
      reasons: [
        `${domainStrategy.templateCount} テンプレート, GREEN: ${domainStrategy.greenCount}`,
      ],
    });

    // Domain coverage score
    const coverageScore = domainStrategy.coverageScore;
    domainKpis.push({
      kpiKey: `domain_coverage_${domainStrategy.domain}`,
      category: "portfolio",
      label: "ドメインカバレッジスコア",
      value: Math.round(coverageScore * 1000) / 10,
      unit: "%",
      status: classifyRate(coverageScore, { strong: 0.7, healthy: 0.5, warning: 0.3 }),
      reasons: [
        `戦略: ${domainStrategy.strategy}`,
        `Prod: ${domainStrategy.prodCount}, Adoption: ${domainStrategy.adoptionInterest}`,
      ],
    });

    // Domain template count
    domainKpis.push({
      kpiKey: `domain_template_count_${domainStrategy.domain}`,
      category: "portfolio",
      label: "テンプレート数",
      value: domainStrategy.templateCount,
      unit: "件",
      status: classifyCount(domainStrategy.templateCount, { strong: 3, healthy: 1, warning: 0 }),
      reasons: [
        `GREEN: ${domainStrategy.greenCount}, Prod: ${domainStrategy.prodCount}`,
      ],
    });

    // Determine overall domain status
    const statuses = domainKpis.map((k) => k.status);
    const overallStatus = computeOverallStatus(statuses);

    rollups.push({
      domain: domainStrategy.domain,
      strategy: domainStrategy.strategy,
      kpis: domainKpis,
      overallStatus,
    });
  }

  return rollups;
}

// ---------------------------------------------------------------------------
// Overall status computation
// ---------------------------------------------------------------------------

function statusToScore(status: KpiStatus): number {
  switch (status) {
    case "strong": return 4;
    case "healthy": return 3;
    case "warning": return 2;
    case "weak": return 1;
  }
}

function scoreToStatus(score: number): KpiStatus {
  if (score >= 3.5) return "strong";
  if (score >= 2.5) return "healthy";
  if (score >= 1.5) return "warning";
  return "weak";
}

function computeOverallStatus(statuses: KpiStatus[]): KpiStatus {
  if (statuses.length === 0) return "weak";
  const avgScore = statuses.reduce((sum, s) => sum + statusToScore(s), 0) / statuses.length;
  return scoreToStatus(avgScore);
}

// ---------------------------------------------------------------------------
// Category summary builder
// ---------------------------------------------------------------------------

function buildCategorySummary(category: KpiCategory, kpis: KpiRecord[]): KpiCategorySummary {
  const strongCount = kpis.filter((k) => k.status === "strong").length;
  const healthyCount = kpis.filter((k) => k.status === "healthy").length;
  const warningCount = kpis.filter((k) => k.status === "warning").length;
  const weakCount = kpis.filter((k) => k.status === "weak").length;

  return {
    category,
    label: CATEGORY_LABELS[category],
    kpis,
    strongCount,
    healthyCount,
    warningCount,
    weakCount,
    overallStatus: computeOverallStatus(kpis.map((k) => k.status)),
  };
}

// ---------------------------------------------------------------------------
// Main report builder
// ---------------------------------------------------------------------------

function buildDefaultGovernanceSummary(): GovernanceSummaryRollup {
  const templatesWithSignals = TEMPLATE_CATALOG.map((entry) => ({
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

export function buildStrategicKpiReport(overrides?: Partial<KpiInputs>): StrategicKpiReport {
  const inputs: KpiInputs = {
    governanceSummary: overrides?.governanceSummary ?? buildDefaultGovernanceSummary(),
    rankingReport: overrides?.rankingReport ?? buildTemplateRankingReport(),
    marketplaceReport: overrides?.marketplaceReport ?? buildMarketplaceReport(),
    releaseReport: overrides?.releaseReport ?? buildTemplateReleaseReport(),
    runtimeReport: overrides?.runtimeReport ?? buildRuntimeExecutionReport(),
    orchestrationReport: overrides?.orchestrationReport ?? buildOrchestrationReport(),
    rollbackReport: overrides?.rollbackReport ?? buildRollbackExecutionReport(),
    portfolioReport: overrides?.portfolioReport ?? buildPortfolioStrategyReport(),
    scenarioReport: overrides?.scenarioReport ?? buildScenarioReport(),
    recommendationReport: overrides?.recommendationReport ?? buildTemplateRecommendationReport(),
  };

  const portfolioKpis = computePortfolioKpis(inputs);
  const qualityKpis = computeQualityStabilityKpis(inputs);
  const marketplaceKpis = computeMarketplaceKpis(inputs);
  const releaseKpis = computeReleaseRuntimeKpis(inputs);
  const strategyKpis = computeStrategyScenarioKpis(inputs);

  const categories: KpiCategorySummary[] = [
    buildCategorySummary("portfolio", portfolioKpis),
    buildCategorySummary("quality_stability", qualityKpis),
    buildCategorySummary("marketplace", marketplaceKpis),
    buildCategorySummary("release_runtime", releaseKpis),
    buildCategorySummary("strategy_scenario", strategyKpis),
  ];

  const domainRollups = computeDomainKpiRollups(inputs);

  const allKpis = [...portfolioKpis, ...qualityKpis, ...marketplaceKpis, ...releaseKpis, ...strategyKpis];
  const strongCount = allKpis.filter((k) => k.status === "strong").length;
  const healthyCount = allKpis.filter((k) => k.status === "healthy").length;
  const warningCount = allKpis.filter((k) => k.status === "warning").length;
  const weakCount = allKpis.filter((k) => k.status === "weak").length;
  const overallScore = allKpis.length > 0
    ? allKpis.reduce((sum, k) => sum + statusToScore(k.status), 0) / allKpis.length
    : 0;

  return {
    categories,
    domainRollups,
    summary: {
      totalKpis: allKpis.length,
      strongCount,
      healthyCount,
      warningCount,
      weakCount,
      overallStatus: scoreToStatus(overallScore),
      overallScore: Math.round(overallScore * 100) / 100,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<KpiStatus, string> = {
  strong: "[STRONG]",
  healthy: "[HEALTHY]",
  warning: "[WARNING]",
  weak: "[WEAK]",
};

export function formatKpiRecord(kpi: KpiRecord): string {
  const lines: string[] = [];
  lines.push(`  ${STATUS_ICONS[kpi.status]} ${kpi.label}: ${kpi.value}${kpi.unit}`);
  for (const reason of kpi.reasons) {
    lines.push(`    - ${reason}`);
  }
  return lines.join("\n");
}

export function formatCategorySummary(summary: KpiCategorySummary): string {
  const lines: string[] = [];
  lines.push(`── ${summary.label} ${STATUS_ICONS[summary.overallStatus]} ──`);
  for (const kpi of summary.kpis) {
    lines.push(formatKpiRecord(kpi));
  }
  return lines.join("\n");
}

export function formatStrategicKpiReport(report: StrategicKpiReport): string {
  const lines: string[] = [];

  lines.push("=== Strategic KPI Report ===");
  lines.push(`Overall: ${STATUS_ICONS[report.summary.overallStatus]} (Score: ${report.summary.overallScore})`);
  lines.push(`Strong: ${report.summary.strongCount} / Healthy: ${report.summary.healthyCount} / Warning: ${report.summary.warningCount} / Weak: ${report.summary.weakCount}`);
  lines.push("");

  for (const category of report.categories) {
    lines.push(formatCategorySummary(category));
    lines.push("");
  }

  if (report.domainRollups.length > 0) {
    lines.push("── ドメイン別ロールアップ ──");
    for (const rollup of report.domainRollups) {
      lines.push(`  ${rollup.domain} (${rollup.strategy}) ${STATUS_ICONS[rollup.overallStatus]}`);
      for (const kpi of rollup.kpis) {
        lines.push(`    ${kpi.label}: ${kpi.value}${kpi.unit} ${STATUS_ICONS[kpi.status]}`);
      }
    }
    lines.push("");
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
