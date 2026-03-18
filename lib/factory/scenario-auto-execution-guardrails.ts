/**
 * Scenario Auto-Execution Guardrails v1
 *
 * Provides:
 *   1. Deterministic auto-execution eligibility evaluation
 *   2. Hard block conditions (blocks auto execution completely)
 *   3. Manual-only scenarios (valid but require manual execution)
 *   4. auto_executable decision only when ALL conditions met
 *   5. Explainable decision records with detailed reasons
 *   6. Integration with review workflow, governance, and runtime execution
 *
 * Does NOT auto-execute scenarios.
 * Does NOT bypass review workflow, governance, or role authorization.
 * v1 is guardrail evaluation + enforcement only.
 */

import {
  getReviewWorkflow,
  initializeAllReviewWorkflows,
  listReviewWorkflows,
  type ReviewWorkflowRecord,
  type WorkflowInputs,
} from "./strategic-review-workflow";
import {
  buildStrategicReviewBoard,
  type ReviewItem,
  type ReviewBoardInputs,
} from "./strategic-change-review-board";
import {
  evaluateScenarioExecutionGovernance,
  type GovernanceInputs,
  type GovernanceEvaluation,
} from "./scenario-execution-governance";
import {
  buildScenarioReport,
  type FactoryScenario,
  type ScenarioReport,
} from "./factory-scenario-planner";
import {
  findScenarioById,
  type BridgeInputs,
} from "./scenario-execution-bridge";
import {
  isBlockedByRereview,
  useInMemoryStore as useWorkflowV3Store,
  clearInMemoryStore as clearWorkflowV3Store,
} from "./strategic-review-workflow-v3";
import {
  canPerformFactoryAction,
  type FactoryActor,
} from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutionMode = "auto_executable" | "manual_only" | "blocked";

export interface ScenarioAutoExecutionGuardrailDecision {
  guardrailId: string;
  scenarioId: string;
  executionMode: ExecutionMode;
  allowed: boolean; // true if auto_executable or manual_only
  blocked: boolean; // true if blocked
  reasons: string[];
  evaluatedAt: string;
}

export interface ScenarioAutoExecutionGuardrailsReport {
  evaluations: ScenarioAutoExecutionGuardrailDecision[];
  autoExecutableItems: ScenarioAutoExecutionGuardrailDecision[];
  manualOnlyItems: ScenarioAutoExecutionGuardrailDecision[];
  blockedItems: ScenarioAutoExecutionGuardrailDecision[];
  summary: {
    totalEvaluated: number;
    autoExecutableCount: number;
    manualOnlyCount: number;
    blockedCount: number;
  };
  generatedAt: string;
}

export interface GuardrailInputs {
  reviewBoardInputs: Partial<ReviewBoardInputs>;
  workflowInputs: Partial<WorkflowInputs>;
  governanceInputs: Partial<GovernanceInputs>;
  bridgeInputs: Partial<BridgeInputs>;
  scenarioReport: ScenarioReport;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface GuardrailMemoryState {
  evaluations: ScenarioAutoExecutionGuardrailDecision[];
}

let memoryState: GuardrailMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<GuardrailMemoryState>): void {
  memoryState = {
    evaluations: initial?.evaluations ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getEvaluations(): ScenarioAutoExecutionGuardrailDecision[] {
  return memoryState?.evaluations ?? [];
}

function storeEvaluation(evaluation: ScenarioAutoExecutionGuardrailDecision): void {
  if (!memoryState) return;
  const idx = memoryState.evaluations.findIndex(
    (e) => e.scenarioId === evaluation.scenarioId,
  );
  if (idx >= 0) {
    memoryState.evaluations[idx] = evaluation;
  } else {
    memoryState.evaluations.push(evaluation);
  }
}

// ---------------------------------------------------------------------------
// Hard block evaluation
// ---------------------------------------------------------------------------

interface HardBlockResult {
  blocked: boolean;
  reasons: string[];
}

function evaluateHardBlocks(
  scenario: FactoryScenario,
  reviewItem: ReviewItem | undefined,
  workflow: ReviewWorkflowRecord | undefined,
  governance: GovernanceEvaluation,
  overrides?: Partial<GuardrailInputs>,
): HardBlockResult {
  const reasons: string[] = [];
  let blocked = false;

  // 1. Review workflow not approved_for_execution
  if (workflow) {
    if (workflow.currentState !== "approved_for_execution") {
      reasons.push(`Review workflow state is ${workflow.currentState}, not approved_for_execution`);
      blocked = true;
    }
  } else {
    reasons.push("Review workflow not found");
    blocked = true;
  }

  // 2. Scenario governance blocked
  if (governance.executionReadiness === "blocked") {
    reasons.push("Scenario governance execution readiness is blocked");
    blocked = true;
  }

  // 3. rereviewRequired flag
  if (reviewItem && workflow) {
    useWorkflowV3Store();
    if (isBlockedByRereview(reviewItem.reviewId)) {
      reasons.push("Review is blocked by rereview requirement");
      blocked = true;
    }
    clearWorkflowV3Store();
  }

  // 4. High risk
  if (governance.riskLevel === "high") {
    reasons.push("Scenario has high risk level");
    blocked = true;
  }

  // 5. Elevated approval requirement
  if (governance.approvalRequirement === "elevated") {
    reasons.push("Governance requires elevated approval");
    blocked = true;
  }

  // 6. Prod-targeting release step
  const hasProdRelease = scenario.steps.some(
    (s) => s.stepType === "release" && (s.targetStage === "production" || s.targetStage?.includes("prod")),
  );
  if (hasProdRelease) {
    reasons.push("Scenario includes production release step");
    blocked = true;
  }

  // 7. Publish step (marketplace) — in v1 this is manual_only, not hard block
  // Hard block only if there's an explicit forced-publish flag
  // Normal publish steps are handled in manual_only evaluation

  // 8. Invalid runtime execution plan (check if scenario has steps)
  if (scenario.steps.length === 0) {
    reasons.push("Scenario has no execution steps");
    blocked = true;
  }

  // 9. Missing critical scenario dependencies
  if (!scenario.domain || scenario.targetTemplateCount === 0) {
    reasons.push("Scenario missing critical dependencies (domain or template targets)");
    blocked = true;
  }

  return { blocked, reasons };
}

// ---------------------------------------------------------------------------
// Auto-executable eligibility evaluation
// ---------------------------------------------------------------------------

interface AutoExecutableResult {
  eligible: boolean;
  reasons: string[];
}

function evaluateAutoExecutable(
  scenario: FactoryScenario,
  reviewItem: ReviewItem | undefined,
  workflow: ReviewWorkflowRecord | undefined,
  governance: GovernanceEvaluation,
  actor: FactoryActor,
  hardBlocks: HardBlockResult,
  overrides?: Partial<GuardrailInputs>,
): AutoExecutableResult {
  const reasons: string[] = [];
  let eligible = true;

  // Hard blocks prevent auto-executable
  if (hardBlocks.blocked) {
    eligible = false;
    return { eligible, reasons: [...hardBlocks.reasons] };
  }

  // 1. Review workflow state = approved_for_execution
  if (!workflow || workflow.currentState !== "approved_for_execution") {
    reasons.push("Review workflow not in approved_for_execution state");
    eligible = false;
  } else {
    reasons.push("Review workflow state: approved_for_execution");
  }

  // 2. Scenario governance status = approved_for_execution
  if (governance.status !== "approved_for_execution") {
    reasons.push(`Governance status is ${governance.status}, not approved_for_execution`);
    eligible = false;
  } else {
    reasons.push("Governance status: approved_for_execution");
  }

  // 3. Risk = low
  if (governance.riskLevel !== "low") {
    reasons.push(`Risk level is ${governance.riskLevel}, not low`);
    eligible = false;
  } else {
    reasons.push("Risk level: low");
  }

  // 4. approvalRequirement != elevated
  if (governance.approvalRequirement === "elevated") {
    reasons.push("Governance requires elevated approval");
    eligible = false;
  } else {
    reasons.push(`Approval requirement: ${governance.approvalRequirement}`);
  }

  // 5. No blocked/caution governance state
  if (governance.executionReadiness === "blocked" || governance.executionReadiness === "caution") {
    reasons.push(`Governance execution readiness is ${governance.executionReadiness}`);
    eligible = false;
  } else {
    reasons.push("Governance execution readiness: allowed");
  }

  // 6. No rereviewRequired flag
  if (reviewItem) {
    useWorkflowV3Store();
    if (isBlockedByRereview(reviewItem.reviewId)) {
      reasons.push("Review is blocked by rereview requirement");
      eligible = false;
    } else {
      reasons.push("No rereview requirement blocking");
    }
    clearWorkflowV3Store();
  } else {
    reasons.push("No rereview requirement blocking");
  }

  // 7. No prod-targeting release step (already checked in hard blocks)
  const hasProdRelease = scenario.steps.some(
    (s) => s.stepType === "release" && (s.targetStage === "production" || s.targetStage?.includes("prod")),
  );
  if (hasProdRelease) {
    reasons.push("Scenario includes production release step");
    eligible = false;
  }

  // 8. No publish step (already checked in hard blocks)
  const hasPublish = scenario.steps.some((s) => s.stepType === "publish");
  if (hasPublish) {
    reasons.push("Scenario includes marketplace publish step");
    eligible = false;
  }

  // 9. Runtime execution dependencies valid (all steps present)
  if (scenario.steps.length === 0) {
    reasons.push("Scenario has no execution steps");
    eligible = false;
  } else {
    reasons.push("Runtime execution plan valid");
  }

  // 10. Actor/role policy allows auto-execution
  if (!canPerformFactoryAction(actor, "orchestration.run")) {
    reasons.push(`Actor role ${actor.role} is not authorized for execution`);
    eligible = false;
  } else {
    reasons.push(`Actor role ${actor.role} authorized for execution`);
  }

  if (eligible) {
    reasons.push("All auto-execution criteria met");
  }

  return { eligible, reasons };
}

// ---------------------------------------------------------------------------
// Manual-only evaluation
// ---------------------------------------------------------------------------

function isManualOnly(
  scenario: FactoryScenario,
  governance: GovernanceEvaluation,
): boolean {
  // Scenarios that are valid but contain sensitive operations
  const hasSensitiveSteps =
    scenario.steps.some((s) => s.stepType === "release") ||
    scenario.steps.some((s) => s.stepType === "publish") ||
    scenario.steps.length > 3; // Multi-step domain expansion

  // Caution readiness or medium risk
  const requiresManualAttention =
    governance.executionReadiness === "caution" ||
    governance.riskLevel === "medium" ||
    governance.approvalRequirement === "standard";

  return hasSensitiveSteps || requiresManualAttention;
}

// ---------------------------------------------------------------------------
// Single evaluation
// ---------------------------------------------------------------------------

export function evaluateScenarioAutoExecutionGuardrails(
  scenarioId: string,
  actor: FactoryActor,
  overrides?: Partial<GuardrailInputs>,
): ScenarioAutoExecutionGuardrailDecision {
  const now = new Date().toISOString();

  // Get scenario
  const scenarioReport = overrides?.scenarioReport ?? buildScenarioReport();
  const allScenarios = [
    ...scenarioReport.expansionScenarios,
    ...scenarioReport.gapFillScenarios,
    ...scenarioReport.stabilizationScenarios,
  ];
  const scenario = allScenarios.find((s) => s.scenarioId === scenarioId);

  if (!scenario) {
    const decision: ScenarioAutoExecutionGuardrailDecision = {
      guardrailId: `guardrail-${scenarioId}`,
      scenarioId,
      executionMode: "blocked",
      allowed: false,
      blocked: true,
      reasons: [`Scenario not found: ${scenarioId}`],
      evaluatedAt: now,
    };
    storeEvaluation(decision);
    return decision;
  }

  // Get review item
  const reviewItems = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  const reviewItem = reviewItems.find((r) => r.linkedArtifacts.scenarioId === scenarioId);

  // Get workflow
  const workflow = reviewItem ? (getReviewWorkflow(reviewItem.reviewId) ?? undefined) : undefined;

  // Get governance
  const governance = evaluateScenarioExecutionGovernance(scenarioId, overrides?.governanceInputs);

  // Evaluate hard blocks
  const hardBlocks = evaluateHardBlocks(scenario, reviewItem, workflow, governance, overrides);

  // Determine execution mode
  let executionMode: ExecutionMode;
  let allowed: boolean;
  let blocked: boolean;
  let reasons: string[] = [];

  if (hardBlocks.blocked) {
    executionMode = "blocked";
    allowed = false;
    blocked = true;
    reasons = hardBlocks.reasons;
  } else {
    // Check auto-executable
    const autoExecCheck = evaluateAutoExecutable(
      scenario,
      reviewItem,
      workflow,
      governance,
      actor,
      hardBlocks,
      overrides,
    );

    if (autoExecCheck.eligible) {
      executionMode = "auto_executable";
      allowed = true;
      blocked = false;
      reasons = autoExecCheck.reasons;
    } else {
      // v1: when hard blocks don't apply but auto-execution criteria aren't met,
      // default to manual_only (conservative approach)
      executionMode = "manual_only";
      allowed = true;
      blocked = false;
      reasons = [...autoExecCheck.reasons, "Scenario valid for manual execution"];
    }
  }

  const decision: ScenarioAutoExecutionGuardrailDecision = {
    guardrailId: `guardrail-${scenarioId}`,
    scenarioId,
    executionMode,
    allowed,
    blocked,
    reasons,
    evaluatedAt: now,
  };

  storeEvaluation(decision);
  return decision;
}

// ---------------------------------------------------------------------------
// Batch evaluation
// ---------------------------------------------------------------------------

export function evaluateAllScenarioAutoExecutionGuardrails(
  actor: FactoryActor,
  overrides?: Partial<GuardrailInputs>,
): ScenarioAutoExecutionGuardrailDecision[] {
  // Ensure workflows exist
  initializeAllReviewWorkflows(overrides?.workflowInputs);

  // Ensure workflow V3 ops records exist
  useWorkflowV3Store();

  const scenarioReport = overrides?.scenarioReport ?? buildScenarioReport();
  const allScenarios = [
    ...scenarioReport.expansionScenarios,
    ...scenarioReport.gapFillScenarios,
    ...scenarioReport.stabilizationScenarios,
  ];

  const results = allScenarios.map((scenario) =>
    evaluateScenarioAutoExecutionGuardrails(scenario.scenarioId, actor, overrides),
  );

  clearWorkflowV3Store();
  return results;
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

export function enforceScenarioExecutionGuardrails(
  scenarioId: string,
  actor: FactoryActor,
  overrides?: Partial<GuardrailInputs>,
): { allowed: boolean; reason: string; decision: ScenarioAutoExecutionGuardrailDecision } {
  const decision = evaluateScenarioAutoExecutionGuardrails(scenarioId, actor, overrides);

  if (decision.blocked) {
    return {
      allowed: false,
      reason: `Scenario execution is blocked: ${decision.reasons.join("; ")}`,
      decision,
    };
  }

  if (decision.executionMode === "auto_executable") {
    return {
      allowed: true,
      reason: "Scenario is cleared for auto-execution",
      decision,
    };
  }

  if (decision.executionMode === "manual_only") {
    return {
      allowed: true,
      reason: "Scenario is cleared for manual execution only",
      decision,
    };
  }

  return {
    allowed: false,
    reason: "Unknown execution mode",
    decision,
  };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function listScenarioAutoExecutionGuardrails(): ScenarioAutoExecutionGuardrailDecision[] {
  return [...getEvaluations()];
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildScenarioAutoExecutionGuardrailReport(
  actor: FactoryActor,
  overrides?: Partial<GuardrailInputs>,
): ScenarioAutoExecutionGuardrailsReport {
  // Ensure we have evaluations
  if (getEvaluations().length === 0) {
    evaluateAllScenarioAutoExecutionGuardrails(actor, overrides);
  }

  const evaluations = getEvaluations();
  const autoExecutableItems = evaluations.filter((e) => e.executionMode === "auto_executable");
  const manualOnlyItems = evaluations.filter((e) => e.executionMode === "manual_only");
  const blockedItems = evaluations.filter((e) => e.executionMode === "blocked");

  return {
    evaluations,
    autoExecutableItems,
    manualOnlyItems,
    blockedItems,
    summary: {
      totalEvaluated: evaluations.length,
      autoExecutableCount: autoExecutableItems.length,
      manualOnlyCount: manualOnlyItems.length,
      blockedCount: blockedItems.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatGuardrailDecision(d: ScenarioAutoExecutionGuardrailDecision): string {
  const modeTag =
    d.executionMode === "auto_executable" ? "[AUTO_EXECUTABLE]" :
    d.executionMode === "manual_only" ? "[MANUAL_ONLY]" :
    "[BLOCKED]";

  const lines: string[] = [];
  lines.push(`${modeTag} ${d.scenarioId}`);
  lines.push(`  Allowed: ${d.allowed} | Blocked: ${d.blocked}`);
  for (const reason of d.reasons.slice(0, 5)) {
    lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}

export function formatGuardrailReport(report: ScenarioAutoExecutionGuardrailsReport): string {
  const lines: string[] = [];

  lines.push("=== Scenario Auto-Execution Guardrails Report ===");
  lines.push(
    `Total: ${report.summary.totalEvaluated} | ` +
    `Auto-Executable: ${report.summary.autoExecutableCount} | ` +
    `Manual-Only: ${report.summary.manualOnlyCount} | ` +
    `Blocked: ${report.summary.blockedCount}`,
  );
  lines.push("");

  if (report.autoExecutableItems.length > 0) {
    lines.push("── Auto-Executable ──");
    for (const d of report.autoExecutableItems) {
      lines.push(formatGuardrailDecision(d));
      lines.push("");
    }
  }

  if (report.manualOnlyItems.length > 0) {
    lines.push("── Manual-Only ──");
    for (const d of report.manualOnlyItems) {
      lines.push(formatGuardrailDecision(d));
      lines.push("");
    }
  }

  if (report.blockedItems.length > 0) {
    lines.push("── Blocked ──");
    for (const d of report.blockedItems) {
      lines.push(formatGuardrailDecision(d));
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
