/**
 * Factory Observability Dashboard API
 *
 * Aggregates read-only data from existing Factory modules:
 * - Template health governance
 * - Provider scoreboard
 * - Regression runner
 * - Autopilot
 * - Evolution engine
 * - Cost guardrail
 *
 * No new storage layers. No mutations.
 */

import { NextResponse } from "next/server";

import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";
import {
  TEMPLATE_REGISTRY,
} from "@/lib/templates/template-registry";
import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
  type TemplateGovernanceResult,
  type GovernanceSummaryRollup,
} from "@/lib/factory/template-health-governance";
import {
  buildEvolutionReport,
} from "@/lib/factory/template-evolution-engine";
import {
  DEFAULT_AUTOPILOT_CONFIG,
  selectForAutopilot,
} from "@/lib/factory/template-autopilot";
import {
  REGRESSION_CONFIG_REGISTRY,
  type TemplateRegressionConfig,
} from "@/lib/regression/template-regression-config";
import {
  listRoutes,
} from "@/lib/providers/task-router";
import {
  MODEL_PRICING,
} from "@/lib/providers/provider-pricing";
import {
  DEFAULT_STEP_COST_ESTIMATES,
} from "@/lib/providers/cost-guardrail";
import {
  buildApprovalReport,
  type ApprovalReport,
} from "@/lib/factory/human-approval-workflow";
import {
  buildAdoptionReport,
  type AdoptionReport,
} from "@/lib/factory/approved-change-adoption";
import {
  buildPromotionReport,
  type PromotionReport,
} from "@/lib/factory/policy-promotion";
import {
  buildRollbackExecutionReport,
  buildUnifiedAuditReport,
  type RollbackExecutionReport,
  type UnifiedAuditReport,
} from "@/lib/factory/factory-audit-rollback";
import {
  buildMarketplaceReport,
  type MarketplaceReport,
} from "@/lib/factory/template-marketplace";
import {
  buildRoleApprovalReport,
  type RoleApprovalReport,
} from "@/lib/factory/team-role-approval";
import {
  buildDerivationReport,
  type DerivationReport,
} from "@/lib/factory/marketplace-derivation-pipeline";
import {
  buildOrchestrationReport,
  type OrchestrationReport,
} from "@/lib/factory/factory-orchestration";
import {
  buildTemplateRankingReport,
  type TemplateRankingReport,
} from "@/lib/factory/template-analytics-ranking";
import {
  buildTemplateReleaseReport,
  type TemplateReleaseReport,
} from "@/lib/factory/template-release-management";
import {
  buildRuntimeExecutionReport,
  type RuntimeExecutionReport,
} from "@/lib/factory/factory-runtime-execution";
import {
  buildTemplateRecommendationReport,
  type RecommendationReport,
} from "@/lib/factory/template-recommendation-engine";
import {
  buildPortfolioStrategyReport,
  type PortfolioStrategyReport,
} from "@/lib/factory/template-portfolio-strategy";
import {
  buildScenarioReport,
  type ScenarioReport,
} from "@/lib/factory/factory-scenario-planner";
import {
  buildStrategicKpiReport,
  type StrategicKpiReport,
} from "@/lib/factory/strategic-kpi-layer";
import {
  buildScenarioExecutionReport,
  type ScenarioExecutionReport,
} from "@/lib/factory/scenario-execution-bridge";
import {
  buildReviewBoardReport,
  type ReviewBoardReport,
} from "@/lib/factory/strategic-change-review-board";
import {
  buildScenarioExecutionGovernanceReport,
  type GovernanceReport,
} from "@/lib/factory/scenario-execution-governance";
import {
  buildAutomationHooksReport,
  type AutomationHooksReport,
} from "@/lib/factory/external-automation-hooks";
import {
  buildStrategicReviewWorkflowReport,
  type WorkflowReport,
} from "@/lib/factory/strategic-review-workflow";
import {
  buildNotificationPolicyReport,
  type NotificationPolicyReport,
} from "@/lib/factory/notification-policy-layer";
import {
  buildScenarioAutoPromotionReport,
  type AutoPromotionReport,
} from "@/lib/factory/scenario-auto-promotion";
import {
  buildStrategicReviewWorkflowV3Report,
  type WorkflowV3Report,
} from "@/lib/factory/strategic-review-workflow-v3";
import {
  buildNotificationEscalationReport,
  type EscalationReport,
} from "@/lib/factory/notification-escalation-rules";
import {
  buildScenarioAutoExecutionGuardrailReport,
  type ScenarioAutoExecutionGuardrailsReport,
} from "@/lib/factory/scenario-auto-execution-guardrails";
import { resolveActorRole } from "@/lib/factory/team-role-approval";

// ── Response Types ────────────────────────────────────────────

interface TemplateHealthEntry {
  templateKey: string;
  label: string;
  statusBadge: "GREEN" | "DRAFT";
  currentState: string;
  nextState: string;
  decision: string;
  reasons: string[];
  signals: TemplateGovernanceResult["signals"];
  regressionConfig: TemplateRegressionConfig | null;
}

interface ProviderRouteEntry {
  taskKind: string;
  primary: string;
  fallback: string | null;
  expectedFormat: string;
}

interface EvolutionProposalEntry {
  templateId: string;
  domain: string;
  description: string;
  confidence: number;
  reasons: string[];
  relatedTemplates: string[];
}

interface AutopilotSelectionEntry {
  proposal: EvolutionProposalEntry;
  outcome: string;
  reason: string;
}

interface CostOverviewEntry {
  model: string;
  inputPer1M: number;
  outputPer1M: number;
}

interface DiscoveryOverview {
  totalDiscoveredIdeas: number;
  recentlyMatched: number;
  gapsDetected: number;
  topDomains: string[];
  lastRunAt: string | null;
}

interface FactoryDashboardData {
  overview: {
    totalTemplates: number;
    greenTemplates: number;
    atRiskTemplates: number;
    degradedTemplates: number;
    demotedTemplates: number;
    candidateTemplates: number;
    providerRouteCount: number;
    evolutionProposalCount: number;
    coveredDomainCount: number;
    uncoveredDomainCount: number;
  };
  templateHealth: TemplateHealthEntry[];
  governanceSummary: GovernanceSummaryRollup;
  providerRoutes: ProviderRouteEntry[];
  regressionConfigs: Array<{
    templateKey: string;
    label: string;
    config: TemplateRegressionConfig;
  }>;
  evolutionReport: {
    analyzedTemplateCount: number;
    coveredDomains: string[];
    uncoveredDomains: string[];
    proposals: EvolutionProposalEntry[];
    evaluatedAt: string;
  };
  autopilotSelection: {
    selected: EvolutionProposalEntry[];
    rejected: AutopilotSelectionEntry[];
    config: typeof DEFAULT_AUTOPILOT_CONFIG;
  };
  costOverview: {
    models: CostOverviewEntry[];
    defaultStepEstimates: typeof DEFAULT_STEP_COST_ESTIMATES;
  };
  approvalReport: ApprovalReport;
  adoptionReport: AdoptionReport;
  promotionReport: PromotionReport;
  rollbackReport: RollbackExecutionReport;
  auditReport: UnifiedAuditReport;
  marketplaceReport: MarketplaceReport;
  rolePermissions: RoleApprovalReport;
  derivationPipeline: DerivationReport;
  orchestrationReport: OrchestrationReport;
  templateRanking: TemplateRankingReport;
  templateRelease: TemplateReleaseReport;
  runtimeReport: RuntimeExecutionReport;
  recommendationReport: RecommendationReport;
  portfolioStrategy: PortfolioStrategyReport;
  scenarioPlanner: ScenarioReport;
  strategicKpis: StrategicKpiReport;
  scenarioExecution: ScenarioExecutionReport;
  reviewBoard: ReviewBoardReport;
  scenarioGovernance: GovernanceReport;
  automationHooks: AutomationHooksReport;
  reviewWorkflow: WorkflowReport;
  notificationPolicy: NotificationPolicyReport;
  scenarioAutoPromotion: AutoPromotionReport;
  reviewOperations: WorkflowV3Report;
  notificationEscalation: EscalationReport;
  scenarioAutoExecutionGuardrails: ScenarioAutoExecutionGuardrailsReport;
  discoveryOverview: DiscoveryOverview;
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Template health evaluation
    const templatesWithSignals = TEMPLATE_CATALOG.map((entry) => ({
      templateKey: entry.templateKey,
      signals: buildDefaultSignals(entry),
    }));

    const governanceBatch = evaluateAllTemplateHealth(templatesWithSignals);
    const governanceResults = governanceBatch.results;
    const governanceSummary = governanceBatch.summary;

    const templateHealth: TemplateHealthEntry[] = governanceResults.map((result) => {
      const catalog = TEMPLATE_CATALOG.find((c) => c.templateKey === result.templateKey);
      const regConfig = REGRESSION_CONFIG_REGISTRY.find(
        (r) => r.templateKey === result.templateKey
      ) ?? null;
      return {
        templateKey: result.templateKey,
        label: catalog?.label ?? result.templateKey,
        statusBadge: catalog?.statusBadge ?? "DRAFT",
        currentState: result.currentState,
        nextState: result.nextState,
        decision: result.decision,
        reasons: result.reasons,
        signals: result.signals,
        regressionConfig: regConfig,
      };
    });

    // 2. Provider routes
    const routes = listRoutes();
    const providerRoutes: ProviderRouteEntry[] = routes.map((r) => ({
      taskKind: r.taskKind,
      primary: r.primary,
      fallback: r.fallback ?? null,
      expectedFormat: r.expectedFormat,
    }));

    // 3. Evolution report
    const evolutionReport = buildEvolutionReport();
    const proposals: EvolutionProposalEntry[] = evolutionReport.proposals.map((p) => ({
      templateId: p.templateId,
      domain: p.domain,
      description: p.description,
      confidence: p.confidence,
      reasons: p.reasons,
      relatedTemplates: p.relatedTemplates,
    }));

    // 4. Autopilot selection (dry run evaluation)
    const autopilotSelection = selectForAutopilot(
      evolutionReport.proposals,
      DEFAULT_AUTOPILOT_CONFIG
    );

    const selectedProposals: EvolutionProposalEntry[] = autopilotSelection.selected.map((p) => ({
      templateId: p.templateId,
      domain: p.domain,
      description: p.description,
      confidence: p.confidence,
      reasons: p.reasons,
      relatedTemplates: p.relatedTemplates,
    }));

    const rejectedEntries: AutopilotSelectionEntry[] = autopilotSelection.rejected.map((r) => ({
      proposal: {
        templateId: r.proposal.templateId,
        domain: r.proposal.domain,
        description: r.proposal.description,
        confidence: r.proposal.confidence,
        reasons: r.proposal.reasons,
        relatedTemplates: r.proposal.relatedTemplates,
      },
      outcome: r.outcome,
      reason: r.reason,
    }));

    // 5. Cost overview
    const models: CostOverviewEntry[] = Object.entries(MODEL_PRICING).map(
      ([model, pricing]) => ({
        model,
        inputPer1M: pricing.inputPer1M,
        outputPer1M: pricing.outputPer1M,
      })
    );

    // 6. Regression configs
    const regressionConfigs = REGRESSION_CONFIG_REGISTRY.map((r) => {
      const manifest = TEMPLATE_REGISTRY[r.templateKey];
      return {
        templateKey: r.templateKey,
        label: manifest?.label ?? r.templateKey,
        config: r,
      };
    });

    // 7. Overview counts
    const greenCount = templateHealth.filter((t) => t.nextState === "green").length;
    const atRiskCount = templateHealth.filter((t) => t.nextState === "at_risk").length;
    const degradedCount = templateHealth.filter((t) => t.nextState === "degraded").length;
    const demotedCount = templateHealth.filter((t) => t.nextState === "demoted").length;
    const candidateCount = templateHealth.filter((t) => t.nextState === "candidate").length;

    // 8. Approval report
    const approvalReport = buildApprovalReport();

    // 9. Adoption report
    const adoptionReport = buildAdoptionReport();

    // 10. Promotion report (overview, no specific env pair)
    const promotionReport = buildPromotionReport();

    // 11. Rollback report
    const rollbackReport = buildRollbackExecutionReport();

    // 12. Unified audit report
    const auditReport = buildUnifiedAuditReport();

    // 13. Marketplace report
    const marketplaceReport = buildMarketplaceReport();

    // 14. Role permissions report
    const rolePermissions = buildRoleApprovalReport();

    // 15. Derivation pipeline report
    const derivationPipeline = buildDerivationReport();

    // 16. Orchestration report
    const orchestrationReport = buildOrchestrationReport();

    // 17. Template ranking report
    const templateRanking = buildTemplateRankingReport();

    // 18. Template release report
    const templateRelease = buildTemplateReleaseReport();

    // 19. Runtime execution report
    const runtimeReport = buildRuntimeExecutionReport();

    // 20. Recommendation report
    const recommendationReport = buildTemplateRecommendationReport();

    // 21. Portfolio strategy report
    const portfolioStrategy = buildPortfolioStrategyReport();

    // 22. Scenario planner report
    const scenarioPlanner = buildScenarioReport();

    // 23. Strategic KPI report
    const strategicKpis = buildStrategicKpiReport();

    // 24. Scenario execution report
    const scenarioExecution = buildScenarioExecutionReport();

    // 25. Review board report
    const reviewBoard = buildReviewBoardReport();

    // 26. Scenario execution governance report
    const scenarioGovernance = buildScenarioExecutionGovernanceReport();

    // 27. Automation hooks report
    const automationHooks = buildAutomationHooksReport();

    // 28. Review workflow report
    const reviewWorkflow = buildStrategicReviewWorkflowReport();

    // 29. Notification policy report
    const notificationPolicy = buildNotificationPolicyReport();

    // 30. Scenario auto-promotion report
    const scenarioAutoPromotion = buildScenarioAutoPromotionReport();

    // 31. Review operations (workflow v3) report
    const reviewOperations = buildStrategicReviewWorkflowV3Report();

    // 32. Notification escalation report
    const notificationEscalation = buildNotificationEscalationReport();

    // 33. Scenario auto-execution guardrails report (read-only)
    const systemActor = resolveActorRole("dashboard-service", "admin");
    const scenarioAutoExecutionGuardrails = buildScenarioAutoExecutionGuardrailReport(systemActor);

    // 34. Idea Discovery overview
    const discoveryOverview = {
      totalDiscoveredIdeas: 0,
      recentlyMatched: 0,
      gapsDetected: 0,
      topDomains: [] as string[],
      lastRunAt: null as string | null,
    };
    // Note: This will be populated once discovery has run
    // Storage adapter will read from data/idea-discovery/ directory

    const data: FactoryDashboardData = {
      overview: {
        totalTemplates: TEMPLATE_CATALOG.length,
        greenTemplates: greenCount,
        atRiskTemplates: atRiskCount,
        degradedTemplates: degradedCount,
        demotedTemplates: demotedCount,
        candidateTemplates: candidateCount,
        providerRouteCount: providerRoutes.length,
        evolutionProposalCount: proposals.length,
        coveredDomainCount: evolutionReport.coveredDomains.length,
        uncoveredDomainCount: evolutionReport.uncoveredDomains.length,
      },
      templateHealth,
      governanceSummary,
      providerRoutes,
      regressionConfigs,
      evolutionReport: {
        analyzedTemplateCount: evolutionReport.analyzedTemplateCount,
        coveredDomains: evolutionReport.coveredDomains,
        uncoveredDomains: evolutionReport.uncoveredDomains,
        proposals,
        evaluatedAt: evolutionReport.evaluatedAt,
      },
      autopilotSelection: {
        selected: selectedProposals,
        rejected: rejectedEntries,
        config: DEFAULT_AUTOPILOT_CONFIG,
      },
      costOverview: {
        models,
        defaultStepEstimates: DEFAULT_STEP_COST_ESTIMATES,
      },
      approvalReport,
      adoptionReport,
      promotionReport,
      rollbackReport,
      auditReport,
      marketplaceReport,
      rolePermissions,
      derivationPipeline,
      orchestrationReport,
      templateRanking,
      templateRelease,
      runtimeReport,
      recommendationReport,
      portfolioStrategy,
      scenarioPlanner,
      strategicKpis,
      scenarioExecution,
      reviewBoard,
      scenarioGovernance,
      automationHooks,
      reviewWorkflow,
      notificationPolicy,
      scenarioAutoPromotion,
      reviewOperations,
      notificationEscalation,
      scenarioAutoExecutionGuardrails,
      discoveryOverview,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(data);
  } catch (err) {
    console.error("[factory-dashboard] Error:", err);
    return NextResponse.json(
      { error: "Failed to build factory dashboard data" },
      { status: 500 }
    );
  }
}
