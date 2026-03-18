/**
 * Scenario Execution Bridge v1
 *
 * Provides:
 *   1. Scenario step → runtime job mapping
 *   2. Execution eligibility validation
 *   3. Dry-run preview
 *   4. Controlled execution via Factory Runtime Execution
 *   5. Execution reports and traceability
 *
 * Does NOT bypass governance, approval, or safety rules.
 * Does NOT mutate scenario definitions.
 */

import {
  buildScenarioReport,
  type FactoryScenario,
  type ScenarioStep,
  type ScenarioStepType,
  type ScenarioReport,
} from "./factory-scenario-planner";
import {
  type OrchestrationJobId,
} from "./factory-orchestration";
import {
  planRuntimeExecution,
  executeRuntimeRun,
  type RuntimeExecutionRun,
  type RuntimeJobResult,
} from "./factory-runtime-execution";
import {
  authorizeFactoryAction,
  type FactoryActor,
  type FactoryAction,
  type AuthorizationResult,
} from "./team-role-approval";
import {
  evaluateAllTemplateHealth,
  type GovernanceSummaryRollup,
} from "./template-health-governance";
import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "../templates/template-catalog";
import type { TemplateHealthSignals } from "./template-health-governance";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutionJobType =
  | "derivation_pipeline_prepare"
  | "governance_evaluation"
  | "nightly_regression"
  | "marketplace_catalog_refresh"
  | "self_improvement_scan"
  | "dashboard_snapshot_refresh"
  | "policy_simulation_refresh";

export type ExecutionStatus = "ready" | "blocked" | "completed" | "partial" | "failed";

export interface ExecutionJob {
  jobId: string;
  jobType: ExecutionJobType;
  orchestrationJobId: OrchestrationJobId;
  sourceStepIndex: number;
  sourceStepType: ScenarioStepType;
  description: string;
  parentTemplateId: string | null;
  targetTemplateId: string | null;
  targetStage: string | null;
}

export interface ScenarioExecutionPlan {
  executionId: string;
  scenarioId: string;
  scenarioType: string;
  domain: string;
  jobs: ExecutionJob[];
  executionOrder: OrchestrationJobId[];
  totalJobs: number;
  actor: FactoryActor;
  createdAt: string;
}

export interface EligibilityCheck {
  check: string;
  passed: boolean;
  reason: string;
}

export interface ExecutionEligibility {
  allowed: boolean;
  scenarioId: string;
  checks: EligibilityCheck[];
  blockedReasons: string[];
}

export interface ScenarioExecutionResult {
  executionId: string;
  scenarioId: string;
  scenarioType: string;
  domain: string;
  status: ExecutionStatus;
  mode: "dry_run" | "execute";
  jobs: ExecutionJob[];
  jobResults: RuntimeJobResult[];
  blockedReasons: string[];
  actor: FactoryActor;
  summary: {
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    skippedJobs: number;
  };
  startedAt: string;
  completedAt: string;
}

export interface ScenarioExecutionReport {
  recentExecutions: ScenarioExecutionResult[];
  summary: {
    totalExecutions: number;
    completedCount: number;
    partialCount: number;
    failedCount: number;
    blockedCount: number;
  };
  generatedAt: string;
}

export interface BridgeInputs {
  scenarioReport: ScenarioReport;
  governanceSummary: GovernanceSummaryRollup;
}

// ---------------------------------------------------------------------------
// In-memory store (test isolation)
// ---------------------------------------------------------------------------

interface BridgeMemoryState {
  history: ScenarioExecutionResult[];
}

let memoryState: BridgeMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<BridgeMemoryState>): void {
  memoryState = {
    history: initial?.history ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getHistory(): ScenarioExecutionResult[] {
  return memoryState?.history ?? [];
}

function addToHistory(result: ScenarioExecutionResult): void {
  if (memoryState) {
    memoryState.history.push(result);
  }
}

// ---------------------------------------------------------------------------
// Step → Job mapping
// ---------------------------------------------------------------------------

const STEP_TO_JOB_MAP: Record<ScenarioStepType, OrchestrationJobId> = {
  derive_template: "derivation_pipeline_prepare",
  create_template: "self_improvement_scan",
  validate: "nightly_regression",
  release: "marketplace_catalog_refresh",
  publish: "marketplace_catalog_refresh",
  run_regression: "nightly_regression",
  governance_review: "governance_evaluation",
};

export function mapStepToJob(
  step: ScenarioStep,
  stepIndex: number,
  scenarioId: string,
): ExecutionJob {
  const orchJobId = STEP_TO_JOB_MAP[step.stepType];
  return {
    jobId: `${scenarioId}_step_${stepIndex}_${step.stepType}`,
    jobType: orchJobId as ExecutionJobType,
    orchestrationJobId: orchJobId,
    sourceStepIndex: stepIndex,
    sourceStepType: step.stepType,
    description: step.description,
    parentTemplateId: step.parentTemplateId,
    targetTemplateId: step.targetTemplateId,
    targetStage: step.targetStage,
  };
}

// ---------------------------------------------------------------------------
// Execution plan builder
// ---------------------------------------------------------------------------

function resolveJobExecutionOrder(jobs: ExecutionJob[]): OrchestrationJobId[] {
  // Deterministic ordering: governance first, then regression, then derivation,
  // then marketplace/release, then dashboard/improvement
  const ORDER: OrchestrationJobId[] = [
    "governance_evaluation",
    "nightly_regression",
    "self_improvement_scan",
    "policy_simulation_refresh",
    "derivation_pipeline_prepare",
    "marketplace_catalog_refresh",
    "dashboard_snapshot_refresh",
  ];

  const needed = new Set<OrchestrationJobId>();
  for (const job of jobs) {
    needed.add(job.orchestrationJobId);
  }
  // Always include governance_evaluation as prerequisite
  needed.add("governance_evaluation");

  return ORDER.filter((id) => needed.has(id));
}

export function buildScenarioExecutionPlan(
  scenario: FactoryScenario,
  actor: FactoryActor,
): ScenarioExecutionPlan {
  const jobs = scenario.steps.map((step, idx) =>
    mapStepToJob(step, idx, scenario.scenarioId)
  );

  const executionOrder = resolveJobExecutionOrder(jobs);
  const executionId = `exec_${scenario.scenarioId}_${Date.now()}`;

  return {
    executionId,
    scenarioId: scenario.scenarioId,
    scenarioType: scenario.type,
    domain: scenario.domain,
    jobs,
    executionOrder,
    totalJobs: executionOrder.length,
    actor,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Eligibility validation
// ---------------------------------------------------------------------------

const REQUIRED_ACTIONS: FactoryAction[] = [
  "orchestration.run",
  "marketplace.derive",
  "release.preview",
];

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

export function validateScenarioExecution(
  scenario: FactoryScenario,
  actor: FactoryActor,
  overrides?: Partial<BridgeInputs>,
): ExecutionEligibility {
  const checks: EligibilityCheck[] = [];
  const blockedReasons: string[] = [];

  // Check 1: Role authorization
  for (const action of REQUIRED_ACTIONS) {
    const authResult = authorizeFactoryAction(actor, action);
    checks.push({
      check: `role_authorization:${action}`,
      passed: authResult.allowed,
      reason: authResult.reason,
    });
    if (!authResult.allowed) {
      blockedReasons.push(`Unauthorized: ${action} — ${authResult.reason}`);
    }
  }

  // Check 2: Scenario has steps
  checks.push({
    check: "scenario_has_steps",
    passed: scenario.steps.length > 0,
    reason: scenario.steps.length > 0
      ? `${scenario.steps.length} steps to execute`
      : "Scenario has no steps",
  });
  if (scenario.steps.length === 0) {
    blockedReasons.push("Scenario has no steps to execute");
  }

  // Check 3: Governance health (no demoted templates blocking execution)
  const govSummary = overrides?.governanceSummary ?? buildDefaultGovernanceSummary();
  const hasDemoted = govSummary.demotedCount > 0;
  checks.push({
    check: "governance_health",
    passed: !hasDemoted,
    reason: hasDemoted
      ? `${govSummary.demotedCount} demoted templates may affect execution`
      : "No demoted templates",
  });
  if (hasDemoted) {
    blockedReasons.push(`${govSummary.demotedCount} demoted template(s) detected`);
  }

  // Check 4: Parent template availability (for derivation steps)
  const derivationSteps = scenario.steps.filter((s) => s.stepType === "derive_template");
  const allHaveParent = derivationSteps.every((s) => s.parentTemplateId !== null);
  checks.push({
    check: "parent_template_availability",
    passed: allHaveParent,
    reason: allHaveParent
      ? derivationSteps.length > 0
        ? `${derivationSteps.length} derivation steps have parent templates`
        : "No derivation steps"
      : "Some derivation steps have no parent template",
  });
  if (!allHaveParent) {
    blockedReasons.push("Derivation steps require parent templates");
  }

  // Check 5: Priority score (warn on low priority)
  const lowPriority = scenario.priorityScore < 0.3;
  checks.push({
    check: "priority_score",
    passed: !lowPriority,
    reason: lowPriority
      ? `Priority score ${scenario.priorityScore.toFixed(2)} is below threshold 0.30`
      : `Priority score ${scenario.priorityScore.toFixed(2)} is adequate`,
  });
  // Low priority is a warning, not a blocker

  return {
    allowed: blockedReasons.length === 0,
    scenarioId: scenario.scenarioId,
    checks,
    blockedReasons,
  };
}

// ---------------------------------------------------------------------------
// Preview (dry run)
// ---------------------------------------------------------------------------

export function previewScenarioExecution(
  scenario: FactoryScenario,
  actor: FactoryActor,
  overrides?: Partial<BridgeInputs>,
): ScenarioExecutionResult {
  const plan = buildScenarioExecutionPlan(scenario, actor);
  const eligibility = validateScenarioExecution(scenario, actor, overrides);

  // Dry-run via runtime execution
  const runtimeRun = planRuntimeExecution({
    jobIds: plan.executionOrder,
    actor,
  });

  const status: ExecutionStatus = eligibility.allowed ? "ready" : "blocked";

  const result: ScenarioExecutionResult = {
    executionId: plan.executionId,
    scenarioId: scenario.scenarioId,
    scenarioType: scenario.type,
    domain: scenario.domain,
    status,
    mode: "dry_run",
    jobs: plan.jobs,
    jobResults: runtimeRun.jobs,
    blockedReasons: eligibility.blockedReasons,
    actor,
    summary: {
      totalJobs: runtimeRun.totalJobs,
      completedJobs: runtimeRun.completedJobs,
      failedJobs: runtimeRun.failedJobs,
      skippedJobs: runtimeRun.skippedJobs,
    },
    startedAt: runtimeRun.startedAt,
    completedAt: runtimeRun.completedAt,
  };

  addToHistory(result);
  return result;
}

// ---------------------------------------------------------------------------
// Controlled execution
// ---------------------------------------------------------------------------

export function applyScenarioExecution(
  scenario: FactoryScenario,
  actor: FactoryActor,
  overrides?: Partial<BridgeInputs>,
): ScenarioExecutionResult {
  const plan = buildScenarioExecutionPlan(scenario, actor);
  const eligibility = validateScenarioExecution(scenario, actor, overrides);

  if (!eligibility.allowed) {
    const result: ScenarioExecutionResult = {
      executionId: plan.executionId,
      scenarioId: scenario.scenarioId,
      scenarioType: scenario.type,
      domain: scenario.domain,
      status: "blocked",
      mode: "execute",
      jobs: plan.jobs,
      jobResults: [],
      blockedReasons: eligibility.blockedReasons,
      actor,
      summary: { totalJobs: 0, completedJobs: 0, failedJobs: 0, skippedJobs: 0 },
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    addToHistory(result);
    return result;
  }

  // Execute via runtime execution
  const runtimeRun = executeRuntimeRun({
    jobIds: plan.executionOrder,
    actor,
  });

  let status: ExecutionStatus;
  switch (runtimeRun.status) {
    case "completed":
      status = "completed";
      break;
    case "partial":
      status = "partial";
      break;
    case "failed":
      status = "failed";
      break;
    default:
      status = "failed";
  }

  const result: ScenarioExecutionResult = {
    executionId: plan.executionId,
    scenarioId: scenario.scenarioId,
    scenarioType: scenario.type,
    domain: scenario.domain,
    status,
    mode: "execute",
    jobs: plan.jobs,
    jobResults: runtimeRun.jobs,
    blockedReasons: [],
    actor,
    summary: {
      totalJobs: runtimeRun.totalJobs,
      completedJobs: runtimeRun.completedJobs,
      failedJobs: runtimeRun.failedJobs,
      skippedJobs: runtimeRun.skippedJobs,
    },
    startedAt: runtimeRun.startedAt,
    completedAt: runtimeRun.completedAt,
  };

  addToHistory(result);
  return result;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildScenarioExecutionReport(): ScenarioExecutionReport {
  const history = getHistory();
  const completedCount = history.filter((r) => r.status === "completed").length;
  const partialCount = history.filter((r) => r.status === "partial").length;
  const failedCount = history.filter((r) => r.status === "failed").length;
  const blockedCount = history.filter((r) => r.status === "blocked").length;

  return {
    recentExecutions: history,
    summary: {
      totalExecutions: history.length,
      completedCount,
      partialCount,
      failedCount,
      blockedCount,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Scenario lookup helpers
// ---------------------------------------------------------------------------

export function findScenarioById(
  scenarioId: string,
  overrides?: Partial<BridgeInputs>,
): FactoryScenario | null {
  const report = overrides?.scenarioReport ?? buildScenarioReport();
  const all = [
    ...report.expansionScenarios,
    ...report.gapFillScenarios,
    ...report.stabilizationScenarios,
  ];
  return all.find((s) => s.scenarioId === scenarioId) ?? null;
}

export function listAvailableScenarios(
  overrides?: Partial<BridgeInputs>,
): Array<{ scenarioId: string; type: string; domain: string; priorityScore: number; stepCount: number }> {
  const report = overrides?.scenarioReport ?? buildScenarioReport();
  const all = [
    ...report.expansionScenarios,
    ...report.gapFillScenarios,
    ...report.stabilizationScenarios,
  ];
  return all.map((s) => ({
    scenarioId: s.scenarioId,
    type: s.type,
    domain: s.domain,
    priorityScore: s.priorityScore,
    stepCount: s.steps.length,
  }));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatExecutionPlan(plan: ScenarioExecutionPlan): string {
  const lines: string[] = [];
  lines.push(`=== Execution Plan: ${plan.executionId} ===`);
  lines.push(`Scenario: ${plan.scenarioId} (${plan.scenarioType})`);
  lines.push(`Domain: ${plan.domain}`);
  lines.push(`Actor: ${plan.actor.actorId} (${plan.actor.role})`);
  lines.push(`Jobs: ${plan.totalJobs}`);
  lines.push(`Order: ${plan.executionOrder.join(" → ")}`);
  lines.push("");
  for (const job of plan.jobs) {
    lines.push(`  [${job.sourceStepIndex}] ${job.sourceStepType} → ${job.orchestrationJobId}`);
    lines.push(`      ${job.description}`);
    if (job.parentTemplateId) lines.push(`      Parent: ${job.parentTemplateId}`);
    if (job.targetTemplateId) lines.push(`      Target: ${job.targetTemplateId}`);
  }
  return lines.join("\n");
}

export function formatExecutionResult(result: ScenarioExecutionResult): string {
  const lines: string[] = [];
  lines.push(`=== Execution Result: ${result.executionId} ===`);
  lines.push(`Scenario: ${result.scenarioId} (${result.scenarioType})`);
  lines.push(`Domain: ${result.domain}`);
  lines.push(`Status: ${result.status.toUpperCase()}`);
  lines.push(`Mode: ${result.mode}`);
  lines.push(`Actor: ${result.actor.actorId} (${result.actor.role})`);
  lines.push(`Jobs: ${result.summary.totalJobs} (completed: ${result.summary.completedJobs}, failed: ${result.summary.failedJobs}, skipped: ${result.summary.skippedJobs})`);
  if (result.blockedReasons.length > 0) {
    lines.push("Blocked:");
    for (const reason of result.blockedReasons) {
      lines.push(`  - ${reason}`);
    }
  }
  return lines.join("\n");
}

export function formatExecutionReport(report: ScenarioExecutionReport): string {
  const lines: string[] = [];
  lines.push("=== Scenario Execution Report ===");
  lines.push(`Total: ${report.summary.totalExecutions}`);
  lines.push(`Completed: ${report.summary.completedCount}, Partial: ${report.summary.partialCount}, Failed: ${report.summary.failedCount}, Blocked: ${report.summary.blockedCount}`);
  lines.push("");
  for (const exec of report.recentExecutions) {
    lines.push(formatExecutionResult(exec));
    lines.push("");
  }
  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
