"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────

type TemplateHealthEntry = {
  templateKey: string;
  label: string;
  statusBadge: "GREEN" | "DRAFT";
  currentState: string;
  nextState: string;
  decision: string;
  reasons: string[];
  signals: {
    recentPassCount: number;
    recentDegradedCount: number;
    recentFailCount: number;
    consecutivePassCount: number;
    consecutiveFailCount: number;
    latestRegressionStatus?: string;
    latestBaselinePassed: boolean;
    latestQualityGatesPassed: boolean;
    greenCriteriaEligible: boolean;
  };
  regressionConfig: {
    templateKey: string;
    qualityGates: boolean;
    baselineCompare: boolean;
    templateSmoke: boolean;
    runtimeVerification: boolean;
  } | null;
};

type ProviderRouteEntry = {
  taskKind: string;
  primary: string;
  fallback: string | null;
  expectedFormat: string;
};

type EvolutionProposalEntry = {
  templateId: string;
  domain: string;
  description: string;
  confidence: number;
  reasons: string[];
  relatedTemplates: string[];
};

type AutopilotSelectionEntry = {
  proposal: EvolutionProposalEntry;
  outcome: string;
  reason: string;
};

type CostModelEntry = {
  model: string;
  inputPer1M: number;
  outputPer1M: number;
};

type RegressionConfigEntry = {
  templateKey: string;
  label: string;
  config: {
    templateKey: string;
    qualityGates: boolean;
    baselineCompare: boolean;
    templateSmoke: boolean;
    runtimeVerification: boolean;
  };
};

type ApprovalProposalEntry = {
  id: string;
  subsystem: string;
  title: string;
  confidence: number;
  recommendation?: string;
  suggestedAction: {
    type: string;
    key: string;
    current: number | string | null;
    proposed: number | string | null;
  };
  source: string;
  reasons: string[];
};

type ApprovalReportData = {
  pending: ApprovalProposalEntry[];
  approved: ApprovalProposalEntry[];
  rejected: ApprovalProposalEntry[];
  deferred: ApprovalProposalEntry[];
  summary: {
    totalProposals: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    deferredCount: number;
  };
};

type AdoptionPlanEntry = {
  planId: string;
  proposalId: string;
  subsystem: string;
  targetFile: string;
  changeType: string;
  currentValue: number | string | null;
  proposedValue: number | string | null;
  dryRunDiff: {
    key: string;
    before: number | string | null;
    after: number | string | null;
  };
  status: string;
  skipReason?: string;
};

type AdoptionReportData = {
  plans: AdoptionPlanEntry[];
  summary: {
    totalPlans: number;
    readyCount: number;
    appliedCount: number;
    skippedCount: number;
    failedCount: number;
    rolledBackCount: number;
  };
};

type PromotionPlanEntry = {
  promotionId: string;
  proposalId: string;
  fromEnv: string;
  toEnv: string;
  targetFile: string;
  key: string;
  currentValue: number | string | null;
  promotedValue: number | string | null;
  status: string;
  skipReason?: string;
};

type PromotionHistoryEntryData = {
  promotionId: string;
  fromEnv: string;
  toEnv: string;
  appliedAt: string;
  appliedBy: string;
  status: string;
  before: number | string | null;
  after: number | string | null;
};

type PromotionReportData = {
  plans: PromotionPlanEntry[];
  history: PromotionHistoryEntryData[];
  summary: {
    totalPlans: number;
    readyCount: number;
    promotedCount: number;
    skippedCount: number;
    failedCount: number;
    rolledBackCount: number;
  };
};

type RollbackCandidateEntry = {
  rollbackId: string;
  sourceType: string;
  sourceId: string;
  targetFile: string;
  key: string;
  currentValue: number | string | null;
  restoreValue: number | string | null;
  status: string;
  skipReason?: string;
};

type AuditEntryData = {
  id: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  environment: string;
  targetFile: string;
  key: string;
  before: number | string | null;
  after: number | string | null;
  executedAt: string;
  executedBy: string;
  status: string;
};

type RollbackReportData = {
  candidates: RollbackCandidateEntry[];
  summary: {
    totalCandidates: number;
    readyCount: number;
    rolledBackCount: number;
    skippedCount: number;
    failedCount: number;
  };
};

type AuditReportData = {
  entries: AuditEntryData[];
  summary: {
    totalEntries: number;
    adoptionCount: number;
    promotionCount: number;
    rollbackCount: number;
  };
};

type MarketplaceItemData = {
  templateId: string;
  title: string;
  domain: string;
  status: string;
  healthState: string;
  maturity: string;
  description: string;
  capabilities: string[];
  sourceSignals: {
    governanceState: string;
    regressionStatus: string;
    greenEligible: boolean;
  };
  derivationHints: string[];
  publishedAt: string | null;
};

type MarketplaceReportData = {
  items: MarketplaceItemData[];
  adoptionIntents: Array<{
    intentId: string;
    templateId: string;
    requestedAt: string;
    requestedBy: string;
  }>;
  derivationIntents: Array<{
    intentId: string;
    parentTemplateId: string;
    requestedTemplateId: string;
    requestedAt: string;
    requestedBy: string;
  }>;
  summary: {
    totalItems: number;
    publishedCount: number;
    experimentalCount: number;
    unpublishedCount: number;
    adoptionIntentCount: number;
    derivationIntentCount: number;
  };
};

type PermissionMatrixEntryData = {
  action: string;
  owner: boolean;
  admin: boolean;
  reviewer: boolean;
  operator: boolean;
  viewer: boolean;
};

type RolePermissionsData = {
  matrix: PermissionMatrixEntryData[];
  roles: string[];
  actions: string[];
  summary: {
    totalActions: number;
    rolesCount: number;
  };
};

type DerivationPlanData = {
  derivationId: string;
  intentId: string;
  parentTemplateId: string;
  requestedTemplateId: string;
  status: string;
  eligibility: {
    allowed: boolean;
    reason: string;
  };
  derivedCandidate: {
    templateId: string;
    parentTemplateId: string;
    domain: string;
    variantType: string;
    blueprintHints: string[];
    schemaHints: string[];
    apiHints: string[];
  } | null;
  skipReason?: string;
};

type DerivationCandidateData = {
  templateId: string;
  parentTemplateId: string;
  domain: string;
  variantType: string;
  blueprintHints: string[];
  schemaHints: string[];
  apiHints: string[];
};

type DerivationPipelineData = {
  plans: DerivationPlanData[];
  candidates: DerivationCandidateData[];
  summary: {
    totalIntents: number;
    plannedCount: number;
    skippedCount: number;
    preparedCount: number;
    handedOffCount: number;
  };
};

type TemplateAnalyticsData = {
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
  trend: string;
  reasons: string[];
};

type TemplateRankingReportData = {
  rankings: TemplateAnalyticsData[];
  topRanked: TemplateAnalyticsData[];
  bestDerivationParents: TemplateAnalyticsData[];
  underusedHealthy: TemplateAnalyticsData[];
  summary: {
    totalTemplates: number;
    risingCount: number;
    stableCount: number;
    decliningCount: number;
    averageOverallScore: number;
    averageHealthScore: number;
  };
};

type ReleasedTemplateEntryData = {
  templateId: string;
  stage: string;
  sourceType: string;
  parentTemplateId: string | null;
  releasedAt: string;
  releasedBy: string;
  releaseNotes: string;
  signals: {
    healthState: string;
    regressionStatus: string;
    marketplaceStatus: string;
    overallRankScore: number | null;
  };
};

type ReleasePromotionPlanData = {
  releasePromotionId: string;
  templateId: string;
  fromStage: string;
  toStage: string;
  status: string;
  eligibility: {
    allowed: boolean;
    reason: string;
  };
};

type ReleaseHistoryEntryData = {
  releasePromotionId: string;
  templateId: string;
  fromStage: string;
  toStage: string;
  status: string;
  executedAt: string;
  executedBy: string;
};

type TemplateReleaseReportData = {
  catalog: ReleasedTemplateEntryData[];
  candidates: Array<{ templateId: string; sourceType: string; parentTemplateId: string | null; domain: string }>;
  plans: ReleasePromotionPlanData[];
  history: ReleaseHistoryEntryData[];
  summary: {
    candidateCount: number;
    devCount: number;
    stagingCount: number;
    prodCount: number;
    totalHistory: number;
  };
};

type OrchestrationJobData = {
  jobId: string;
  label: string;
  description: string;
  dependsOn: string[];
  requiredAction: string;
  estimatedDuration: string;
};

type OrchestrationJobResultData = {
  jobId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  skipReason: string | null;
};

type OrchestrationHistoryData = {
  runId: string;
  mode: string;
  status: string;
  jobResults: OrchestrationJobResultData[];
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  skippedJobs: number;
  executedBy: string;
  startedAt: string;
  completedAt: string;
};

type OrchestrationReportData = {
  registry: OrchestrationJobData[];
  recentRuns: OrchestrationHistoryData[];
  summary: {
    totalJobs: number;
    totalRuns: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
  };
};

type DomainStrategyData = {
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
  strategy: string;
  reasons: string[];
};

type PortfolioGapData = {
  domain: string;
  adjacentDomains: string[];
  adjacentTemplateCount: number;
  evolutionProposalCount: number;
  averageProposalConfidence: number;
  fillPriority: number;
  reasons: string[];
};

type PortfolioStrategyReportData = {
  domainStrategies: DomainStrategyData[];
  expansionPriorities: DomainStrategyData[];
  stabilizationPriorities: DomainStrategyData[];
  maintainDomains: DomainStrategyData[];
  gaps: PortfolioGapData[];
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
};

type ScenarioStepData = {
  stepType: string;
  description: string;
  parentTemplateId: string | null;
  targetTemplateId: string | null;
  targetStage: string | null;
};

type FactoryScenarioData = {
  scenarioId: string;
  type: string;
  domain: string;
  targetTemplateCount: number;
  currentTemplateCount: number;
  gap: number;
  priorityScore: number;
  steps: ScenarioStepData[];
  estimatedImpact: {
    coverageIncrease: number;
    portfolioStrength: number;
  };
  reasons: string[];
};

type ScenarioReportData = {
  expansionScenarios: FactoryScenarioData[];
  gapFillScenarios: FactoryScenarioData[];
  stabilizationScenarios: FactoryScenarioData[];
  summary: {
    totalScenarios: number;
    expansionCount: number;
    gapFillCount: number;
    stabilizationCount: number;
    totalNewTemplates: number;
    averagePriority: number;
  };
};

type RecommendationRecordData = {
  recommendationType: string;
  useCase: string | null;
  domain: string | null;
  templateId: string;
  label: string;
  score: number;
  confidence: number;
  reasons: string[];
  alternatives: string[];
};

type RecommendationReportData = {
  byUseCase: Record<string, RecommendationRecordData[]>;
  bestDerivationParents: RecommendationRecordData[];
  safestProductionTemplates: RecommendationRecordData[];
  underusedHighQuality: RecommendationRecordData[];
  risingTemplates: RecommendationRecordData[];
  summary: {
    totalRecommendations: number;
    useCasesCovered: number;
    domainsCovered: number;
    bestDerivationParentCount: number;
    underusedCount: number;
    risingCount: number;
  };
};

type RuntimeJobResultData = {
  jobId: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  summary: {
    description: string;
    metrics: Record<string, number | string>;
  } | null;
  artifacts: Array<{ type: string; label: string; key: string }>;
  error: string | null;
  skipReason: string | null;
};

type RuntimeExecutionRunData = {
  runId: string;
  mode: string;
  status: string;
  jobs: RuntimeJobResultData[];
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  skippedJobs: number;
  executedBy: string;
  group: string | null;
  startedAt: string;
  completedAt: string;
};

type RuntimeExecutionReportData = {
  recentRuns: RuntimeExecutionRunData[];
  summary: {
    totalRuns: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunGroup: string | null;
  };
};

type KpiRecordData = {
  kpiKey: string;
  category: string;
  label: string;
  value: number;
  unit: string;
  status: "strong" | "healthy" | "warning" | "weak";
  reasons: string[];
};

type KpiCategorySummaryData = {
  category: string;
  label: string;
  kpis: KpiRecordData[];
  strongCount: number;
  healthyCount: number;
  warningCount: number;
  weakCount: number;
  overallStatus: "strong" | "healthy" | "warning" | "weak";
};

type DomainKpiRollupData = {
  domain: string;
  strategy: string;
  kpis: KpiRecordData[];
  overallStatus: "strong" | "healthy" | "warning" | "weak";
};

type StrategicKpiReportData = {
  categories: KpiCategorySummaryData[];
  domainRollups: DomainKpiRollupData[];
  summary: {
    totalKpis: number;
    strongCount: number;
    healthyCount: number;
    warningCount: number;
    weakCount: number;
    overallStatus: "strong" | "healthy" | "warning" | "weak";
    overallScore: number;
  };
};

type ScenarioExecutionResultData = {
  executionId: string;
  scenarioId: string;
  scenarioType: string;
  domain: string;
  status: "ready" | "blocked" | "completed" | "partial" | "failed";
  mode: "dry_run" | "execute";
  blockedReasons: string[];
  actor: { actorId: string; role: string };
  summary: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    skippedJobs: number;
  };
  startedAt: string;
  completedAt: string;
};

type ScenarioExecutionReportData = {
  recentExecutions: ScenarioExecutionResultData[];
  summary: {
    totalExecutions: number;
    completedCount: number;
    partialCount: number;
    failedCount: number;
    blockedCount: number;
  };
};

type ReviewItemData = {
  reviewId: string;
  reviewType: string;
  title: string;
  domain: string;
  priority: number;
  readiness: "ready" | "caution" | "blocked";
  risk: "low" | "medium" | "high";
  recommendedDecision: string;
  status: string;
  reasons: string[];
};

type ReviewBoardReportData = {
  items: ReviewItemData[];
  readyItems: ReviewItemData[];
  cautionItems: ReviewItemData[];
  blockedItems: ReviewItemData[];
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
};

type GovernanceEvaluationData = {
  governanceId: string;
  scenarioId: string;
  executionReadiness: "allowed" | "caution" | "blocked";
  approvalRequirement: "none" | "standard" | "elevated";
  riskLevel: "low" | "medium" | "high";
  status: string;
  reasons: string[];
  linkedReviewId: string | null;
};

type GovernanceDecisionData = {
  decisionId: string;
  governanceId: string;
  scenarioId: string;
  action: string;
  actor: { actorId: string; role: string };
  reasons: string[];
  timestamp: string;
};

type GovernanceReportData = {
  evaluations: GovernanceEvaluationData[];
  decisions: GovernanceDecisionData[];
  allowedItems: GovernanceEvaluationData[];
  cautionItems: GovernanceEvaluationData[];
  blockedItems: GovernanceEvaluationData[];
  summary: {
    totalEvaluations: number;
    allowedCount: number;
    cautionCount: number;
    blockedCount: number;
    approvedCount: number;
    deferredCount: number;
    rejectedCount: number;
    pendingCount: number;
  };
  generatedAt: string;
};

type AutomationEventData = {
  eventId: string;
  eventType: string;
  source: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

type AutomationTriggerData = {
  triggerId: string;
  triggerType: string;
  requestedAt: string;
  requestedBy: { actorId: string; role: string };
  parameters: Record<string, unknown>;
  status: "accepted" | "rejected" | "blocked" | "completed";
  reasons: string[];
  emittedEventIds: string[];
};

type AutomationHooksReportData = {
  recentEvents: AutomationEventData[];
  recentTriggers: AutomationTriggerData[];
  summary: {
    totalEvents: number;
    totalTriggers: number;
    acceptedTriggers: number;
    rejectedTriggers: number;
    blockedTriggers: number;
    completedTriggers: number;
    eventTypeCounts: Record<string, number>;
  };
  generatedAt: string;
};

type ReviewWorkflowEntryData = {
  workflowId: string;
  reviewId: string;
  currentState: string;
  domain: string;
  priority: number;
  risk: string;
  lastActor: string | null;
  lastRole: string | null;
  lastUpdated: string;
  noteCount: number;
};

type ReviewWorkflowReportData = {
  workflows: ReviewWorkflowEntryData[];
  pendingItems: ReviewWorkflowEntryData[];
  inReviewItems: ReviewWorkflowEntryData[];
  approvedCandidateItems: ReviewWorkflowEntryData[];
  approvedForExecutionItems: ReviewWorkflowEntryData[];
  deferredItems: ReviewWorkflowEntryData[];
  rejectedItems: ReviewWorkflowEntryData[];
  archivedItems: ReviewWorkflowEntryData[];
  summary: {
    totalWorkflows: number;
    pendingCount: number;
    inReviewCount: number;
    approvedCandidateCount: number;
    approvedForExecutionCount: number;
    deferredCount: number;
    rejectedCount: number;
    archivedCount: number;
  };
  generatedAt: string;
};

type NotificationDecisionData = {
  notificationId: string;
  eventId: string;
  eventType: string;
  severity: "info" | "warning" | "high" | "critical";
  audience: string[];
  decision: "notify" | "suppress" | "queue";
  channelHint: string;
  reasons: string[];
  evaluatedAt: string;
};

type NotificationPolicyReportData = {
  decisions: NotificationDecisionData[];
  notifyItems: NotificationDecisionData[];
  queuedItems: NotificationDecisionData[];
  suppressedItems: NotificationDecisionData[];
  summary: {
    totalDecisions: number;
    notifyCount: number;
    queuedCount: number;
    suppressedCount: number;
    bySeverity: Record<string, number>;
  };
  generatedAt: string;
};

type NotificationEscalationData = {
  escalationId: string;
  baseNotificationId: string;
  eventType: string;
  escalationLevel: 0 | 1 | 2;
  baseSeverity: "info" | "warning" | "high" | "critical";
  severity: "info" | "warning" | "high" | "critical";
  audience: string[];
  decision: "notify" | "suppress" | "renotify";
  channelHint: string;
  reasons: string[];
  evaluatedAt: string;
};

type EscalationReportData = {
  escalations: NotificationEscalationData[];
  criticalAlerts: NotificationEscalationData[];
  overdueReviewAlerts: NotificationEscalationData[];
  repeatedFailureAlerts: NotificationEscalationData[];
  summary: {
    totalEscalations: number;
    level0Count: number;
    level1Count: number;
    level2Count: number;
    notifyCount: number;
    suppressCount: number;
    renotifyCount: number;
    bySeverity: Record<string, number>;
  };
  generatedAt: string;
};

type WorkflowV3EntryData = {
  workflowId: string;
  reviewId: string;
  currentState: string;
  assignee: { actorId: string; role: string } | null;
  dueAt: string | null;
  slaStatus: "on_track" | "due_soon" | "overdue";
  escalationStatus: "none" | "notify_admin" | "notify_owner" | "escalated";
  rereviewRequired: boolean;
  domain: string;
  priority: number;
  risk: string;
  lastUpdated: string;
};

type WorkflowV3ReportData = {
  entries: WorkflowV3EntryData[];
  assignedItems: WorkflowV3EntryData[];
  dueSoonItems: WorkflowV3EntryData[];
  overdueItems: WorkflowV3EntryData[];
  escalatedItems: WorkflowV3EntryData[];
  rereviewItems: WorkflowV3EntryData[];
  summary: {
    totalWorkflows: number;
    assignedCount: number;
    unassignedCount: number;
    onTrackCount: number;
    dueSoonCount: number;
    overdueCount: number;
    escalatedCount: number;
    rereviewCount: number;
  };
  generatedAt: string;
};

type AutoPromotionResultData = {
  autoPromotionId: string;
  reviewId: string;
  scenarioId: string;
  eligible: boolean;
  fromState: string;
  toState: string;
  decision: "auto_promote" | "no_action";
  reasons: string[];
  applied: boolean;
  evaluatedAt: string;
};

type AutoPromotionReportData = {
  evaluations: AutoPromotionResultData[];
  eligibleItems: AutoPromotionResultData[];
  promotedItems: AutoPromotionResultData[];
  notEligibleItems: AutoPromotionResultData[];
  summary: {
    totalEvaluated: number;
    eligibleCount: number;
    promotedCount: number;
    notEligibleCount: number;
  };
  generatedAt: string;
};

type DiscoveryOverviewData = {
  totalDiscoveredIdeas: number;
  recentlyMatched: number;
  gapsDetected: number;
  topDomains: string[];
  lastRunAt: string | null;
};

type DashboardData = {
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
  governanceSummary: {
    candidateCount: number;
    greenCount: number;
    atRiskCount: number;
    degradedCount: number;
    demotedCount: number;
    promoteToGreenCount: number;
    demoteCount: number;
    eligibleForRepromotionCount: number;
  };
  providerRoutes: ProviderRouteEntry[];
  regressionConfigs: RegressionConfigEntry[];
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
    config: {
      confidenceThreshold: number;
      maxConcurrent: number;
      intelligenceMode: string;
      skipDegradedDomains: boolean;
      dryRun: boolean;
    };
  };
  costOverview: {
    models: CostModelEntry[];
    defaultStepEstimates: Record<string, Record<string, number>>;
  };
  approvalReport: ApprovalReportData;
  adoptionReport: AdoptionReportData;
  promotionReport: PromotionReportData;
  rollbackReport: RollbackReportData;
  auditReport: AuditReportData;
  marketplaceReport: MarketplaceReportData;
  rolePermissions: RolePermissionsData;
  derivationPipeline: DerivationPipelineData;
  orchestrationReport: OrchestrationReportData;
  templateRanking: TemplateRankingReportData;
  templateRelease: TemplateReleaseReportData;
  runtimeReport: RuntimeExecutionReportData;
  recommendationReport: RecommendationReportData;
  portfolioStrategy: PortfolioStrategyReportData;
  scenarioPlanner: ScenarioReportData;
  strategicKpis: StrategicKpiReportData;
  scenarioExecution: ScenarioExecutionReportData;
  reviewBoard: ReviewBoardReportData;
  scenarioGovernance: GovernanceReportData;
  automationHooks: AutomationHooksReportData;
  reviewWorkflow: ReviewWorkflowReportData;
  notificationPolicy: NotificationPolicyReportData;
  scenarioAutoPromotion: AutoPromotionReportData;
  reviewOperations: WorkflowV3ReportData;
  notificationEscalation: EscalationReportData;
  discoveryOverview: DiscoveryOverviewData;
  generatedAt: string;
  scenarioAutoExecutionGuardrails: any;
};

// ── Utility ──────────────────────────────────────────────────

function healthStateColor(state: string): string {
  switch (state) {
    case "green": return "text-green-700 bg-green-100";
    case "at_risk": return "text-amber-700 bg-amber-100";
    case "degraded": return "text-orange-700 bg-orange-100";
    case "demoted": return "text-red-700 bg-red-100";
    case "candidate": return "text-blue-700 bg-blue-100";
    default: return "text-gray-700 bg-gray-100";
  }
}

function decisionLabel(decision: string): string {
  const map: Record<string, string> = {
    promote_to_green: "GREEN昇格",
    remain_green: "GREEN維持",
    hold_candidate: "候補保留",
    mark_at_risk: "リスク検出",
    mark_degraded: "劣化検出",
    demote: "降格",
    eligible_for_repromotion: "再昇格可能",
    blocked_from_promotion: "昇格ブロック",
  };
  return map[decision] ?? decision;
}

function confidenceBar(confidence: number): string {
  if (confidence >= 0.8) return "bg-green-500";
  if (confidence >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

// ── Components ──────────────────────────────────────────────

function FactoryOverviewCard({ overview }: { overview: DashboardData["overview"] }) {
  const metrics = [
    { label: "テンプレート総数", value: overview.totalTemplates, color: "text-gray-900" },
    { label: "GREEN", value: overview.greenTemplates, color: "text-green-700" },
    { label: "At Risk", value: overview.atRiskTemplates, color: "text-amber-700" },
    { label: "Degraded", value: overview.degradedTemplates, color: "text-orange-700" },
    { label: "Demoted", value: overview.demotedTemplates, color: "text-red-700" },
    { label: "Candidate", value: overview.candidateTemplates, color: "text-blue-700" },
  ];

  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Factory Overview</h2>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="border rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-500">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{overview.providerRouteCount}</p>
          <p className="text-xs text-gray-500">プロバイダルート</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-700">{overview.evolutionProposalCount}</p>
          <p className="text-xs text-gray-500">進化提案</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-teal-700">{overview.coveredDomainCount}</p>
          <p className="text-xs text-gray-500">カバー済みドメイン</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{overview.uncoveredDomainCount}</p>
          <p className="text-xs text-gray-500">未カバードメイン</p>
        </div>
      </div>
    </section>
  );
}

function TemplateHealthTable({ templates }: { templates: TemplateHealthEntry[] }) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Template Health</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">テンプレート</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Health</th>
              <th className="py-2 pr-3">判定</th>
              <th className="py-2 pr-3">直近Pass</th>
              <th className="py-2 pr-3">直近Fail</th>
              <th className="py-2 pr-3">Baseline</th>
              <th className="py-2 pr-3">Quality</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.templateKey} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-gray-400">{t.templateKey}</div>
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                    t.statusBadge === "GREEN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  }`}>
                    {t.statusBadge}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${healthStateColor(t.nextState)}`}>
                    {t.nextState}
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs">{decisionLabel(t.decision)}</td>
                <td className="py-2 pr-3 text-center">{t.signals.recentPassCount}</td>
                <td className="py-2 pr-3 text-center">{t.signals.recentFailCount}</td>
                <td className="py-2 pr-3 text-center">
                  <span className={t.signals.latestBaselinePassed ? "text-green-600" : "text-red-600"}>
                    {t.signals.latestBaselinePassed ? "Pass" : "Fail"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={t.signals.latestQualityGatesPassed ? "text-green-600" : "text-red-600"}>
                    {t.signals.latestQualityGatesPassed ? "Pass" : "Fail"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {templates.some((t) => t.reasons.length > 0) && (
        <div className="space-y-2 pt-2">
          <p className="text-xs text-gray-500 font-medium">判定理由:</p>
          {templates.filter((t) => t.reasons.length > 0).map((t) => (
            <div key={t.templateKey} className="text-xs text-gray-600">
              <span className="font-medium">{t.templateKey}:</span>{" "}
              {t.reasons.join("; ")}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderPerformanceTable({ routes }: { routes: ProviderRouteEntry[] }) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Provider Performance</h2>
      <p className="text-xs text-gray-500">静的ルーティングテーブル — タスク種別ごとのプロバイダ割当</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">Task Kind</th>
              <th className="py-2 pr-3">Primary</th>
              <th className="py-2 pr-3">Fallback</th>
              <th className="py-2 pr-3">Expected Format</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.taskKind} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3 font-medium">{r.taskKind}</td>
                <td className="py-2 pr-3">
                  <span className="inline-block bg-blue-100 text-blue-700 rounded px-2 py-0.5 text-xs font-medium">
                    {r.primary}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {r.fallback ? (
                    <span className="inline-block bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-xs font-medium">
                      {r.fallback}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-gray-500">{r.expectedFormat}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RegressionHistoryTable({ configs }: { configs: RegressionConfigEntry[] }) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Regression Results</h2>
      <p className="text-xs text-gray-500">テンプレートごとのリグレッション構成とゲート設定</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">テンプレート</th>
              <th className="py-2 pr-3 text-center">Quality Gates</th>
              <th className="py-2 pr-3 text-center">Baseline Compare</th>
              <th className="py-2 pr-3 text-center">Template Smoke</th>
              <th className="py-2 pr-3 text-center">Runtime Verification</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((r) => (
              <tr key={r.templateKey} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3">
                  <div className="font-medium">{r.label}</div>
                  <div className="text-xs text-gray-400">{r.templateKey}</div>
                </td>
                <td className="py-2 pr-3 text-center">
                  <GateIndicator enabled={r.config.qualityGates} />
                </td>
                <td className="py-2 pr-3 text-center">
                  <GateIndicator enabled={r.config.baselineCompare} />
                </td>
                <td className="py-2 pr-3 text-center">
                  <GateIndicator enabled={r.config.templateSmoke} />
                </td>
                <td className="py-2 pr-3 text-center">
                  <GateIndicator enabled={r.config.runtimeVerification} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GateIndicator({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
      enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
    }`}>
      {enabled ? "ON" : "OFF"}
    </span>
  );
}

function AutopilotRunsTable({
  selection,
}: {
  selection: DashboardData["autopilotSelection"];
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Autopilot Activity</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{selection.selected.length}</p>
          <p className="text-xs text-gray-500">選択済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{selection.rejected.length}</p>
          <p className="text-xs text-gray-500">却下</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{(selection.config.confidenceThreshold * 100).toFixed(0)}%</p>
          <p className="text-xs text-gray-500">信頼度閾値</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-700">{selection.config.maxConcurrent}</p>
          <p className="text-xs text-gray-500">最大同時実行</p>
        </div>
      </div>

      {selection.selected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">選択された提案:</p>
          {selection.selected.map((p) => (
            <div key={p.templateId} className="border rounded-lg p-3 bg-green-50">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{p.templateId}</span>
                <span className="inline-block bg-green-100 text-green-700 rounded px-2 py-0.5 text-xs font-medium">
                  {(p.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{p.description}</p>
            </div>
          ))}
        </div>
      )}

      {selection.rejected.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">却下された提案:</p>
          {selection.rejected.map((r) => (
            <div key={r.proposal.templateId} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{r.proposal.templateId}</span>
                <span className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-xs font-medium">
                  {r.outcome}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EvolutionProposalTable({
  report,
}: {
  report: DashboardData["evolutionReport"];
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Evolution Proposals</h2>
      <div className="flex gap-4 text-xs text-gray-500">
        <span>分析テンプレート数: {report.analyzedTemplateCount}</span>
        <span>カバー済み: {report.coveredDomains.join(", ")}</span>
      </div>

      {report.uncoveredDomains.length > 0 && (
        <div className="border border-amber-200 rounded-lg p-3 bg-amber-50">
          <p className="text-xs font-medium text-amber-700">未カバードメイン:</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {report.uncoveredDomains.map((d) => (
              <span key={d} className="inline-block bg-amber-100 text-amber-700 rounded px-2 py-0.5 text-xs">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {report.proposals.length === 0 ? (
        <p className="text-sm text-gray-500">進化提案はありません。</p>
      ) : (
        <div className="space-y-3">
          {report.proposals.map((p) => (
            <div key={p.templateId} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{p.templateId}</span>
                  <span className="ml-2 inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                    {p.domain}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${confidenceBar(p.confidence)}`}
                      style={{ width: `${p.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-600">
                    {(p.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-600">{p.description}</p>
              <div className="flex flex-wrap gap-1">
                {p.relatedTemplates.map((rt) => (
                  <span key={rt} className="inline-block bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-xs">
                    {rt}
                  </span>
                ))}
              </div>
              {p.reasons.length > 0 && (
                <ul className="text-xs text-gray-500 list-disc list-inside">
                  {p.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved": return "bg-green-100 text-green-700";
    case "rejected": return "bg-red-100 text-red-700";
    case "deferred": return "bg-amber-100 text-amber-700";
    default: return "bg-blue-100 text-blue-700";
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: "承認済み",
    rejected: "却下",
    deferred: "保留",
    pending: "未レビュー",
  };
  return map[status] ?? status;
}

function FactoryProposalsSection({
  report,
  onDecision,
}: {
  report: ApprovalReportData;
  onDecision: (proposalId: string, decision: string) => void;
}) {
  const allProposals: Array<{ proposal: ApprovalProposalEntry; status: string }> = [
    ...report.pending.map((p) => ({ proposal: p, status: "pending" })),
    ...report.deferred.map((p) => ({ proposal: p, status: "deferred" })),
    ...report.approved.map((p) => ({ proposal: p, status: "approved" })),
    ...report.rejected.map((p) => ({ proposal: p, status: "rejected" })),
  ];

  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Factory Proposals</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalProposals}</p>
          <p className="text-xs text-gray-500">総提案数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.pendingCount}</p>
          <p className="text-xs text-gray-500">未レビュー</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.approvedCount}</p>
          <p className="text-xs text-gray-500">承認済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.rejectedCount}</p>
          <p className="text-xs text-gray-500">却下</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.deferredCount}</p>
          <p className="text-xs text-gray-500">保留</p>
        </div>
      </div>

      {allProposals.length === 0 ? (
        <p className="text-sm text-gray-500">提案はありません。CLIから collect を実行してください。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">提案</th>
                <th className="py-2 pr-3">サブシステム</th>
                <th className="py-2 pr-3">信頼度</th>
                <th className="py-2 pr-3">推奨</th>
                <th className="py-2 pr-3">ステータス</th>
                <th className="py-2 pr-3">アクション</th>
              </tr>
            </thead>
            <tbody>
              {allProposals.map(({ proposal: p, status }) => (
                <tr key={p.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-xs">{p.id}</div>
                    <div className="text-xs text-gray-400">{p.title}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                      {p.subsystem}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${confidenceBar(p.confidence)}`}
                          style={{ width: `${p.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xs">{(p.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {p.recommendation ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}>
                      {statusLabel(status)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {(status === "pending" || status === "deferred") && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => onDecision(p.id, "approved")}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                        >
                          承認
                        </button>
                        <button
                          onClick={() => onDecision(p.id, "rejected")}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                          却下
                        </button>
                        <button
                          onClick={() => onDecision(p.id, "deferred")}
                          className="px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200"
                        >
                          保留
                        </button>
                      </div>
                    )}
                    {status === "approved" && (
                      <span className="text-xs text-gray-400">決定済み</span>
                    )}
                    {status === "rejected" && (
                      <span className="text-xs text-gray-400">決定済み</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function adoptionStatusBadge(status: string): string {
  switch (status) {
    case "ready": return "bg-blue-100 text-blue-700";
    case "applied": return "bg-green-100 text-green-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    case "failed": return "bg-red-100 text-red-700";
    case "rolled_back": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function adoptionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ready: "適用可能",
    applied: "適用済み",
    skipped: "スキップ",
    failed: "失敗",
    rolled_back: "ロールバック済",
  };
  return map[status] ?? status;
}

function ApprovedChangesSection({
  report,
}: {
  report: AdoptionReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Approved Changes</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalPlans}</p>
          <p className="text-xs text-gray-500">総プラン数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.readyCount}</p>
          <p className="text-xs text-gray-500">適用可能</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.appliedCount}</p>
          <p className="text-xs text-gray-500">適用済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.skippedCount}</p>
          <p className="text-xs text-gray-500">スキップ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.failedCount}</p>
          <p className="text-xs text-gray-500">失敗</p>
        </div>
      </div>

      {report.plans.length === 0 ? (
        <p className="text-sm text-gray-500">適用可能な変更プランはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">提案</th>
                <th className="py-2 pr-3">サブシステム</th>
                <th className="py-2 pr-3">対象</th>
                <th className="py-2 pr-3">現在値</th>
                <th className="py-2 pr-3">提案値</th>
                <th className="py-2 pr-3">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {report.plans.map((plan) => (
                <tr key={plan.planId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-xs">{plan.proposalId}</div>
                    <div className="text-xs text-gray-400">{plan.planId}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                      {plan.subsystem}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-600">
                    {plan.dryRunDiff.key}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(plan.dryRunDiff.before ?? "—")}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(plan.dryRunDiff.after ?? "—")}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${adoptionStatusBadge(plan.status)}`}>
                      {adoptionStatusLabel(plan.status)}
                    </span>
                    {plan.skipReason && (
                      <div className="text-xs text-gray-400 mt-0.5">{plan.skipReason}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function promotionStatusBadge(status: string): string {
  switch (status) {
    case "ready": return "bg-blue-100 text-blue-700";
    case "promoted": return "bg-green-100 text-green-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    case "failed": return "bg-red-100 text-red-700";
    case "rolled_back": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function promotionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ready: "昇格可能",
    promoted: "昇格済み",
    skipped: "スキップ",
    failed: "失敗",
    rolled_back: "ロールバック済",
  };
  return map[status] ?? status;
}

function PolicyPromotionSection({
  report,
}: {
  report: PromotionReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Policy Promotion</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.readyCount}</p>
          <p className="text-xs text-gray-500">昇格可能</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.promotedCount}</p>
          <p className="text-xs text-gray-500">昇格済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.skippedCount}</p>
          <p className="text-xs text-gray-500">スキップ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.history.length}</p>
          <p className="text-xs text-gray-500">履歴件数</p>
        </div>
      </div>

      {report.plans.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">提案</th>
                <th className="py-2 pr-3">From</th>
                <th className="py-2 pr-3">To</th>
                <th className="py-2 pr-3">対象キー</th>
                <th className="py-2 pr-3">現在値</th>
                <th className="py-2 pr-3">昇格値</th>
                <th className="py-2 pr-3">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {report.plans.map((plan) => (
                <tr key={plan.promotionId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 text-xs font-medium">{plan.proposalId}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-blue-100 text-blue-700 rounded px-2 py-0.5 text-xs font-medium">
                      {plan.fromEnv}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                      {plan.toEnv}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-600">{plan.key}</td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(plan.currentValue ?? "(unset)")}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(plan.promotedValue ?? "—")}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${promotionStatusBadge(plan.status)}`}>
                      {promotionStatusLabel(plan.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.history.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">直近の昇格履歴:</p>
          {report.history.slice(-5).map((h) => (
            <div key={h.promotionId} className="text-xs text-gray-600 border rounded p-2 bg-gray-50">
              <span className="font-medium">{h.promotionId}</span>
              <span className="ml-2 text-gray-400">
                {h.fromEnv} → {h.toEnv} | {String(h.before ?? "(unset)")} → {String(h.after)}
              </span>
            </div>
          ))}
        </div>
      )}

      {report.plans.length === 0 && report.history.length === 0 && (
        <p className="text-sm text-gray-500">
          プロモーション対象はありません。CLIで preview を実行してください。
        </p>
      )}
    </section>
  );
}

function rollbackStatusBadge(status: string): string {
  switch (status) {
    case "ready": return "bg-blue-100 text-blue-700";
    case "rolled_back": return "bg-green-100 text-green-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function rollbackStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ready: "ロールバック可能",
    rolled_back: "ロールバック済",
    skipped: "スキップ",
    failed: "失敗",
  };
  return map[status] ?? status;
}

function RollbackCandidatesSection({
  report,
}: {
  report: RollbackReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Rollback Candidates</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalCandidates}</p>
          <p className="text-xs text-gray-500">総候補数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.readyCount}</p>
          <p className="text-xs text-gray-500">ロールバック可能</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.rolledBackCount}</p>
          <p className="text-xs text-gray-500">ロールバック済</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.skippedCount}</p>
          <p className="text-xs text-gray-500">スキップ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.failedCount}</p>
          <p className="text-xs text-gray-500">失敗</p>
        </div>
      </div>

      {report.candidates.length === 0 ? (
        <p className="text-sm text-gray-500">ロールバック対象はありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">Rollback ID</th>
                <th className="py-2 pr-3">ソース</th>
                <th className="py-2 pr-3">対象キー</th>
                <th className="py-2 pr-3">現在値</th>
                <th className="py-2 pr-3">復元値</th>
                <th className="py-2 pr-3">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {report.candidates.map((c) => (
                <tr key={c.rollbackId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 text-xs font-medium">{c.rollbackId}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                      {c.sourceType}
                    </span>
                    <div className="text-xs text-gray-400">{c.sourceId}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-600">{c.key}</td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(c.currentValue ?? "(unset)")}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(c.restoreValue ?? "(unset)")}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${rollbackStatusBadge(c.status)}`}>
                      {rollbackStatusLabel(c.status)}
                    </span>
                    {c.skipReason && (
                      <div className="text-xs text-gray-400 mt-0.5">{c.skipReason}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function auditEventBadge(eventType: string): string {
  switch (eventType) {
    case "adoption": return "bg-blue-100 text-blue-700";
    case "promotion": return "bg-purple-100 text-purple-700";
    case "rollback": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function auditEventLabel(eventType: string): string {
  const map: Record<string, string> = {
    adoption: "適用",
    promotion: "昇格",
    rollback: "ロールバック",
  };
  return map[eventType] ?? eventType;
}

function FactoryAuditSection({
  report,
}: {
  report: AuditReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Factory Audit</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalEntries}</p>
          <p className="text-xs text-gray-500">総エントリ数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.adoptionCount}</p>
          <p className="text-xs text-gray-500">適用</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-700">{report.summary.promotionCount}</p>
          <p className="text-xs text-gray-500">昇格</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.rollbackCount}</p>
          <p className="text-xs text-gray-500">ロールバック</p>
        </div>
      </div>

      {report.entries.length === 0 ? (
        <p className="text-sm text-gray-500">監査エントリはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">イベント</th>
                <th className="py-2 pr-3">ソース</th>
                <th className="py-2 pr-3">環境</th>
                <th className="py-2 pr-3">対象キー</th>
                <th className="py-2 pr-3">Before</th>
                <th className="py-2 pr-3">After</th>
                <th className="py-2 pr-3">実行日時</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.slice(-10).map((e) => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${auditEventBadge(e.eventType)}`}>
                      {auditEventLabel(e.eventType)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="text-xs font-medium">{e.sourceId}</div>
                    <div className="text-xs text-gray-400">{e.sourceType}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-gray-100 text-gray-700 rounded px-2 py-0.5 text-xs font-medium">
                      {e.environment}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-600">{e.key}</td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(e.before ?? "(unset)")}
                  </td>
                  <td className="py-2 pr-3 text-xs font-mono">
                    {String(e.after ?? "(unset)")}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    {e.executedAt ? new Date(e.executedAt).toLocaleString("ja-JP") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function marketplaceStatusBadge(status: string): string {
  switch (status) {
    case "published": return "bg-green-100 text-green-700";
    case "experimental": return "bg-amber-100 text-amber-700";
    case "unpublished": return "bg-gray-100 text-gray-500";
    default: return "bg-gray-100 text-gray-500";
  }
}

function marketplaceStatusLabel(status: string): string {
  const map: Record<string, string> = {
    published: "公開中",
    experimental: "実験的",
    unpublished: "未公開",
  };
  return map[status] ?? status;
}

function maturityLabel(maturity: string): string {
  const map: Record<string, string> = {
    production_ready: "本番対応",
    experimental: "実験的",
    unavailable: "利用不可",
  };
  return map[maturity] ?? maturity;
}

function TemplateMarketplaceSection({
  report,
}: {
  report: MarketplaceReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Template Marketplace</h2>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalItems}</p>
          <p className="text-xs text-gray-500">総テンプレート</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.publishedCount}</p>
          <p className="text-xs text-gray-500">公開中</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.experimentalCount}</p>
          <p className="text-xs text-gray-500">実験的</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.unpublishedCount}</p>
          <p className="text-xs text-gray-500">未公開</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.adoptionIntentCount}</p>
          <p className="text-xs text-gray-500">採用意向</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-700">{report.summary.derivationIntentCount}</p>
          <p className="text-xs text-gray-500">派生意向</p>
        </div>
      </div>

      {report.items.length === 0 ? (
        <p className="text-sm text-gray-500">マーケットプレースアイテムはありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">テンプレート</th>
                <th className="py-2 pr-3">ドメイン</th>
                <th className="py-2 pr-3">ステータス</th>
                <th className="py-2 pr-3">Health</th>
                <th className="py-2 pr-3">成熟度</th>
                <th className="py-2 pr-3">派生ヒント</th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => (
                <tr key={item.templateId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-xs">{item.title}</div>
                    <div className="text-xs text-gray-400">{item.templateId}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                      {item.domain}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${marketplaceStatusBadge(item.status)}`}>
                      {marketplaceStatusLabel(item.status)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${healthStateColor(item.healthState)}`}>
                      {item.healthState}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">{maturityLabel(item.maturity)}</td>
                  <td className="py-2 pr-3">
                    {item.derivationHints.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.derivationHints.map((h) => (
                          <span key={h} className="inline-block bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 text-xs">
                            {h}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.adoptionIntents.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">直近の採用意向:</p>
          {report.adoptionIntents.slice(-5).map((a) => (
            <div key={a.intentId} className="text-xs text-gray-600 border rounded p-2 bg-blue-50">
              <span className="font-medium">{a.templateId}</span>
              <span className="ml-2 text-gray-400">
                {a.requestedBy} | {new Date(a.requestedAt).toLocaleString("ja-JP")}
              </span>
            </div>
          ))}
        </div>
      )}

      {report.derivationIntents.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">直近の派生意向:</p>
          {report.derivationIntents.slice(-5).map((d) => (
            <div key={d.intentId} className="text-xs text-gray-600 border rounded p-2 bg-purple-50">
              <span className="font-medium">{d.parentTemplateId} → {d.requestedTemplateId}</span>
              <span className="ml-2 text-gray-400">
                {d.requestedBy} | {new Date(d.requestedAt).toLocaleString("ja-JP")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function derivationStatusBadge(status: string): string {
  switch (status) {
    case "planned": return "bg-blue-100 text-blue-700";
    case "handed_off": return "bg-green-100 text-green-700";
    case "prepared": return "bg-teal-100 text-teal-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    default: return "bg-gray-100 text-gray-500";
  }
}

function derivationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    planned: "計画済み",
    handed_off: "引渡済み",
    prepared: "準備済み",
    skipped: "スキップ",
  };
  return map[status] ?? status;
}

function DerivationPipelineSection({
  pipeline,
}: {
  pipeline: DerivationPipelineData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Marketplace Derivation Pipeline</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{pipeline.summary.totalIntents}</p>
          <p className="text-xs text-gray-500">総インテント</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{pipeline.summary.plannedCount}</p>
          <p className="text-xs text-gray-500">計画済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{pipeline.summary.skippedCount}</p>
          <p className="text-xs text-gray-500">スキップ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{pipeline.summary.handedOffCount}</p>
          <p className="text-xs text-gray-500">引渡済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-teal-700">{pipeline.candidates.length}</p>
          <p className="text-xs text-gray-500">候補数</p>
        </div>
      </div>

      {pipeline.plans.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">インテント</th>
                <th className="py-2 pr-3">親テンプレート</th>
                <th className="py-2 pr-3">要求テンプレート</th>
                <th className="py-2 pr-3">派生タイプ</th>
                <th className="py-2 pr-3">適格性</th>
                <th className="py-2 pr-3">ステータス</th>
              </tr>
            </thead>
            <tbody>
              {pipeline.plans.map((plan) => (
                <tr key={plan.derivationId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 text-xs font-medium">{plan.derivationId}</td>
                  <td className="py-2 pr-3 text-xs">{plan.parentTemplateId}</td>
                  <td className="py-2 pr-3 text-xs font-medium">{plan.requestedTemplateId}</td>
                  <td className="py-2 pr-3">
                    {plan.derivedCandidate ? (
                      <span className="inline-block bg-purple-100 text-purple-700 rounded px-2 py-0.5 text-xs font-medium">
                        {plan.derivedCandidate.variantType}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={plan.eligibility.allowed ? "text-green-600 text-xs" : "text-red-600 text-xs"}>
                      {plan.eligibility.allowed ? "適格" : "不適格"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${derivationStatusBadge(plan.status)}`}>
                      {derivationStatusLabel(plan.status)}
                    </span>
                    {plan.skipReason && (
                      <div className="text-xs text-gray-400 mt-0.5">{plan.skipReason}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pipeline.candidates.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">派生候補テンプレート:</p>
          {pipeline.candidates.map((c) => (
            <div key={c.templateId} className="text-xs border rounded p-3 bg-teal-50 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.templateId}</span>
                <span className="inline-block bg-purple-100 text-purple-700 rounded px-2 py-0.5 text-xs">
                  {c.variantType}
                </span>
                <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs">
                  {c.domain}
                </span>
              </div>
              <div className="text-gray-500">from: {c.parentTemplateId}</div>
              {c.blueprintHints.length > 0 && (
                <div className="text-gray-500">blueprint: {c.blueprintHints.join(", ")}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {pipeline.plans.length === 0 && pipeline.candidates.length === 0 && (
        <p className="text-sm text-gray-500">
          派生パイプラインの対象はありません。CLIで derive を実行してください。
        </p>
      )}
    </section>
  );
}

function RolePermissionsSection({
  permissions,
}: {
  permissions: RolePermissionsData;
}) {
  const actionGroupLabel = (action: string): string => {
    const prefix = action.split(".")[0] ?? "";
    const map: Record<string, string> = {
      proposal: "提案",
      change: "変更",
      policy: "ポリシー",
      rollback: "ロールバック",
      marketplace: "マーケット",
      orchestration: "オーケストレーション",
      release: "リリース",
      dashboard: "ダッシュボード",
      audit: "監査",
    };
    return map[prefix] ?? prefix;
  };

  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Role Permissions</h2>
      <div className="flex gap-4 text-xs text-gray-500">
        <span>ロール数: {permissions.summary.rolesCount}</span>
        <span>アクション数: {permissions.summary.totalActions}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">アクション</th>
              <th className="py-2 pr-3">グループ</th>
              <th className="py-2 pr-3 text-center">Owner</th>
              <th className="py-2 pr-3 text-center">Admin</th>
              <th className="py-2 pr-3 text-center">Reviewer</th>
              <th className="py-2 pr-3 text-center">Operator</th>
              <th className="py-2 pr-3 text-center">Viewer</th>
            </tr>
          </thead>
          <tbody>
            {permissions.matrix.map((entry) => (
              <tr key={entry.action} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3 text-xs font-mono">{entry.action}</td>
                <td className="py-2 pr-3">
                  <span className="inline-block bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-xs">
                    {actionGroupLabel(entry.action)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={entry.owner ? "text-green-600" : "text-gray-300"}>
                    {entry.owner ? "Yes" : "—"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={entry.admin ? "text-green-600" : "text-gray-300"}>
                    {entry.admin ? "Yes" : "—"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={entry.reviewer ? "text-green-600" : "text-gray-300"}>
                    {entry.reviewer ? "Yes" : "—"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={entry.operator ? "text-green-600" : "text-gray-300"}>
                    {entry.operator ? "Yes" : "—"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={entry.viewer ? "text-green-600" : "text-gray-300"}>
                    {entry.viewer ? "Yes" : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function releaseStageBadge(stage: string): string {
  switch (stage) {
    case "prod": return "bg-green-100 text-green-700";
    case "staging": return "bg-blue-100 text-blue-700";
    case "dev": return "bg-amber-100 text-amber-700";
    case "candidate": return "bg-gray-100 text-gray-500";
    default: return "bg-gray-100 text-gray-500";
  }
}

function releaseStageLabel(stage: string): string {
  const map: Record<string, string> = {
    candidate: "候補",
    dev: "開発",
    staging: "ステージング",
    prod: "本番",
  };
  return map[stage] ?? stage;
}

function releaseStatusBadge(status: string): string {
  switch (status) {
    case "ready": return "bg-blue-100 text-blue-700";
    case "promoted": return "bg-green-100 text-green-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    case "failed": return "bg-red-100 text-red-700";
    case "rolled_back": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function TemplateReleaseSection({
  release,
}: {
  release: TemplateReleaseReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Template Release Management</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{release.summary.candidateCount}</p>
          <p className="text-xs text-gray-500">候補</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{release.summary.devCount}</p>
          <p className="text-xs text-gray-500">開発</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{release.summary.stagingCount}</p>
          <p className="text-xs text-gray-500">ステージング</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{release.summary.prodCount}</p>
          <p className="text-xs text-gray-500">本番</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{release.summary.totalHistory}</p>
          <p className="text-xs text-gray-500">履歴</p>
        </div>
      </div>

      {release.catalog.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">テンプレート</th>
                <th className="py-2 pr-3">ステージ</th>
                <th className="py-2 pr-3">ソース</th>
                <th className="py-2 pr-3">Health</th>
                <th className="py-2 pr-3">Regression</th>
                <th className="py-2 pr-3">ランク</th>
                <th className="py-2 pr-3">リリース日</th>
              </tr>
            </thead>
            <tbody>
              {release.catalog.map((entry) => (
                <tr key={`${entry.templateId}-${entry.stage}`} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 text-xs font-medium">{entry.templateId}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${releaseStageBadge(entry.stage)}`}>
                      {releaseStageLabel(entry.stage)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-500">{entry.sourceType}</td>
                  <td className="py-2 pr-3">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${healthStateColor(entry.signals.healthState)}`}>
                      {entry.signals.healthState}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={entry.signals.regressionStatus === "pass" ? "text-green-600 text-xs" : "text-red-600 text-xs"}>
                      {entry.signals.regressionStatus}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {entry.signals.overallRankScore !== null
                      ? entry.signals.overallRankScore.toFixed(3)
                      : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    {new Date(entry.releasedAt).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {release.plans.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">プロモーション計画:</p>
          {release.plans.slice(0, 10).map((plan) => (
            <div key={plan.releasePromotionId} className="text-xs border rounded p-2 bg-gray-50 flex items-center justify-between">
              <span>
                <span className="font-medium">{plan.templateId}</span>
                <span className="ml-2 text-gray-500">{plan.fromStage} → {plan.toStage}</span>
              </span>
              <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${releaseStatusBadge(plan.status)}`}>
                {plan.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {release.history.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">直近のリリース履歴:</p>
          {release.history.slice(-5).map((h) => (
            <div key={h.releasePromotionId} className="text-xs border rounded p-2 bg-blue-50">
              <span className="font-medium">{h.templateId}</span>
              <span className="ml-2 text-gray-500">
                {h.fromStage} → {h.toStage} | {h.executedBy} |{" "}
                {new Date(h.executedAt).toLocaleString("ja-JP")}
              </span>
            </div>
          ))}
        </div>
      )}

      {release.catalog.length === 0 && release.plans.length === 0 && (
        <p className="text-sm text-gray-500">
          リリースカタログは空です。CLIで preview / apply を実行してください。
        </p>
      )}
    </section>
  );
}

function trendBadgeClass(trend: string): string {
  switch (trend) {
    case "rising": return "bg-green-100 text-green-700";
    case "declining": return "bg-red-100 text-red-700";
    case "stable": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-500";
  }
}

function trendLabel(trend: string): string {
  const map: Record<string, string> = {
    rising: "上昇",
    stable: "安定",
    declining: "低下",
  };
  return map[trend] ?? trend;
}

function scoreBar(score: number): string {
  if (score >= 0.8) return "bg-green-500";
  if (score >= 0.6) return "bg-amber-500";
  if (score >= 0.4) return "bg-orange-500";
  return "bg-red-500";
}

function TemplateRankingSection({
  ranking,
}: {
  ranking: TemplateRankingReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Template Analytics / Ranking</h2>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{ranking.summary.totalTemplates}</p>
          <p className="text-xs text-gray-500">分析対象</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{ranking.summary.risingCount}</p>
          <p className="text-xs text-gray-500">上昇</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-600">{ranking.summary.stableCount}</p>
          <p className="text-xs text-gray-500">安定</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{ranking.summary.decliningCount}</p>
          <p className="text-xs text-gray-500">低下</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{ranking.summary.averageOverallScore.toFixed(3)}</p>
          <p className="text-xs text-gray-500">平均ランク</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-teal-700">{ranking.summary.averageHealthScore.toFixed(2)}</p>
          <p className="text-xs text-gray-500">平均Health</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">#</th>
              <th className="py-2 pr-3">テンプレート</th>
              <th className="py-2 pr-3">ドメイン</th>
              <th className="py-2 pr-3">Health</th>
              <th className="py-2 pr-3">安定性</th>
              <th className="py-2 pr-3 text-center">採用</th>
              <th className="py-2 pr-3 text-center">派生</th>
              <th className="py-2 pr-3">成熟度</th>
              <th className="py-2 pr-3">ランク</th>
              <th className="py-2 pr-3">トレンド</th>
            </tr>
          </thead>
          <tbody>
            {ranking.rankings.map((a, idx) => (
              <tr key={a.templateId} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3 text-xs font-bold text-gray-400">{idx + 1}</td>
                <td className="py-2 pr-3">
                  <div className="font-medium text-xs">{a.label}</div>
                  <div className="text-xs text-gray-400">{a.templateId}</div>
                </td>
                <td className="py-2 pr-3">
                  <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-2 py-0.5 text-xs font-medium">
                    {a.domain}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1">
                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${scoreBar(a.healthScore)}`} style={{ width: `${a.healthScore * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{a.healthScore.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1">
                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${scoreBar(a.stabilityScore)}`} style={{ width: `${a.stabilityScore * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{a.stabilityScore.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2 pr-3 text-center text-xs">{a.adoptionIntentCount}</td>
                <td className="py-2 pr-3 text-center text-xs">{a.derivationIntentCount}</td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-1">
                    <div className="w-12 bg-gray-200 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${scoreBar(a.marketplaceMaturityScore)}`} style={{ width: `${a.marketplaceMaturityScore * 100}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{a.marketplaceMaturityScore.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <span className="text-xs font-bold text-gray-900">{a.overallRankScore.toFixed(3)}</span>
                </td>
                <td className="py-2 pr-3">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${trendBadgeClass(a.trend)}`}>
                    {trendLabel(a.trend)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ranking.topRanked.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          {ranking.topRanked.map((a, idx) => (
            <div key={a.templateId} className="border rounded-lg p-3 bg-green-50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-green-700">Top {idx + 1}</span>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${trendBadgeClass(a.trend)}`}>
                  {trendLabel(a.trend)}
                </span>
              </div>
              <div className="font-medium text-sm">{a.label}</div>
              <div className="text-xs text-gray-500">
                ランク: {a.overallRankScore.toFixed(3)} | Health: {a.healthScore.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      )}

      {ranking.bestDerivationParents.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">最適な派生親テンプレート:</p>
          <div className="flex flex-wrap gap-2">
            {ranking.bestDerivationParents.map((a) => (
              <div key={a.templateId} className="border rounded-lg px-3 py-2 bg-purple-50 text-xs">
                <span className="font-medium">{a.templateId}</span>
                <span className="ml-2 text-gray-500">
                  readiness: {a.derivationReadinessScore.toFixed(2)} | intents: {a.derivationIntentCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {ranking.underusedHealthy.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">未活用だが健全なテンプレート:</p>
          <div className="flex flex-wrap gap-2">
            {ranking.underusedHealthy.map((a) => (
              <div key={a.templateId} className="border rounded-lg px-3 py-2 bg-blue-50 text-xs">
                <span className="font-medium">{a.templateId}</span>
                <span className="ml-2 text-gray-500">
                  health: {a.healthScore.toFixed(2)} | adoption: {a.adoptionIntentCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function orchRunStatusBadge(status: string): string {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "failed": return "bg-red-100 text-red-700";
    case "partial": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function orchJobStatusBadge(status: string): string {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "failed": return "bg-red-100 text-red-700";
    case "skipped": return "bg-gray-100 text-gray-500";
    case "planned": return "bg-blue-100 text-blue-700";
    case "running": return "bg-indigo-100 text-indigo-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function FactoryOrchestrationSection({
  report,
}: {
  report: OrchestrationReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Factory Orchestration</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalJobs}</p>
          <p className="text-xs text-gray-500">登録ジョブ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{report.summary.totalRuns}</p>
          <p className="text-xs text-gray-500">実行回数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-gray-700">
            {report.summary.lastRunAt
              ? new Date(report.summary.lastRunAt).toLocaleString("ja-JP")
              : "—"}
          </p>
          <p className="text-xs text-gray-500">最終実行</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          {report.summary.lastRunStatus ? (
            <span className={`inline-block rounded px-2 py-0.5 text-sm font-medium ${orchRunStatusBadge(report.summary.lastRunStatus)}`}>
              {report.summary.lastRunStatus}
            </span>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
          <p className="text-xs text-gray-500 mt-1">最終ステータス</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">ジョブ</th>
              <th className="py-2 pr-3">説明</th>
              <th className="py-2 pr-3">依存</th>
              <th className="py-2 pr-3">所要時間</th>
            </tr>
          </thead>
          <tbody>
            {report.registry.map((job) => (
              <tr key={job.jobId} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3">
                  <div className="font-medium text-xs">{job.label}</div>
                  <div className="text-xs text-gray-400 font-mono">{job.jobId}</div>
                </td>
                <td className="py-2 pr-3 text-xs text-gray-600">{job.description}</td>
                <td className="py-2 pr-3">
                  {job.dependsOn.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {job.dependsOn.map((dep) => (
                        <span key={dep} className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs">
                          {dep}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-xs text-gray-500">{job.estimatedDuration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {report.recentRuns.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">直近の実行履歴:</p>
          {report.recentRuns.slice(-5).map((run) => (
            <div key={run.runId} className="text-xs border rounded p-3 bg-gray-50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{run.runId}</span>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${orchRunStatusBadge(run.status)}`}>
                  {run.status}
                </span>
              </div>
              <div className="flex gap-4 text-gray-500">
                <span>完了: {run.completedJobs}/{run.totalJobs}</span>
                {run.failedJobs > 0 && <span className="text-red-600">失敗: {run.failedJobs}</span>}
                {run.skippedJobs > 0 && <span>スキップ: {run.skippedJobs}</span>}
                <span>実行者: {run.executedBy}</span>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {run.jobResults.map((jr) => (
                  <span key={jr.jobId} className={`inline-block rounded px-1.5 py-0.5 text-xs ${orchJobStatusBadge(jr.status)}`}>
                    {jr.jobId.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {report.recentRuns.length === 0 && (
        <p className="text-sm text-gray-500">
          オーケストレーション履歴はありません。CLIで run を実行してください。
        </p>
      )}
    </section>
  );
}

function RecommendationTable({
  title,
  subtitle,
  records,
}: {
  title: string;
  subtitle: string;
  records: RecommendationRecordData[];
}) {
  if (records.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">テンプレート</th>
              <th className="py-2 pr-3">ドメイン</th>
              <th className="py-2 pr-3 text-center">スコア</th>
              <th className="py-2 pr-3 text-center">信頼度</th>
              <th className="py-2 pr-3">理由</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={`${rec.recommendationType}-${rec.templateId}-${rec.useCase ?? ""}`} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3">
                  <div className="font-medium text-xs">{rec.label}</div>
                  <div className="text-xs text-gray-400 font-mono">{rec.templateId}</div>
                </td>
                <td className="py-2 pr-3 text-xs text-gray-600">{rec.domain ?? "—"}</td>
                <td className="py-2 pr-3 text-center">
                  <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs font-medium">
                    {rec.score.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                    rec.confidence >= 0.8 ? "bg-green-100 text-green-700" :
                    rec.confidence >= 0.6 ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {rec.confidence.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    {rec.reasons.slice(0, 3).map((r, i) => (
                      <span key={i} className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs">
                        {r}
                      </span>
                    ))}
                    {rec.reasons.length > 3 && (
                      <span className="text-xs text-gray-400">+{rec.reasons.length - 3}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function strategyBadge(strategy: string): string {
  switch (strategy) {
    case "expand": return "bg-green-100 text-green-700";
    case "stabilize": return "bg-amber-100 text-amber-700";
    case "maintain": return "bg-blue-100 text-blue-700";
    case "gap_fill": return "bg-purple-100 text-purple-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function strategyLabel(strategy: string): string {
  switch (strategy) {
    case "expand": return "拡大";
    case "stabilize": return "安定化";
    case "maintain": return "維持";
    case "gap_fill": return "ギャップ補填";
    default: return strategy;
  }
}

function kpiStatusBadge(status: string): string {
  switch (status) {
    case "strong": return "bg-green-100 text-green-800";
    case "healthy": return "bg-blue-100 text-blue-800";
    case "warning": return "bg-amber-100 text-amber-800";
    case "weak": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function kpiStatusLabel(status: string): string {
  switch (status) {
    case "strong": return "Strong";
    case "healthy": return "Healthy";
    case "warning": return "Warning";
    case "weak": return "Weak";
    default: return status;
  }
}

function readinessBadge(readiness: string): string {
  switch (readiness) {
    case "ready": return "bg-green-100 text-green-800";
    case "caution": return "bg-amber-100 text-amber-800";
    case "blocked": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function riskBadge(risk: string): string {
  switch (risk) {
    case "low": return "bg-green-100 text-green-800";
    case "medium": return "bg-amber-100 text-amber-800";
    case "high": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function decisionBadge(decision: string): string {
  switch (decision) {
    case "approve": return "bg-green-100 text-green-800";
    case "defer": return "bg-amber-100 text-amber-800";
    case "reject": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}

function ReviewBoardTable({ title, subtitle, items }: { title: string; subtitle: string; items: ReviewItemData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-gray-400">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">タイトル</th>
              <th className="py-2 pr-3 text-center">タイプ</th>
              <th className="py-2 pr-3 text-center">ドメイン</th>
              <th className="py-2 pr-3 text-center">優先度</th>
              <th className="py-2 pr-3 text-center">準備</th>
              <th className="py-2 pr-3 text-center">リスク</th>
              <th className="py-2 pr-3 text-center">推奨</th>
              <th className="py-2 pr-3">理由</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.reviewId} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3 text-xs">{item.title}</td>
                <td className="py-2 pr-3 text-center text-xs">{item.reviewType}</td>
                <td className="py-2 pr-3 text-center text-xs">{item.domain}</td>
                <td className="py-2 pr-3 text-center">
                  <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs font-medium">
                    {item.priority.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${readinessBadge(item.readiness)}`}>
                    {item.readiness}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${riskBadge(item.risk)}`}>
                    {item.risk}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${decisionBadge(item.recommendedDecision)}`}>
                    {item.recommendedDecision}
                  </span>
                </td>
                <td className="py-2 pr-3 text-xs text-gray-500">
                  {item.reasons.slice(0, 2).join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewBoardSection({
  report,
}: {
  report: ReviewBoardReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Strategic Change Review Board</h2>
      <p className="text-xs text-gray-500">戦略的変更レビューボード（読み取り専用）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalItems}</p>
          <p className="text-xs text-gray-500">レビュー総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.readyCount}</p>
          <p className="text-xs text-gray-500">Ready</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.cautionCount}</p>
          <p className="text-xs text-gray-500">Caution</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.blockedCount}</p>
          <p className="text-xs text-gray-500">Blocked</p>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span>Approve: {report.summary.approveCount}</span>
        <span>Defer: {report.summary.deferCount}</span>
        <span>Reject: {report.summary.rejectCount}</span>
        <span>Avg Priority: {report.summary.averagePriority.toFixed(2)}</span>
      </div>

      <ReviewBoardTable
        title="Ready for Decision"
        subtitle="決定可能なレビューアイテム"
        items={report.readyItems}
      />
      <ReviewBoardTable
        title="Caution"
        subtitle="注意が必要なレビューアイテム"
        items={report.cautionItems}
      />
      <ReviewBoardTable
        title="Blocked"
        subtitle="ブロックされたレビューアイテム"
        items={report.blockedItems}
      />
    </section>
  );
}

function GovernanceEvalTable({ title, subtitle, items }: { title: string; subtitle: string; items: GovernanceEvaluationData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Scenario</th>
              <th className="px-3 py-2 text-left">Readiness</th>
              <th className="px-3 py-2 text-left">Approval</th>
              <th className="px-3 py-2 text-left">Risk</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.governanceId}>
                <td className="px-3 py-2 font-mono">{item.scenarioId}</td>
                <td className="px-3 py-2">
                  <span className={
                    item.executionReadiness === "allowed" ? "text-green-700" :
                    item.executionReadiness === "caution" ? "text-amber-700" : "text-red-700"
                  }>{item.executionReadiness}</span>
                </td>
                <td className="px-3 py-2">{item.approvalRequirement}</td>
                <td className="px-3 py-2">
                  <span className={
                    item.riskLevel === "low" ? "text-green-700" :
                    item.riskLevel === "medium" ? "text-amber-700" : "text-red-700"
                  }>{item.riskLevel}</span>
                </td>
                <td className="px-3 py-2">{item.status.replace(/_/g, " ")}</td>
                <td className="px-3 py-2 max-w-xs truncate" title={item.reasons.join("; ")}>{item.reasons.slice(0, 2).join("; ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioGovernanceSection({
  report,
}: {
  report: GovernanceReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Scenario Execution Governance</h2>
      <p className="text-xs text-gray-500">シナリオ実行ガバナンス（承認・差戻・拒否の管理）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalEvaluations}</p>
          <p className="text-xs text-gray-500">評価総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.allowedCount}</p>
          <p className="text-xs text-gray-500">Allowed</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.cautionCount}</p>
          <p className="text-xs text-gray-500">Caution</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.blockedCount}</p>
          <p className="text-xs text-gray-500">Blocked</p>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span>Approved: {report.summary.approvedCount}</span>
        <span>Deferred: {report.summary.deferredCount}</span>
        <span>Rejected: {report.summary.rejectedCount}</span>
        <span>Pending: {report.summary.pendingCount}</span>
      </div>

      <GovernanceEvalTable
        title="Allowed"
        subtitle="実行許可されたシナリオ"
        items={report.allowedItems}
      />
      <GovernanceEvalTable
        title="Caution / Elevated Approval"
        subtitle="上位承認が必要なシナリオ"
        items={report.cautionItems}
      />
      <GovernanceEvalTable
        title="Blocked"
        subtitle="実行ブロックされたシナリオ"
        items={report.blockedItems}
      />

      {report.decisions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Decision History</h3>
          <p className="text-xs text-gray-500">ガバナンス決定履歴</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Scenario</th>
                  <th className="px-3 py-2 text-left">Action</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Role</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.decisions.map((d) => (
                  <tr key={d.decisionId}>
                    <td className="px-3 py-2 font-mono">{d.scenarioId}</td>
                    <td className="px-3 py-2">{d.action.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">{d.actor.actorId}</td>
                    <td className="px-3 py-2">{d.actor.role}</td>
                    <td className="px-3 py-2">{new Date(d.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ReviewWorkflowTable({ title, subtitle, items }: { title: string; subtitle: string; items: ReviewWorkflowEntryData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Review</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-left">Priority</th>
              <th className="px-3 py-2 text-left">Risk</th>
              <th className="px-3 py-2 text-left">Domain</th>
              <th className="px-3 py-2 text-left">Last Actor</th>
              <th className="px-3 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.workflowId}>
                <td className="px-3 py-2 font-mono">{item.reviewId}</td>
                <td className="px-3 py-2">{item.currentState.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{item.priority.toFixed(2)}</td>
                <td className="px-3 py-2">
                  <span className={
                    item.risk === "low" ? "text-green-700" :
                    item.risk === "medium" ? "text-amber-700" : "text-red-700"
                  }>{item.risk}</span>
                </td>
                <td className="px-3 py-2">{item.domain}</td>
                <td className="px-3 py-2">{item.lastActor ? `${item.lastActor} (${item.lastRole})` : "—"}</td>
                <td className="px-3 py-2">{new Date(item.lastUpdated).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewWorkflowSection({
  report,
}: {
  report: ReviewWorkflowReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Strategic Review Workflow</h2>
      <p className="text-xs text-gray-500">戦略的レビューワークフロー（状態遷移管理）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalWorkflows}</p>
          <p className="text-xs text-gray-500">ワークフロー総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.inReviewCount}</p>
          <p className="text-xs text-gray-500">レビュー中</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.approvedForExecutionCount}</p>
          <p className="text-xs text-gray-500">実行承認済み</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.deferredCount}</p>
          <p className="text-xs text-gray-500">保留</p>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span>Pending: {report.summary.pendingCount}</span>
        <span>Candidates: {report.summary.approvedCandidateCount}</span>
        <span>Rejected: {report.summary.rejectedCount}</span>
        <span>Archived: {report.summary.archivedCount}</span>
      </div>

      <ReviewWorkflowTable title="Pending" subtitle="レビュー待ち" items={report.pendingItems} />
      <ReviewWorkflowTable title="In Review" subtitle="レビュー中" items={report.inReviewItems} />
      <ReviewWorkflowTable title="Approved Candidate" subtitle="承認候補" items={report.approvedCandidateItems} />
      <ReviewWorkflowTable title="Approved for Execution" subtitle="実行承認済み" items={report.approvedForExecutionItems} />
      <ReviewWorkflowTable title="Deferred / Rejected" subtitle="保留・却下" items={[...report.deferredItems, ...report.rejectedItems]} />
    </section>
  );
}

function NotificationDecisionTable({ title, subtitle, items }: { title: string; subtitle: string; items: NotificationDecisionData[] }) {
  if (items.length === 0) return null;
  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "text-red-700 font-bold";
      case "high": return "text-orange-700 font-semibold";
      case "warning": return "text-amber-700";
      default: return "text-gray-600";
    }
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Event</th>
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">Audience</th>
              <th className="px-3 py-2 text-left">Channel</th>
              <th className="px-3 py-2 text-left">Reasons</th>
              <th className="px-3 py-2 text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((d) => (
              <tr key={d.notificationId}>
                <td className="px-3 py-2 font-mono">{d.eventType}</td>
                <td className={`px-3 py-2 ${severityColor(d.severity)}`}>{d.severity}</td>
                <td className="px-3 py-2">{d.audience.join(", ")}</td>
                <td className="px-3 py-2">{d.channelHint}</td>
                <td className="px-3 py-2 max-w-xs truncate" title={d.reasons.join("; ")}>{d.reasons[0] ?? ""}</td>
                <td className="px-3 py-2">{new Date(d.evaluatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AutoPromotionTable({ title, subtitle, items }: { title: string; subtitle: string; items: AutoPromotionResultData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Review</th>
              <th className="px-3 py-2 text-left">Scenario</th>
              <th className="px-3 py-2 text-left">From</th>
              <th className="px-3 py-2 text-left">To</th>
              <th className="px-3 py-2 text-left">Decision</th>
              <th className="px-3 py-2 text-left">Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((r) => (
              <tr key={r.autoPromotionId}>
                <td className="px-3 py-2 font-mono">{r.reviewId}</td>
                <td className="px-3 py-2">{r.scenarioId || "—"}</td>
                <td className="px-3 py-2">{r.fromState}</td>
                <td className="px-3 py-2">{r.toState}</td>
                <td className="px-3 py-2">
                  <span className={r.eligible ? "text-green-700 font-semibold" : "text-gray-500"}>{r.decision.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2 max-w-xs truncate" title={r.reasons.join("; ")}>{r.reasons[0] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EscalationTable({ title, subtitle, items }: { title: string; subtitle: string; items: NotificationEscalationData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Event</th>
              <th className="px-3 py-2 text-left">Base Severity</th>
              <th className="px-3 py-2 text-left">Escalated Severity</th>
              <th className="px-3 py-2 text-left">Level</th>
              <th className="px-3 py-2 text-left">Audience</th>
              <th className="px-3 py-2 text-left">Decision</th>
              <th className="px-3 py-2 text-left">Reasons</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((e) => (
              <tr key={e.escalationId}>
                <td className="px-3 py-2 font-mono">{e.eventType}</td>
                <td className="px-3 py-2">{e.baseSeverity}</td>
                <td className="px-3 py-2">
                  <span className={
                    e.severity === "critical" ? "text-red-700 font-semibold" :
                    e.severity === "high" ? "text-orange-700 font-semibold" :
                    e.severity === "warning" ? "text-amber-700" :
                    "text-gray-500"
                  }>{e.severity}</span>
                </td>
                <td className="px-3 py-2 text-center font-mono">L{e.escalationLevel}</td>
                <td className="px-3 py-2">{e.audience.join(", ")}</td>
                <td className="px-3 py-2">
                  <span className={
                    e.decision === "notify" ? "text-green-700 font-semibold" :
                    e.decision === "renotify" ? "text-amber-700 font-semibold" :
                    "text-gray-400"
                  }>{e.decision}</span>
                </td>
                <td className="px-3 py-2 max-w-xs truncate" title={e.reasons.join("; ")}>{e.reasons[0] ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NotificationEscalationSection({
  report,
}: {
  report: EscalationReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Notification Escalations</h2>
      <p className="text-xs text-gray-500">通知エスカレーションルール（繰り返し検知・期限超過・重大度昇格）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalEscalations}</p>
          <p className="text-xs text-gray-500">エスカレーション総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.bySeverity["critical"] ?? 0}</p>
          <p className="text-xs text-gray-500">Critical</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-orange-700">{report.summary.level2Count}</p>
          <p className="text-xs text-gray-500">Level 2</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.renotifyCount}</p>
          <p className="text-xs text-gray-500">Renotify</p>
        </div>
      </div>

      <EscalationTable title="Critical Alerts" subtitle="重大アラート" items={report.criticalAlerts} />
      <EscalationTable title="Overdue Review Alerts" subtitle="期限超過レビューアラート" items={report.overdueReviewAlerts} />
      <EscalationTable title="Repeated Failure Alerts" subtitle="繰り返し障害アラート" items={report.repeatedFailureAlerts} />
    </section>
  );
}

function ReviewOpsTable({ title, subtitle, items }: { title: string; subtitle: string; items: WorkflowV3EntryData[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title} ({items.length})</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left">Review</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-left">Assignee</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-left">SLA</th>
              <th className="px-3 py-2 text-left">Escalation</th>
              <th className="px-3 py-2 text-left">Re-review</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((r) => (
              <tr key={r.workflowId}>
                <td className="px-3 py-2 font-mono">{r.reviewId}</td>
                <td className="px-3 py-2">{r.currentState.replace(/_/g, " ")}</td>
                <td className="px-3 py-2">{r.assignee ? `${r.assignee.actorId} (${r.assignee.role})` : "—"}</td>
                <td className="px-3 py-2 font-mono text-[10px]">{r.dueAt ? new Date(r.dueAt).toLocaleString("ja-JP") : "—"}</td>
                <td className="px-3 py-2">
                  <span className={
                    r.slaStatus === "overdue" ? "text-red-700 font-semibold" :
                    r.slaStatus === "due_soon" ? "text-amber-700 font-semibold" :
                    "text-green-700"
                  }>{r.slaStatus.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={
                    r.escalationStatus === "escalated" ? "text-red-700 font-semibold" :
                    r.escalationStatus !== "none" ? "text-amber-700 font-semibold" :
                    "text-gray-400"
                  }>{r.escalationStatus === "none" ? "—" : r.escalationStatus.replace(/_/g, " ")}</span>
                </td>
                <td className="px-3 py-2">
                  {r.rereviewRequired ? <span className="text-amber-700 font-semibold">YES</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewOperationsSection({
  report,
}: {
  report: WorkflowV3ReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Review Operations</h2>
      <p className="text-xs text-gray-500">レビュー運用管理（担当・SLA・エスカレーション・再レビュー）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalWorkflows}</p>
          <p className="text-xs text-gray-500">ワークフロー総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.assignedCount}</p>
          <p className="text-xs text-gray-500">担当者あり</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.overdueCount}</p>
          <p className="text-xs text-gray-500">期限超過</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.escalatedCount}</p>
          <p className="text-xs text-gray-500">エスカレーション</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.onTrackCount}</p>
          <p className="text-xs text-gray-500">On Track</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-600">{report.summary.dueSoonCount}</p>
          <p className="text-xs text-gray-500">期限間近</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.unassignedCount}</p>
          <p className="text-xs text-gray-500">未割当</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-orange-700">{report.summary.rereviewCount}</p>
          <p className="text-xs text-gray-500">再レビュー</p>
        </div>
      </div>

      <ReviewOpsTable title="Overdue" subtitle="期限超過" items={report.overdueItems} />
      <ReviewOpsTable title="Due Soon" subtitle="期限間近" items={report.dueSoonItems} />
      <ReviewOpsTable title="Escalated" subtitle="エスカレーション対象" items={report.escalatedItems} />
      <ReviewOpsTable title="Re-Review Required" subtitle="再レビュー必要" items={report.rereviewItems} />
      <ReviewOpsTable title="Assigned" subtitle="担当者あり" items={report.assignedItems} />
    </section>
  );
}

function ScenarioAutoPromotionSection({
  report,
}: {
  report: AutoPromotionReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Scenario Auto-Promotion</h2>
      <p className="text-xs text-gray-500">シナリオ自動昇格ルール（in_review → approved_candidate）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalEvaluated}</p>
          <p className="text-xs text-gray-500">評価総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.eligibleCount}</p>
          <p className="text-xs text-gray-500">Eligible</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.promotedCount}</p>
          <p className="text-xs text-gray-500">Promoted</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.notEligibleCount}</p>
          <p className="text-xs text-gray-500">Not Eligible</p>
        </div>
      </div>

      <AutoPromotionTable title="Eligible for Auto-Promotion" subtitle="自動昇格対象" items={report.eligibleItems.filter((e) => !e.applied)} />
      <AutoPromotionTable title="Auto-Promoted" subtitle="自動昇格済み" items={report.promotedItems} />
      <AutoPromotionTable title="Not Eligible" subtitle="自動昇格対象外" items={report.notEligibleItems} />
    </section>
  );
}

function ScenarioAutoExecutionGuardrailsSection({
  report,
}: {
  report: any;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Scenario Auto-Execution Guardrails</h2>
      <p className="text-xs text-gray-500">シナリオ自動実行ガードレール（評価のみ、実行なし）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalEvaluated}</p>
          <p className="text-xs text-gray-500">評価総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.autoExecutableCount}</p>
          <p className="text-xs text-gray-500">Auto-Executable</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.manualOnlyCount}</p>
          <p className="text-xs text-gray-500">Manual-Only</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.blockedCount}</p>
          <p className="text-xs text-gray-500">Blocked</p>
        </div>
      </div>

      {report.autoExecutableItems && report.autoExecutableItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Auto-Executable Scenarios</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.autoExecutableItems.slice(0, 5).map((item: any) => (
              <div key={item.scenarioId} className="border rounded-lg p-3 bg-green-50">
                <p className="font-mono text-xs text-green-700">{item.scenarioId}</p>
                <p className="text-xs text-gray-600 mt-1">{item.reasons[0]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.manualOnlyItems && report.manualOnlyItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Manual-Only Scenarios</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.manualOnlyItems.slice(0, 5).map((item: any) => (
              <div key={item.scenarioId} className="border rounded-lg p-3 bg-amber-50">
                <p className="font-mono text-xs text-amber-700">{item.scenarioId}</p>
                <p className="text-xs text-gray-600 mt-1">{item.reasons[0]}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.blockedItems && report.blockedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Blocked Scenarios</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.blockedItems.slice(0, 5).map((item: any) => (
              <div key={item.scenarioId} className="border rounded-lg p-3 bg-red-50">
                <p className="font-mono text-xs text-red-700">{item.scenarioId}</p>
                <p className="text-xs text-gray-600 mt-1">{item.reasons[0]}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function NotificationPolicySection({
  report,
}: {
  report: NotificationPolicyReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Notification Policy</h2>
      <p className="text-xs text-gray-500">通知ポリシー（重要度・配信先・抑制の管理）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalDecisions}</p>
          <p className="text-xs text-gray-500">判定総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.notifyCount}</p>
          <p className="text-xs text-gray-500">Notify</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.queuedCount}</p>
          <p className="text-xs text-gray-500">Queued</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-500">{report.summary.suppressedCount}</p>
          <p className="text-xs text-gray-500">Suppressed</p>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-gray-500">
        <span>Info: {report.summary.bySeverity["info"] ?? 0}</span>
        <span>Warning: {report.summary.bySeverity["warning"] ?? 0}</span>
        <span>High: {report.summary.bySeverity["high"] ?? 0}</span>
        <span>Critical: {report.summary.bySeverity["critical"] ?? 0}</span>
      </div>

      <NotificationDecisionTable title="Notify" subtitle="通知対象" items={report.notifyItems} />
      <NotificationDecisionTable title="Queued" subtitle="キュー待ち" items={report.queuedItems} />
      <NotificationDecisionTable title="Suppressed" subtitle="抑制済み" items={report.suppressedItems} />
    </section>
  );
}

function AutomationHooksSection({
  report,
}: {
  report: AutomationHooksReportData;
}) {
  const statusColor = (s: string) => {
    switch (s) {
      case "completed": return "text-green-700";
      case "accepted": return "text-blue-700";
      case "rejected": return "text-red-700";
      case "blocked": return "text-orange-700";
      default: return "text-gray-700";
    }
  };

  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">External Automation Hooks</h2>
      <p className="text-xs text-gray-500">外部オートメーションフック（イベント・トリガー管理）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalEvents}</p>
          <p className="text-xs text-gray-500">イベント総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalTriggers}</p>
          <p className="text-xs text-gray-500">トリガー総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.completedTriggers}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.rejectedTriggers + report.summary.blockedTriggers}</p>
          <p className="text-xs text-gray-500">Rejected / Blocked</p>
        </div>
      </div>

      {report.recentEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Recent Events</h3>
          <p className="text-xs text-gray-500">最近のファクトリイベント</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Event ID</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.recentEvents.slice(0, 10).map((e) => (
                  <tr key={e.eventId}>
                    <td className="px-3 py-2 font-mono">{e.eventId}</td>
                    <td className="px-3 py-2">{e.eventType}</td>
                    <td className="px-3 py-2">{e.source}</td>
                    <td className="px-3 py-2">{new Date(e.occurredAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.recentTriggers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Trigger Requests</h3>
          <p className="text-xs text-gray-500">最近のトリガーリクエスト</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Trigger ID</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Actor</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                  <th className="px-3 py-2 text-left">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.recentTriggers.slice(0, 10).map((t) => (
                  <tr key={t.triggerId}>
                    <td className="px-3 py-2 font-mono">{t.triggerId}</td>
                    <td className="px-3 py-2">{t.triggerType}</td>
                    <td className="px-3 py-2">{t.requestedBy.actorId} ({t.requestedBy.role})</td>
                    <td className={`px-3 py-2 font-semibold ${statusColor(t.status)}`}>{t.status}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={t.reasons.join("; ")}>{t.reasons[0] ?? ""}</td>
                    <td className="px-3 py-2">{new Date(t.requestedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {Object.keys(report.summary.eventTypeCounts).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Hook Status</h3>
          <p className="text-xs text-gray-500">イベントタイプ別カウント</p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(report.summary.eventTypeCounts).map(([type, count]) => (
              <div key={type} className="border rounded-lg px-3 py-2 text-xs">
                <span className="font-mono">{type}</span>: <span className="font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StrategicKpiSection({
  report,
}: {
  report: StrategicKpiReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Strategic KPI</h2>
      <p className="text-xs text-gray-500">戦略的 KPI メトリクス（読み取り専用）</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalKpis}</p>
          <p className="text-xs text-gray-500">KPI 総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.strongCount}</p>
          <p className="text-xs text-gray-500">Strong</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-blue-700">{report.summary.healthyCount}</p>
          <p className="text-xs text-gray-500">Healthy</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.warningCount}</p>
          <p className="text-xs text-gray-500">Warning</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.weakCount}</p>
          <p className="text-xs text-gray-500">Weak</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Overall:</span>
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kpiStatusBadge(report.summary.overallStatus)}`}>
          {kpiStatusLabel(report.summary.overallStatus)}
        </span>
        <span className="text-gray-500">(Score: {report.summary.overallScore})</span>
      </div>

      {report.categories.map((cat) => (
        <div key={cat.category} className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{cat.label}</h3>
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kpiStatusBadge(cat.overallStatus)}`}>
              {kpiStatusLabel(cat.overallStatus)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3">KPI</th>
                  <th className="py-2 pr-3 text-right">値</th>
                  <th className="py-2 pr-3 text-center">ステータス</th>
                  <th className="py-2 pr-3">理由</th>
                </tr>
              </thead>
              <tbody>
                {cat.kpis.map((kpi) => (
                  <tr key={kpi.kpiKey} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-3 text-xs">{kpi.label}</td>
                    <td className="py-2 pr-3 text-right text-xs font-mono">
                      {kpi.value}{kpi.unit}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kpiStatusBadge(kpi.status)}`}>
                        {kpiStatusLabel(kpi.status)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500">
                      {kpi.reasons.slice(0, 2).join(" / ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {report.domainRollups.length > 0 && (
        <div className="border rounded-lg p-4 space-y-2">
          <h3 className="text-sm font-semibold">ドメイン別ロールアップ</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3">ドメイン</th>
                  <th className="py-2 pr-3 text-center">戦略</th>
                  <th className="py-2 pr-3 text-center">ステータス</th>
                  <th className="py-2 pr-3">KPI サマリ</th>
                </tr>
              </thead>
              <tbody>
                {report.domainRollups.map((rollup) => (
                  <tr key={rollup.domain} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-3 text-xs font-mono">{rollup.domain}</td>
                    <td className="py-2 pr-3 text-center text-xs">{rollup.strategy}</td>
                    <td className="py-2 pr-3 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${kpiStatusBadge(rollup.overallStatus)}`}>
                        {kpiStatusLabel(rollup.overallStatus)}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-gray-500">
                      {rollup.kpis.map((k) => `${k.label}: ${k.value}${k.unit}`).join(" / ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function PortfolioStrategySection({
  report,
}: {
  report: PortfolioStrategyReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Template Portfolio Strategy</h2>
      <p className="text-xs text-gray-500">ドメイン別ポートフォリオ戦略（読み取り専用）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.expandCount}</p>
          <p className="text-xs text-gray-500">拡大対象</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-700">{report.summary.gapFillCount}</p>
          <p className="text-xs text-gray-500">ギャップ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.stabilizeCount}</p>
          <p className="text-xs text-gray-500">安定化対象</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-gray-700">
            {report.summary.coveredDomains}/{report.summary.totalDomains}
          </p>
          <p className="text-xs text-gray-500">カバー率</p>
        </div>
      </div>

      {report.domainStrategies.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600">ドメイン戦略:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="py-2 pr-3">ドメイン</th>
                  <th className="py-2 pr-3 text-center">テンプレート</th>
                  <th className="py-2 pr-3 text-center">GREEN</th>
                  <th className="py-2 pr-3 text-center">Health</th>
                  <th className="py-2 pr-3 text-center">Stability</th>
                  <th className="py-2 pr-3 text-center">派生ポテンシャル</th>
                  <th className="py-2 pr-3 text-center">カバレッジ</th>
                  <th className="py-2 pr-3 text-center">拡大優先度</th>
                  <th className="py-2 pr-3">戦略</th>
                </tr>
              </thead>
              <tbody>
                {report.domainStrategies.map((d) => (
                  <tr key={d.domain} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-3 font-medium text-xs">{d.domain}</td>
                    <td className="py-2 pr-3 text-center text-xs">{d.templateCount}</td>
                    <td className="py-2 pr-3 text-center text-xs">{d.greenCount}</td>
                    <td className="py-2 pr-3 text-center text-xs">{d.averageHealthScore.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-center text-xs">{d.averageStabilityScore.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-center text-xs">{d.derivationPotential.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-center text-xs">{d.coverageScore.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-center">
                      <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs font-medium">
                        {d.expansionPriorityScore.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${strategyBadge(d.strategy)}`}>
                        {strategyLabel(d.strategy)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.gaps.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">戦略的ギャップ:</p>
          {report.gaps.slice(0, 5).map((gap) => (
            <div key={gap.domain} className="text-xs border rounded p-3 bg-gray-50 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">{gap.domain}</span>
                <span className="inline-block bg-purple-100 text-purple-700 rounded px-2 py-0.5 text-xs font-medium">
                  優先度: {gap.fillPriority.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-4 text-gray-500">
                {gap.adjacentDomains.length > 0 && (
                  <span>隣接: {gap.adjacentDomains.join(", ")}</span>
                )}
                {gap.evolutionProposalCount > 0 && (
                  <span>提案: {gap.evolutionProposalCount}件</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {gap.reasons.map((r, i) => (
                  <span key={i} className="inline-block bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 text-xs">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function scenarioTypeBadge(type: string): string {
  switch (type) {
    case "expand_domain": return "bg-green-100 text-green-700";
    case "fill_gap": return "bg-purple-100 text-purple-700";
    case "stabilize_domain": return "bg-amber-100 text-amber-700";
    default: return "bg-gray-100 text-gray-500";
  }
}

function scenarioTypeLabel(type: string): string {
  switch (type) {
    case "expand_domain": return "拡大";
    case "fill_gap": return "ギャップ補填";
    case "stabilize_domain": return "安定化";
    default: return type;
  }
}

function ScenarioTable({
  title,
  subtitle,
  scenarios,
}: {
  title: string;
  subtitle: string;
  scenarios: FactoryScenarioData[];
}) {
  if (scenarios.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">シナリオ</th>
              <th className="py-2 pr-3">ドメイン</th>
              <th className="py-2 pr-3 text-center">タイプ</th>
              <th className="py-2 pr-3 text-center">優先度</th>
              <th className="py-2 pr-3 text-center">ステップ</th>
              <th className="py-2 pr-3 text-center">影響</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((sc) => (
              <tr key={sc.scenarioId} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3">
                  <div className="font-medium text-xs font-mono">{sc.scenarioId}</div>
                  <div className="text-xs text-gray-400">
                    {sc.currentTemplateCount} → {sc.targetTemplateCount} (gap: {sc.gap})
                  </div>
                </td>
                <td className="py-2 pr-3 text-xs">{sc.domain}</td>
                <td className="py-2 pr-3 text-center">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${scenarioTypeBadge(sc.type)}`}>
                    {scenarioTypeLabel(sc.type)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center">
                  <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs font-medium">
                    {sc.priorityScore.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-center text-xs">{sc.steps.length}</td>
                <td className="py-2 pr-3 text-center text-xs">
                  <div>coverage +{sc.estimatedImpact.coverageIncrease.toFixed(2)}</div>
                  <div className="text-gray-400">strength +{sc.estimatedImpact.portfolioStrength.toFixed(2)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScenarioPlannerSection({
  report,
}: {
  report: ScenarioReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Factory Scenario Planner</h2>
      <p className="text-xs text-gray-500">ポートフォリオ戦略に基づくシナリオ計画（読み取り専用）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalScenarios}</p>
          <p className="text-xs text-gray-500">シナリオ総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.expansionCount}</p>
          <p className="text-xs text-gray-500">拡大シナリオ</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-purple-700">{report.summary.gapFillCount}</p>
          <p className="text-xs text-gray-500">ギャップ補填</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{report.summary.totalNewTemplates}</p>
          <p className="text-xs text-gray-500">新規テンプレート</p>
        </div>
      </div>

      <ScenarioTable
        title="拡大シナリオ"
        subtitle="ドメイン拡大のためのシナリオ計画"
        scenarios={report.expansionScenarios}
      />

      <ScenarioTable
        title="ギャップ補填シナリオ"
        subtitle="未カバードメインへの新規テンプレート追加"
        scenarios={report.gapFillScenarios}
      />

      <ScenarioTable
        title="安定化シナリオ"
        subtitle="品質改善が必要なドメインの安定化計画"
        scenarios={report.stabilizationScenarios}
      />
    </section>
  );
}

function executionStatusBadge(status: string): string {
  switch (status) {
    case "completed": return "bg-green-100 text-green-800";
    case "ready": return "bg-blue-100 text-blue-800";
    case "partial": return "bg-amber-100 text-amber-800";
    case "failed": return "bg-red-100 text-red-800";
    case "blocked": return "bg-gray-200 text-gray-700";
    default: return "bg-gray-100 text-gray-800";
  }
}

function ScenarioExecutionSection({
  report,
}: {
  report: ScenarioExecutionReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Scenario Execution</h2>
      <p className="text-xs text-gray-500">シナリオ実行ブリッジ（読み取り専用）</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalExecutions}</p>
          <p className="text-xs text-gray-500">実行総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.completedCount}</p>
          <p className="text-xs text-gray-500">完了</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.partialCount}</p>
          <p className="text-xs text-gray-500">部分完了</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-red-700">{report.summary.failedCount}</p>
          <p className="text-xs text-gray-500">失敗</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-600">{report.summary.blockedCount}</p>
          <p className="text-xs text-gray-500">ブロック</p>
        </div>
      </div>

      {report.recentExecutions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-2 pr-3">実行 ID</th>
                <th className="py-2 pr-3">シナリオ</th>
                <th className="py-2 pr-3 text-center">ステータス</th>
                <th className="py-2 pr-3 text-center">モード</th>
                <th className="py-2 pr-3 text-center">ジョブ</th>
                <th className="py-2 pr-3">実行者</th>
              </tr>
            </thead>
            <tbody>
              {report.recentExecutions.map((exec) => (
                <tr key={exec.executionId} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-3 text-xs font-mono">{exec.executionId.slice(0, 24)}...</td>
                  <td className="py-2 pr-3 text-xs">
                    <div>{exec.scenarioId}</div>
                    <div className="text-gray-400">{exec.domain} / {exec.scenarioType}</div>
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${executionStatusBadge(exec.status)}`}>
                      {exec.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-center text-xs">{exec.mode}</td>
                  <td className="py-2 pr-3 text-center text-xs">
                    {exec.summary.completedJobs}/{exec.summary.totalJobs}
                  </td>
                  <td className="py-2 pr-3 text-xs">{exec.actor.actorId} ({exec.actor.role})</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {report.recentExecutions.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">実行履歴なし</p>
      )}
    </section>
  );
}

function TemplateRecommendationSection({
  report,
}: {
  report: RecommendationReportData;
}) {
  // Collect use cases with recommendations
  const useCasesWithRecs = Object.entries(report.byUseCase)
    .filter(([, recs]) => recs.length > 0)
    .slice(0, 4);

  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Template Recommendations</h2>
      <p className="text-xs text-gray-500">テンプレートの推奨結果（読み取り専用）</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-gray-900">{report.summary.totalRecommendations}</p>
          <p className="text-xs text-gray-500">推奨総数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{report.summary.bestDerivationParentCount}</p>
          <p className="text-xs text-gray-500">派生親候補</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-amber-700">{report.summary.underusedCount}</p>
          <p className="text-xs text-gray-500">未活用高品質</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-green-700">{report.summary.risingCount}</p>
          <p className="text-xs text-gray-500">上昇傾向</p>
        </div>
      </div>

      {useCasesWithRecs.map(([uc, recs]) => (
        <RecommendationTable
          key={uc}
          title={`ユースケース: ${uc}`}
          subtitle={`「${uc}」に推奨されるテンプレート`}
          records={recs}
        />
      ))}

      <RecommendationTable
        title="ベスト派生親テンプレート"
        subtitle="派生元として最適なテンプレート"
        records={report.bestDerivationParents.slice(0, 5)}
      />

      <RecommendationTable
        title="本番環境向け安全テンプレート"
        subtitle="プロダクション利用に最も安全なテンプレート"
        records={report.safestProductionTemplates.slice(0, 5)}
      />

      <RecommendationTable
        title="未活用・高品質テンプレート"
        subtitle="高品質だがアダプション未実施のテンプレート"
        records={report.underusedHighQuality.slice(0, 5)}
      />

      <RecommendationTable
        title="上昇傾向テンプレート"
        subtitle="トレンドが上昇しているテンプレート"
        records={report.risingTemplates.slice(0, 5)}
      />
    </section>
  );
}

function FactoryRuntimeSection({
  report,
}: {
  report: RuntimeExecutionReportData;
}) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Factory Runtime Execution</h2>
      <p className="text-xs text-gray-500">実行済みランタイムジョブの履歴とサマリー</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 text-center">
          <p className="text-xl font-bold text-indigo-700">{report.summary.totalRuns}</p>
          <p className="text-xs text-gray-500">実行回数</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-gray-700">
            {report.summary.lastRunAt
              ? new Date(report.summary.lastRunAt).toLocaleString("ja-JP")
              : "—"}
          </p>
          <p className="text-xs text-gray-500">最終実行</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          {report.summary.lastRunStatus ? (
            <span className={`inline-block rounded px-2 py-0.5 text-sm font-medium ${orchRunStatusBadge(report.summary.lastRunStatus)}`}>
              {report.summary.lastRunStatus}
            </span>
          ) : (
            <p className="text-sm text-gray-400">—</p>
          )}
          <p className="text-xs text-gray-500 mt-1">最終ステータス</p>
        </div>
        <div className="border rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-gray-700">
            {report.summary.lastRunGroup ?? "—"}
          </p>
          <p className="text-xs text-gray-500">最終グループ</p>
        </div>
      </div>

      {report.recentRuns.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-medium text-gray-600">直近の実行履歴:</p>
          {report.recentRuns.slice(-5).map((run) => (
            <div key={run.runId} className="text-xs border rounded p-3 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{run.runId}</span>
                <div className="flex items-center gap-2">
                  {run.group && (
                    <span className="inline-block bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5 text-xs">
                      {run.group}
                    </span>
                  )}
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${orchRunStatusBadge(run.status)}`}>
                    {run.status}
                  </span>
                </div>
              </div>
              <div className="flex gap-4 text-gray-500">
                <span>完了: {run.completedJobs}/{run.totalJobs}</span>
                {run.failedJobs > 0 && <span className="text-red-600">失敗: {run.failedJobs}</span>}
                {run.skippedJobs > 0 && <span>スキップ: {run.skippedJobs}</span>}
                <span>実行者: {run.executedBy}</span>
              </div>
              {run.jobs.filter((j) => j.status === "completed" && j.summary).length > 0 && (
                <div className="space-y-1 pt-1">
                  {run.jobs
                    .filter((j) => j.status === "completed" && j.summary)
                    .map((j) => (
                      <div key={j.jobId} className="flex items-start gap-2">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${orchJobStatusBadge(j.status)}`}>
                          {j.jobId.replace(/_/g, " ")}
                        </span>
                        <span className="text-gray-500">
                          {j.summary!.description}
                          {j.durationMs !== null && ` (${j.durationMs}ms)`}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              {run.jobs.filter((j) => j.status === "failed").length > 0 && (
                <div className="space-y-1 pt-1">
                  {run.jobs
                    .filter((j) => j.status === "failed")
                    .map((j) => (
                      <div key={j.jobId} className="flex items-start gap-2 text-red-600">
                        <span className="inline-block bg-red-100 text-red-700 rounded px-1.5 py-0.5 text-xs">
                          {j.jobId.replace(/_/g, " ")}
                        </span>
                        <span>{j.error}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {report.recentRuns.length === 0 && (
        <p className="text-sm text-gray-500">
          ランタイム実行履歴はありません。CLIで run を実行してください。
        </p>
      )}
    </section>
  );
}

const EXPORT_TARGETS = [
  { target: "marketplace", label: "Marketplace Catalog", formats: "JSON, CSV", filters: "domain, healthState" },
  { target: "releases", label: "Release Catalog", formats: "JSON, CSV", filters: "stage, domain" },
  { target: "ranking", label: "Template Ranking", formats: "JSON, CSV", filters: "domain, healthState" },
  { target: "recommendations", label: "Recommendations", formats: "JSON", filters: "domain, recommendationType" },
  { target: "portfolio", label: "Portfolio Strategy", formats: "JSON", filters: "domain" },
  { target: "scenarios", label: "Scenario Plans", formats: "JSON", filters: "domain, type" },
  { target: "kpis", label: "Strategic KPIs", formats: "JSON, CSV", filters: "category" },
];

function ExternalExportsSection() {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">External Exports</h2>
      <p className="text-xs text-gray-500">Factory アーティファクトのエクスポート（読み取り専用）</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">ターゲット</th>
              <th className="py-2 pr-3">フォーマット</th>
              <th className="py-2 pr-3">フィルタ</th>
              <th className="py-2 pr-3">リンク</th>
            </tr>
          </thead>
          <tbody>
            {EXPORT_TARGETS.map((t) => (
              <tr key={t.target} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3 text-xs font-medium">{t.label}</td>
                <td className="py-2 pr-3 text-xs text-gray-600">{t.formats}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">{t.filters}</td>
                <td className="py-2 pr-3 text-xs">
                  <a
                    href={`/api/factory-export/${t.target}?format=json`}
                    className="text-indigo-600 hover:underline mr-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    JSON
                  </a>
                  {t.formats.includes("CSV") && (
                    <a
                      href={`/api/factory-export/${t.target}?format=csv`}
                      className="text-indigo-600 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CSV
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-400">
        Manifest: <a href="/api/factory-export/manifest" className="text-indigo-500 hover:underline" target="_blank" rel="noopener noreferrer">/api/factory-export/manifest</a>
      </div>
    </section>
  );
}

function CostOverviewSection({ costOverview }: { costOverview: DashboardData["costOverview"] }) {
  return (
    <section className="border rounded-xl p-5 space-y-4">
      <h2 className="text-lg font-semibold">Cost Overview</h2>
      <p className="text-xs text-gray-500">モデル別の料金テーブルとデフォルトステップコスト見積もり</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="py-2 pr-3">Model</th>
              <th className="py-2 pr-3 text-right">Input / 1M tokens</th>
              <th className="py-2 pr-3 text-right">Output / 1M tokens</th>
            </tr>
          </thead>
          <tbody>
            {costOverview.models.map((m) => (
              <tr key={m.model} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-3 font-medium">{m.model}</td>
                <td className="py-2 pr-3 text-right">${m.inputPer1M.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">${m.outputPer1M.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DiscoveryOverviewCard({ discovery }: { discovery: DiscoveryOverviewData }) {
  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Idea Discovery</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-3xl font-bold text-blue-600">
            {discovery.totalDiscoveredIdeas}
          </div>
          <div className="text-sm text-gray-600">Total Ideas</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-green-600">
            {discovery.recentlyMatched}
          </div>
          <div className="text-sm text-gray-600">Matched Templates</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-amber-600">
            {discovery.gapsDetected}
          </div>
          <div className="text-sm text-gray-600">Template Gaps</div>
        </div>
        <div>
          <div className="text-sm text-gray-700 font-semibold">Last Run</div>
          <div className="text-sm text-gray-600">
            {discovery.lastRunAt
              ? new Date(discovery.lastRunAt).toLocaleDateString()
              : "Never"}
          </div>
        </div>
      </div>
      {discovery.topDomains.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-2">
            Top Domains
          </div>
          <div className="flex flex-wrap gap-2">
            {discovery.topDomains.slice(0, 5).map((domain) => (
              <span
                key={domain}
                className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
              >
                {domain}
              </span>
            ))}
          </div>
        </div>
      )}
      <a
        href="/discoveries"
        className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
      >
        View All Ideas →
      </a>
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────

export default function FactoryDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/factory-dashboard");
      if (!res.ok) throw new Error("Failed to fetch factory dashboard");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleProposalDecision = useCallback(
    async (proposalId: string, decision: string) => {
      try {
        const res = await fetch("/api/factory-dashboard/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId, decision }),
        });
        if (!res.ok) throw new Error("Failed to submit decision");
        await fetchDashboard();
      } catch (err) {
        console.error("Decision failed:", err);
      }
    },
    [fetchDashboard],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <p className="text-red-500">{error || "Failed to load dashboard"}</p>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Factory Observability Dashboard</h1>
        <p className="text-xs text-gray-500">
          Generated at {new Date(data.generatedAt).toLocaleString("ja-JP")}
          {" — "}読み取り専用
        </p>
      </div>

      <FactoryOverviewCard overview={data.overview} />
      <DiscoveryOverviewCard discovery={data.discoveryOverview} />
      <TemplateHealthTable templates={data.templateHealth} />
      <ProviderPerformanceTable routes={data.providerRoutes} />
      <RegressionHistoryTable configs={data.regressionConfigs} />
      <AutopilotRunsTable selection={data.autopilotSelection} />
      <FactoryProposalsSection
        report={data.approvalReport}
        onDecision={handleProposalDecision}
      />
      <ApprovedChangesSection report={data.adoptionReport} />
      <PolicyPromotionSection report={data.promotionReport} />
      <RollbackCandidatesSection report={data.rollbackReport} />
      <FactoryAuditSection report={data.auditReport} />
      <ReviewBoardSection report={data.reviewBoard} />
      <StrategicKpiSection report={data.strategicKpis} />
      <PortfolioStrategySection report={data.portfolioStrategy} />
      <ScenarioPlannerSection report={data.scenarioPlanner} />
      <ScenarioExecutionSection report={data.scenarioExecution} />
      <ScenarioGovernanceSection report={data.scenarioGovernance} />
      <AutomationHooksSection report={data.automationHooks} />
      <ReviewWorkflowSection report={data.reviewWorkflow} />
      <NotificationPolicySection report={data.notificationPolicy} />
      <NotificationEscalationSection report={data.notificationEscalation} />
      <ReviewOperationsSection report={data.reviewOperations} />
      <ScenarioAutoPromotionSection report={data.scenarioAutoPromotion} />
      <TemplateRecommendationSection report={data.recommendationReport} />
      <ScenarioAutoExecutionGuardrailsSection report={data.scenarioAutoExecutionGuardrails} />
      <TemplateReleaseSection release={data.templateRelease} />
      <TemplateMarketplaceSection report={data.marketplaceReport} />
      <TemplateRankingSection ranking={data.templateRanking} />
      <DerivationPipelineSection pipeline={data.derivationPipeline} />
      <FactoryRuntimeSection report={data.runtimeReport} />
      <FactoryOrchestrationSection report={data.orchestrationReport} />
      <RolePermissionsSection permissions={data.rolePermissions} />
      <ExternalExportsSection />
      <EvolutionProposalTable report={data.evolutionReport} />
      <CostOverviewSection costOverview={data.costOverview} />
    </main>
  );
}
