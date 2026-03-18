/**
 * Scenario Execution Governance v1
 *
 * Provides:
 *   1. Governance evaluation for scenario execution
 *   2. Approval requirement determination (none / standard / elevated)
 *   3. Explicit decision recording (approve / defer / reject)
 *   4. Role-based authorization enforcement
 *   5. Audit trail for governance decisions
 *
 * Governance + approval gating only. Does NOT execute scenarios.
 * Does NOT auto-approve. Does NOT bypass review board signals.
 */

import {
  buildStrategicReviewBoard,
  type ReviewItem,
  type ReviewReadiness,
  type ReviewRisk,
  type ReviewBoardInputs,
} from "./strategic-change-review-board";
import {
  findScenarioById,
  type BridgeInputs,
} from "./scenario-execution-bridge";
import {
  buildScenarioReport,
  type FactoryScenario,
  type ScenarioReport,
} from "./factory-scenario-planner";
import {
  canPerformFactoryAction,
  type FactoryActor,
} from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExecutionReadiness = "allowed" | "caution" | "blocked";

export type ApprovalRequirement = "none" | "standard" | "elevated";

export type GovernanceStatus =
  | "pending_review"
  | "approved_for_execution"
  | "deferred_for_execution"
  | "blocked_from_execution";

export type GovernanceDecisionAction =
  | "approve_execution"
  | "defer_execution"
  | "reject_execution";

export interface GovernanceEvaluation {
  governanceId: string;
  scenarioId: string;
  executionReadiness: ExecutionReadiness;
  approvalRequirement: ApprovalRequirement;
  riskLevel: ReviewRisk;
  status: GovernanceStatus;
  reasons: string[];
  linkedReviewId: string | null;
}

export interface GovernanceDecisionRecord {
  decisionId: string;
  governanceId: string;
  scenarioId: string;
  action: GovernanceDecisionAction;
  actor: FactoryActor;
  reasons: string[];
  timestamp: string;
}

export interface GovernanceReport {
  evaluations: GovernanceEvaluation[];
  decisions: GovernanceDecisionRecord[];
  allowedItems: GovernanceEvaluation[];
  cautionItems: GovernanceEvaluation[];
  blockedItems: GovernanceEvaluation[];
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
}

export interface GovernanceInputs {
  reviewBoardInputs: Partial<ReviewBoardInputs>;
  bridgeInputs: Partial<BridgeInputs>;
  scenarioReport: ScenarioReport;
}

// ---------------------------------------------------------------------------
// In-memory store (test isolation + local artifact storage)
// ---------------------------------------------------------------------------

interface GovernanceMemoryState {
  evaluations: GovernanceEvaluation[];
  decisions: GovernanceDecisionRecord[];
}

let memoryState: GovernanceMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<GovernanceMemoryState>): void {
  memoryState = {
    evaluations: initial?.evaluations ?? [],
    decisions: initial?.decisions ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getEvaluations(): GovernanceEvaluation[] {
  return memoryState?.evaluations ?? [];
}

function getDecisions(): GovernanceDecisionRecord[] {
  return memoryState?.decisions ?? [];
}

function storeEvaluation(evaluation: GovernanceEvaluation): void {
  if (memoryState) {
    // Replace existing evaluation for same scenarioId
    const idx = memoryState.evaluations.findIndex(
      (e) => e.scenarioId === evaluation.scenarioId,
    );
    if (idx >= 0) {
      memoryState.evaluations[idx] = evaluation;
    } else {
      memoryState.evaluations.push(evaluation);
    }
  }
}

function storeDecision(decision: GovernanceDecisionRecord): void {
  if (memoryState) {
    memoryState.decisions.push(decision);
  }
}

// ---------------------------------------------------------------------------
// Readiness mapping from review board
// ---------------------------------------------------------------------------

function mapReviewToReadiness(
  readiness: ReviewReadiness,
  risk: ReviewRisk,
): ExecutionReadiness {
  if (readiness === "blocked") return "blocked";
  if (readiness === "caution") return "caution";
  // readiness === "ready"
  if (risk === "high") return "caution";
  if (risk === "medium") return "caution";
  return "allowed";
}

// ---------------------------------------------------------------------------
// Approval requirement
// ---------------------------------------------------------------------------

export function determineApprovalRequirement(
  readiness: ExecutionReadiness,
  risk: ReviewRisk,
  scenario: FactoryScenario,
): ApprovalRequirement {
  // Blocked scenarios cannot be approved
  if (readiness === "blocked") return "elevated";

  // Check for prod-adjacent steps
  const hasReleaseOrPublish = scenario.steps.some(
    (s) => s.stepType === "release" || s.stepType === "publish",
  );

  // Elevated: high risk, or medium risk with release/publish
  if (risk === "high") return "elevated";
  if (risk === "medium" && hasReleaseOrPublish) return "elevated";
  if (readiness === "caution") return "elevated";

  // Standard: normal executable scenarios
  if (hasReleaseOrPublish) return "standard";

  return "standard";
}

// ---------------------------------------------------------------------------
// Governance status from evaluation + decisions
// ---------------------------------------------------------------------------

function resolveStatus(
  readiness: ExecutionReadiness,
  scenarioId: string,
): GovernanceStatus {
  if (readiness === "blocked") return "blocked_from_execution";

  // Check for existing decision
  const decisions = getDecisions();
  const latestDecision = decisions
    .filter((d) => d.scenarioId === scenarioId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

  if (!latestDecision) return "pending_review";

  switch (latestDecision.action) {
    case "approve_execution":
      return "approved_for_execution";
    case "defer_execution":
      return "deferred_for_execution";
    case "reject_execution":
      return "blocked_from_execution";
    default:
      return "pending_review";
  }
}

// ---------------------------------------------------------------------------
// Evaluate scenario execution governance
// ---------------------------------------------------------------------------

export function evaluateScenarioExecutionGovernance(
  scenarioId: string,
  overrides?: Partial<GovernanceInputs>,
): GovernanceEvaluation {
  // Get review board items
  const reviewItems = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  const reviewItem = reviewItems.find(
    (r) => r.linkedArtifacts.scenarioId === scenarioId,
  );

  // Get scenario
  const scenarioReport = overrides?.scenarioReport ?? buildScenarioReport();
  const allScenarios = [
    ...scenarioReport.expansionScenarios,
    ...scenarioReport.gapFillScenarios,
    ...scenarioReport.stabilizationScenarios,
  ];
  const scenario = allScenarios.find((s) => s.scenarioId === scenarioId);

  const reasons: string[] = [];

  if (!scenario) {
    return {
      governanceId: `gov-${scenarioId}`,
      scenarioId,
      executionReadiness: "blocked",
      approvalRequirement: "elevated",
      riskLevel: "high",
      status: "blocked_from_execution",
      reasons: [`Scenario not found: ${scenarioId}`],
      linkedReviewId: null,
    };
  }

  // Derive readiness and risk from review board if available
  let readiness: ReviewReadiness;
  let risk: ReviewRisk;

  if (reviewItem) {
    readiness = reviewItem.readiness;
    risk = reviewItem.risk;
    reasons.push(`Review board readiness: ${readiness}`);
    reasons.push(`Review board risk: ${risk}`);
    if (reviewItem.recommendedDecision) {
      reasons.push(`Review recommended: ${reviewItem.recommendedDecision}`);
    }
  } else {
    // No review item → treat as caution
    readiness = "caution";
    risk = "medium";
    reasons.push("No review board item found for scenario");
  }

  const executionReadiness = mapReviewToReadiness(readiness, risk);
  const approvalRequirement = determineApprovalRequirement(executionReadiness, risk, scenario);
  const status = resolveStatus(executionReadiness, scenarioId);

  // Add scenario-level reasons
  reasons.push(`Scenario type: ${scenario.type}`);
  reasons.push(`Priority: ${scenario.priorityScore.toFixed(2)}`);
  reasons.push(`Steps: ${scenario.steps.length}`);

  if (scenario.steps.some((s) => s.stepType === "release" || s.stepType === "publish")) {
    reasons.push("Scenario includes release/publish steps");
  }

  if (executionReadiness === "allowed") {
    reasons.push("Scenario execution is allowed");
  } else if (executionReadiness === "blocked") {
    reasons.push("Scenario execution is blocked");
  } else {
    reasons.push("Scenario requires elevated approval");
  }

  const evaluation: GovernanceEvaluation = {
    governanceId: `gov-${scenarioId}`,
    scenarioId,
    executionReadiness,
    approvalRequirement,
    riskLevel: risk,
    status,
    reasons,
    linkedReviewId: reviewItem?.reviewId ?? null,
  };

  storeEvaluation(evaluation);
  return evaluation;
}

// ---------------------------------------------------------------------------
// Batch evaluation
// ---------------------------------------------------------------------------

export function evaluateAllScenarioGovernance(
  overrides?: Partial<GovernanceInputs>,
): GovernanceEvaluation[] {
  const scenarioReport = overrides?.scenarioReport ?? buildScenarioReport();
  const allScenarios = [
    ...scenarioReport.expansionScenarios,
    ...scenarioReport.gapFillScenarios,
    ...scenarioReport.stabilizationScenarios,
  ];

  return allScenarios.map((s) =>
    evaluateScenarioExecutionGovernance(s.scenarioId, overrides),
  );
}

// ---------------------------------------------------------------------------
// Decision recording
// ---------------------------------------------------------------------------

const DECISION_ACTIONS: Record<GovernanceDecisionAction, string> = {
  approve_execution: "orchestration.run",
  defer_execution: "proposal.defer",
  reject_execution: "proposal.reject",
};

export function recordScenarioExecutionDecision(
  scenarioId: string,
  action: GovernanceDecisionAction,
  actor: FactoryActor,
  reasons?: string[],
): GovernanceDecisionRecord | null {
  // Role authorization check
  const requiredAction = DECISION_ACTIONS[action];
  if (!canPerformFactoryAction(actor, requiredAction as any)) {
    return null;
  }

  // Specific role restrictions
  if (action === "approve_execution" && actor.role !== "owner" && actor.role !== "admin") {
    return null;
  }

  const decision: GovernanceDecisionRecord = {
    decisionId: `decision-${scenarioId}-${Date.now()}`,
    governanceId: `gov-${scenarioId}`,
    scenarioId,
    action,
    actor,
    reasons: reasons ?? [`${action} by ${actor.actorId} (${actor.role})`],
    timestamp: new Date().toISOString(),
  };

  storeDecision(decision);
  return decision;
}

// ---------------------------------------------------------------------------
// Execution gate check (for bridge integration)
// ---------------------------------------------------------------------------

export function checkExecutionGovernance(
  scenarioId: string,
  actor: FactoryActor,
  overrides?: Partial<GovernanceInputs>,
): {
  allowed: boolean;
  reason: string;
  governance: GovernanceEvaluation;
} {
  const governance = evaluateScenarioExecutionGovernance(scenarioId, overrides);

  // Blocked scenarios cannot execute
  if (governance.executionReadiness === "blocked") {
    return {
      allowed: false,
      reason: "Scenario is blocked from execution",
      governance,
    };
  }

  // Check for explicit approval when required
  if (governance.approvalRequirement !== "none") {
    const decisions = getDecisions().filter((d) => d.scenarioId === scenarioId);
    const latestDecision = decisions.sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp),
    )[0];

    if (!latestDecision || latestDecision.action !== "approve_execution") {
      return {
        allowed: false,
        reason: `Scenario requires ${governance.approvalRequirement} approval before execution`,
        governance,
      };
    }
  }

  // Role authorization
  if (!canPerformFactoryAction(actor, "orchestration.run")) {
    return {
      allowed: false,
      reason: "Actor is not authorized to execute scenarios",
      governance,
    };
  }

  return {
    allowed: true,
    reason: "Scenario execution is permitted",
    governance,
  };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function listScenarioExecutionGovernanceHistory(): {
  evaluations: GovernanceEvaluation[];
  decisions: GovernanceDecisionRecord[];
} {
  return {
    evaluations: getEvaluations(),
    decisions: getDecisions(),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildScenarioExecutionGovernanceReport(
  overrides?: Partial<GovernanceInputs>,
): GovernanceReport {
  const evaluations = evaluateAllScenarioGovernance(overrides);
  const decisions = getDecisions();

  const allowedItems = evaluations.filter((e) => e.executionReadiness === "allowed");
  const cautionItems = evaluations.filter((e) => e.executionReadiness === "caution");
  const blockedItems = evaluations.filter((e) => e.executionReadiness === "blocked");

  const approvedCount = evaluations.filter((e) => e.status === "approved_for_execution").length;
  const deferredCount = evaluations.filter((e) => e.status === "deferred_for_execution").length;
  const rejectedCount = evaluations.filter((e) => e.status === "blocked_from_execution").length;
  const pendingCount = evaluations.filter((e) => e.status === "pending_review").length;

  return {
    evaluations,
    decisions,
    allowedItems,
    cautionItems,
    blockedItems,
    summary: {
      totalEvaluations: evaluations.length,
      allowedCount: allowedItems.length,
      cautionCount: cautionItems.length,
      blockedCount: blockedItems.length,
      approvedCount,
      deferredCount,
      rejectedCount,
      pendingCount,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const READINESS_ICONS: Record<ExecutionReadiness, string> = {
  allowed: "[ALLOWED]",
  caution: "[CAUTION]",
  blocked: "[BLOCKED]",
};

const STATUS_LABELS: Record<GovernanceStatus, string> = {
  pending_review: "Pending Review",
  approved_for_execution: "Approved",
  deferred_for_execution: "Deferred",
  blocked_from_execution: "Blocked",
};

export function formatGovernanceEvaluation(eval_: GovernanceEvaluation): string {
  const lines: string[] = [];
  lines.push(`${READINESS_ICONS[eval_.executionReadiness]} ${eval_.scenarioId}`);
  lines.push(`  Approval: ${eval_.approvalRequirement} | Risk: ${eval_.riskLevel} | Status: ${STATUS_LABELS[eval_.status]}`);
  for (const reason of eval_.reasons.slice(0, 4)) {
    lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}

export function formatGovernanceReport(report: GovernanceReport): string {
  const lines: string[] = [];

  lines.push("=== Scenario Execution Governance Report ===");
  lines.push(`Total: ${report.summary.totalEvaluations} | Allowed: ${report.summary.allowedCount} | Caution: ${report.summary.cautionCount} | Blocked: ${report.summary.blockedCount}`);
  lines.push(`Approved: ${report.summary.approvedCount} | Deferred: ${report.summary.deferredCount} | Rejected: ${report.summary.rejectedCount} | Pending: ${report.summary.pendingCount}`);
  lines.push("");

  if (report.allowedItems.length > 0) {
    lines.push("── Allowed ──");
    for (const item of report.allowedItems) {
      lines.push(formatGovernanceEvaluation(item));
      lines.push("");
    }
  }

  if (report.cautionItems.length > 0) {
    lines.push("── Caution / Elevated Approval ──");
    for (const item of report.cautionItems) {
      lines.push(formatGovernanceEvaluation(item));
      lines.push("");
    }
  }

  if (report.blockedItems.length > 0) {
    lines.push("── Blocked ──");
    for (const item of report.blockedItems) {
      lines.push(formatGovernanceEvaluation(item));
      lines.push("");
    }
  }

  if (report.decisions.length > 0) {
    lines.push("── Decision History ──");
    for (const d of report.decisions) {
      lines.push(`  ${d.action} — ${d.scenarioId} by ${d.actor.actorId} (${d.actor.role}) at ${d.timestamp}`);
    }
    lines.push("");
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
