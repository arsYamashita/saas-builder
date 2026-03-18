/**
 * Scenario Auto-Promotion Rules v1
 *
 * Provides:
 *   1. Deterministic eligibility evaluation for auto-promotion
 *   2. Conservative advancement: in_review → approved_candidate only
 *   3. Explainable decision records with reasons
 *   4. Apply mode using existing workflow transition logic
 *   5. Full audit trail
 *
 * Does NOT auto-promote to approved_for_execution.
 * Does NOT auto-execute scenarios.
 * Does NOT bypass governance or workflow validation.
 */

import {
  buildStrategicReviewBoard,
  type ReviewItem,
  type ReviewBoardInputs,
} from "./strategic-change-review-board";
import {
  getReviewWorkflow,
  initializeAllReviewWorkflows,
  listReviewWorkflows,
  transitionReviewWorkflow,
  type ReviewWorkflowRecord,
  type WorkflowInputs,
} from "./strategic-review-workflow";
import {
  evaluateScenarioExecutionGovernance,
  type GovernanceInputs,
} from "./scenario-execution-governance";
import {
  type FactoryActor,
} from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AutoPromotionDecision = "auto_promote" | "no_action";

export interface AutoPromotionResult {
  autoPromotionId: string;
  reviewId: string;
  scenarioId: string;
  eligible: boolean;
  fromState: string;
  toState: string;
  decision: AutoPromotionDecision;
  reasons: string[];
  applied: boolean;
  evaluatedAt: string;
}

export interface AutoPromotionReport {
  evaluations: AutoPromotionResult[];
  eligibleItems: AutoPromotionResult[];
  promotedItems: AutoPromotionResult[];
  notEligibleItems: AutoPromotionResult[];
  summary: {
    totalEvaluated: number;
    eligibleCount: number;
    promotedCount: number;
    notEligibleCount: number;
  };
  generatedAt: string;
}

export interface AutoPromotionInputs {
  reviewBoardInputs: Partial<ReviewBoardInputs>;
  workflowInputs: Partial<WorkflowInputs>;
  governanceInputs: Partial<GovernanceInputs>;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface AutoPromotionMemoryState {
  evaluations: AutoPromotionResult[];
}

let memoryState: AutoPromotionMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<AutoPromotionMemoryState>): void {
  memoryState = {
    evaluations: initial?.evaluations ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getEvaluations(): AutoPromotionResult[] {
  return memoryState?.evaluations ?? [];
}

function storeEvaluation(evaluation: AutoPromotionResult): void {
  if (!memoryState) return;
  const idx = memoryState.evaluations.findIndex(
    (e) => e.reviewId === evaluation.reviewId,
  );
  if (idx >= 0) {
    memoryState.evaluations[idx] = evaluation;
  } else {
    memoryState.evaluations.push(evaluation);
  }
}

// ---------------------------------------------------------------------------
// Eligibility evaluation
// ---------------------------------------------------------------------------

function checkEligibility(
  reviewItem: ReviewItem,
  workflow: ReviewWorkflowRecord,
  overrides?: Partial<AutoPromotionInputs>,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let eligible = true;

  // 1. Only scenario review type
  if (reviewItem.reviewType !== "scenario") {
    reasons.push(`Review type is ${reviewItem.reviewType}, not scenario`);
    eligible = false;
  }

  // 2. Must be in_review
  if (workflow.currentState !== "in_review") {
    reasons.push(`Workflow state is ${workflow.currentState}, not in_review`);
    eligible = false;
  }

  // 3. Readiness must be ready
  if (reviewItem.readiness === "ready") {
    reasons.push("Readiness is ready");
  } else {
    reasons.push(`Readiness is ${reviewItem.readiness}, not ready`);
    eligible = false;
  }

  // 4. Risk must be low
  if (reviewItem.risk === "low") {
    reasons.push("Risk is low");
  } else {
    reasons.push(`Risk is ${reviewItem.risk}, not low`);
    eligible = false;
  }

  // 5. Recommended decision must be approve
  if (reviewItem.recommendedDecision === "approve") {
    reasons.push("Recommended decision is approve");
  } else {
    reasons.push(`Recommended decision is ${reviewItem.recommendedDecision}, not approve`);
    eligible = false;
  }

  // 6. Governance checks (for scenario items with scenarioId)
  const scenarioId = reviewItem.linkedArtifacts.scenarioId;
  if (scenarioId) {
    const governance = evaluateScenarioExecutionGovernance(
      scenarioId,
      overrides?.governanceInputs,
    );

    // executionReadiness must not be blocked
    if (governance.executionReadiness === "blocked") {
      reasons.push("Governance execution readiness is blocked");
      eligible = false;
    } else {
      reasons.push(`Governance execution readiness is ${governance.executionReadiness}`);
    }

    // approvalRequirement must not be elevated
    if (governance.approvalRequirement === "elevated") {
      reasons.push("Governance requires elevated approval");
      eligible = false;
    } else {
      reasons.push(`Governance approval requirement is ${governance.approvalRequirement}`);
    }
  }

  // 7. No explicit defer/reject notes
  const hasNegativeNote = workflow.notes.some((n) => {
    const lower = n.message.toLowerCase();
    return lower.includes("reject") || lower.includes("defer") || lower.includes("block");
  });
  if (hasNegativeNote) {
    reasons.push("Workflow has notes indicating deferral or rejection");
    eligible = false;
  }

  // 8. No prior reject/defer transition from in_review (re-opened items)
  const hasBeenRejectedOrDeferred = workflow.history.some(
    (t) => t.from === "in_review" && (t.to === "rejected" || t.to === "deferred"),
  );
  if (hasBeenRejectedOrDeferred) {
    reasons.push("Review was previously deferred or rejected");
    eligible = false;
  }

  if (eligible) {
    reasons.push("All auto-promotion criteria met");
  }

  return { eligible, reasons };
}

// ---------------------------------------------------------------------------
// Single evaluation
// ---------------------------------------------------------------------------

export function evaluateScenarioAutoPromotion(
  reviewId: string,
  overrides?: Partial<AutoPromotionInputs>,
): AutoPromotionResult {
  const now = new Date().toISOString();

  // Get review item
  const items = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  const reviewItem = items.find((i) => i.reviewId === reviewId);

  if (!reviewItem) {
    const result: AutoPromotionResult = {
      autoPromotionId: `autopromote-${reviewId}`,
      reviewId,
      scenarioId: "",
      eligible: false,
      fromState: "unknown",
      toState: "approved_candidate",
      decision: "no_action",
      reasons: [`Review item not found: ${reviewId}`],
      applied: false,
      evaluatedAt: now,
    };
    storeEvaluation(result);
    return result;
  }

  // Get workflow
  const workflow = getReviewWorkflow(reviewId);
  if (!workflow) {
    const result: AutoPromotionResult = {
      autoPromotionId: `autopromote-${reviewId}`,
      reviewId,
      scenarioId: reviewItem.linkedArtifacts.scenarioId ?? "",
      eligible: false,
      fromState: "unknown",
      toState: "approved_candidate",
      decision: "no_action",
      reasons: [`Workflow not found for review: ${reviewId}`],
      applied: false,
      evaluatedAt: now,
    };
    storeEvaluation(result);
    return result;
  }

  const { eligible, reasons } = checkEligibility(reviewItem, workflow, overrides);

  const result: AutoPromotionResult = {
    autoPromotionId: `autopromote-${reviewId}`,
    reviewId,
    scenarioId: reviewItem.linkedArtifacts.scenarioId ?? "",
    eligible,
    fromState: workflow.currentState,
    toState: "approved_candidate",
    decision: eligible ? "auto_promote" : "no_action",
    reasons,
    applied: false,
    evaluatedAt: now,
  };

  storeEvaluation(result);
  return result;
}

// ---------------------------------------------------------------------------
// Batch evaluation
// ---------------------------------------------------------------------------

export function evaluateAllScenarioAutoPromotions(
  overrides?: Partial<AutoPromotionInputs>,
): AutoPromotionResult[] {
  // Ensure workflows exist
  initializeAllReviewWorkflows(overrides?.workflowInputs);

  const items = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  const scenarioItems = items.filter((i) => i.reviewType === "scenario");

  return scenarioItems.map((item) =>
    evaluateScenarioAutoPromotion(item.reviewId, overrides),
  );
}

// ---------------------------------------------------------------------------
// Apply eligible auto-promotions
// ---------------------------------------------------------------------------

export function applyScenarioAutoPromotions(
  actor: FactoryActor,
  overrides?: Partial<AutoPromotionInputs>,
  targetReviewId?: string,
): AutoPromotionResult[] {
  // Role check: only owner/admin can apply auto-promotions
  // (matches review workflow ROLE_TRANSITION_PERMISSIONS for approved_candidate)
  if (actor.role !== "owner" && actor.role !== "admin") {
    return [];
  }

  // Evaluate
  let evaluations: AutoPromotionResult[];
  if (targetReviewId) {
    evaluations = [evaluateScenarioAutoPromotion(targetReviewId, overrides)];
  } else {
    evaluations = evaluateAllScenarioAutoPromotions(overrides);
  }

  const results: AutoPromotionResult[] = [];

  for (const eval_ of evaluations) {
    if (!eval_.eligible) {
      results.push(eval_);
      continue;
    }

    // Apply via workflow transition
    const transition = transitionReviewWorkflow(
      eval_.reviewId,
      "approved_candidate",
      actor,
    );

    const applied: AutoPromotionResult = {
      ...eval_,
      applied: transition.success,
      reasons: transition.success
        ? [...eval_.reasons, `Applied by ${actor.actorId} (${actor.role})`]
        : [...eval_.reasons, ...transition.reasons],
    };

    storeEvaluation(applied);
    results.push(applied);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function listScenarioAutoPromotionDecisions(): AutoPromotionResult[] {
  return [...getEvaluations()];
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildScenarioAutoPromotionReport(
  overrides?: Partial<AutoPromotionInputs>,
): AutoPromotionReport {
  // Ensure we have evaluations
  if (getEvaluations().length === 0) {
    evaluateAllScenarioAutoPromotions(overrides);
  }

  const evaluations = getEvaluations();
  const eligibleItems = evaluations.filter((e) => e.eligible);
  const promotedItems = evaluations.filter((e) => e.applied);
  const notEligibleItems = evaluations.filter((e) => !e.eligible);

  return {
    evaluations,
    eligibleItems,
    promotedItems,
    notEligibleItems,
    summary: {
      totalEvaluated: evaluations.length,
      eligibleCount: eligibleItems.length,
      promotedCount: promotedItems.length,
      notEligibleCount: notEligibleItems.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatAutoPromotionResult(r: AutoPromotionResult): string {
  const tag = r.eligible
    ? r.applied ? "[PROMOTED]" : "[ELIGIBLE]"
    : "[NOT ELIGIBLE]";
  const lines: string[] = [];
  lines.push(`${tag} ${r.reviewId}`);
  lines.push(`  Scenario: ${r.scenarioId || "—"} | ${r.fromState} → ${r.toState}`);
  lines.push(`  Decision: ${r.decision} | Applied: ${r.applied}`);
  for (const reason of r.reasons.slice(0, 5)) {
    lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}

export function formatAutoPromotionReport(report: AutoPromotionReport): string {
  const lines: string[] = [];

  lines.push("=== Scenario Auto-Promotion Report ===");
  lines.push(
    `Total: ${report.summary.totalEvaluated} | ` +
    `Eligible: ${report.summary.eligibleCount} | ` +
    `Promoted: ${report.summary.promotedCount} | ` +
    `Not Eligible: ${report.summary.notEligibleCount}`,
  );
  lines.push("");

  if (report.promotedItems.length > 0) {
    lines.push("── Auto-Promoted ──");
    for (const r of report.promotedItems) {
      lines.push(formatAutoPromotionResult(r));
      lines.push("");
    }
  }

  const eligibleNotApplied = report.eligibleItems.filter((e) => !e.applied);
  if (eligibleNotApplied.length > 0) {
    lines.push("── Eligible for Auto-Promotion ──");
    for (const r of eligibleNotApplied) {
      lines.push(formatAutoPromotionResult(r));
      lines.push("");
    }
  }

  if (report.notEligibleItems.length > 0) {
    lines.push("── Not Eligible ──");
    for (const r of report.notEligibleItems) {
      lines.push(formatAutoPromotionResult(r));
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
