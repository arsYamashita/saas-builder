/**
 * Strategic Change Review Workflow v2
 *
 * Provides:
 *   1. Explicit review workflow states (pending → archived)
 *   2. Deterministic state transition enforcement
 *   3. Role-based transition authorization
 *   4. Review notes attached to workflow records
 *   5. Full audit trail (transitions + notes)
 *
 * Does NOT auto-transition or auto-execute scenarios.
 * Does NOT bypass governance or role controls.
 */

import {
  canPerformFactoryAction,
  type FactoryActor,
  type FactoryRole,
} from "./team-role-approval";
import {
  buildStrategicReviewBoard,
  type ReviewItem,
  type ReviewBoardInputs,
} from "./strategic-change-review-board";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowState =
  | "pending"
  | "in_review"
  | "approved_candidate"
  | "approved_for_execution"
  | "deferred"
  | "rejected"
  | "archived";

export interface WorkflowTransitionRecord {
  from: WorkflowState;
  to: WorkflowState;
  actorId: string;
  role: FactoryRole;
  timestamp: string;
}

export interface WorkflowNote {
  actorId: string;
  role: FactoryRole;
  message: string;
  timestamp: string;
}

export interface ReviewWorkflowRecord {
  workflowId: string;
  reviewId: string;
  currentState: WorkflowState;
  history: WorkflowTransitionRecord[];
  notes: WorkflowNote[];
  createdAt: string;
  updatedAt: string;
}

export interface TransitionValidation {
  valid: boolean;
  reasons: string[];
}

export interface WorkflowReportEntry {
  workflowId: string;
  reviewId: string;
  currentState: WorkflowState;
  domain: string;
  priority: number;
  risk: string;
  lastActor: string | null;
  lastRole: string | null;
  lastUpdated: string;
  noteCount: number;
}

export interface WorkflowReport {
  workflows: WorkflowReportEntry[];
  pendingItems: WorkflowReportEntry[];
  inReviewItems: WorkflowReportEntry[];
  approvedCandidateItems: WorkflowReportEntry[];
  approvedForExecutionItems: WorkflowReportEntry[];
  deferredItems: WorkflowReportEntry[];
  rejectedItems: WorkflowReportEntry[];
  archivedItems: WorkflowReportEntry[];
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
}

export interface WorkflowInputs {
  reviewBoardInputs: Partial<ReviewBoardInputs>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALL_WORKFLOW_STATES: WorkflowState[] = [
  "pending",
  "in_review",
  "approved_candidate",
  "approved_for_execution",
  "deferred",
  "rejected",
  "archived",
];

/**
 * Valid transition map: source state → allowed target states.
 */
const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  pending: ["in_review"],
  in_review: ["approved_candidate", "deferred", "rejected"],
  approved_candidate: ["approved_for_execution", "deferred", "rejected"],
  deferred: ["in_review"],
  approved_for_execution: ["archived"],
  rejected: ["archived"],
  archived: [],
};

/**
 * Role transition permissions: role → allowed target states.
 */
const ROLE_TRANSITION_PERMISSIONS: Record<FactoryRole, WorkflowState[]> = {
  owner: [
    "in_review",
    "approved_candidate",
    "approved_for_execution",
    "deferred",
    "rejected",
    "archived",
  ],
  admin: [
    "in_review",
    "approved_candidate",
    "approved_for_execution",
    "deferred",
    "rejected",
    "archived",
  ],
  reviewer: [
    "in_review",
    "deferred",
  ],
  operator: [],
  viewer: [],
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface WorkflowMemoryState {
  workflows: ReviewWorkflowRecord[];
}

let memoryState: WorkflowMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<WorkflowMemoryState>): void {
  memoryState = {
    workflows: initial?.workflows ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getWorkflows(): ReviewWorkflowRecord[] {
  return memoryState?.workflows ?? [];
}

function findWorkflow(reviewId: string): ReviewWorkflowRecord | undefined {
  return getWorkflows().find((w) => w.reviewId === reviewId);
}

function storeWorkflow(workflow: ReviewWorkflowRecord): void {
  if (!memoryState) return;
  const idx = memoryState.workflows.findIndex(
    (w) => w.reviewId === workflow.reviewId,
  );
  if (idx >= 0) {
    memoryState.workflows[idx] = workflow;
  } else {
    memoryState.workflows.push(workflow);
  }
}

// ---------------------------------------------------------------------------
// Workflow initialization
// ---------------------------------------------------------------------------

export function initializeReviewWorkflow(
  reviewId: string,
): ReviewWorkflowRecord {
  const existing = findWorkflow(reviewId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const workflow: ReviewWorkflowRecord = {
    workflowId: `wf-${reviewId}`,
    reviewId,
    currentState: "pending",
    history: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };

  storeWorkflow(workflow);
  return workflow;
}

/**
 * Initialize workflows for all current review board items.
 */
export function initializeAllReviewWorkflows(
  overrides?: Partial<WorkflowInputs>,
): ReviewWorkflowRecord[] {
  const items = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  return items.map((item) => initializeReviewWorkflow(item.reviewId));
}

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

export function validateReviewTransition(
  reviewId: string,
  targetState: WorkflowState,
  actor: FactoryActor,
): TransitionValidation {
  const reasons: string[] = [];

  // 1. Workflow must exist
  const workflow = findWorkflow(reviewId);
  if (!workflow) {
    return { valid: false, reasons: [`Workflow not found for review: ${reviewId}`] };
  }

  // 2. Target state must be valid
  if (!ALL_WORKFLOW_STATES.includes(targetState)) {
    return { valid: false, reasons: [`Invalid target state: ${targetState}`] };
  }

  // 3. Transition must be structurally valid
  const allowed = VALID_TRANSITIONS[workflow.currentState];
  if (!allowed.includes(targetState)) {
    reasons.push(
      `Transition ${workflow.currentState} → ${targetState} is not allowed. ` +
      `Valid transitions from ${workflow.currentState}: ${allowed.join(", ") || "none"}`,
    );
  }

  // 4. Role must be authorized for this transition
  const roleAllowed = ROLE_TRANSITION_PERMISSIONS[actor.role];
  if (!roleAllowed.includes(targetState)) {
    reasons.push(
      `Role ${actor.role} cannot transition to ${targetState}`,
    );
  }

  return { valid: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Transition execution
// ---------------------------------------------------------------------------

export function transitionReviewWorkflow(
  reviewId: string,
  targetState: WorkflowState,
  actor: FactoryActor,
): { success: boolean; workflow: ReviewWorkflowRecord | null; reasons: string[] } {
  const validation = validateReviewTransition(reviewId, targetState, actor);
  if (!validation.valid) {
    const workflow = findWorkflow(reviewId) ?? null;
    return { success: false, workflow, reasons: validation.reasons };
  }

  const workflow = findWorkflow(reviewId)!;
  const now = new Date().toISOString();

  const transition: WorkflowTransitionRecord = {
    from: workflow.currentState,
    to: targetState,
    actorId: actor.actorId,
    role: actor.role,
    timestamp: now,
  };

  workflow.history.push(transition);
  workflow.currentState = targetState;
  workflow.updatedAt = now;

  storeWorkflow(workflow);
  return { success: true, workflow, reasons: [] };
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function addReviewWorkflowNote(
  reviewId: string,
  actor: FactoryActor,
  message: string,
): { success: boolean; workflow: ReviewWorkflowRecord | null; reason: string } {
  const workflow = findWorkflow(reviewId);
  if (!workflow) {
    return { success: false, workflow: null, reason: `Workflow not found for review: ${reviewId}` };
  }

  // Any role except viewer can add notes
  if (actor.role === "viewer") {
    return { success: false, workflow, reason: "Viewers cannot add review notes" };
  }

  const note: WorkflowNote = {
    actorId: actor.actorId,
    role: actor.role,
    message,
    timestamp: new Date().toISOString(),
  };

  workflow.notes.push(note);
  workflow.updatedAt = note.timestamp;

  storeWorkflow(workflow);
  return { success: true, workflow, reason: "Note added" };
}

// ---------------------------------------------------------------------------
// History / query
// ---------------------------------------------------------------------------

export function getReviewWorkflow(
  reviewId: string,
): ReviewWorkflowRecord | null {
  return findWorkflow(reviewId) ?? null;
}

export function listReviewWorkflows(): ReviewWorkflowRecord[] {
  return [...getWorkflows()];
}

export function listReviewWorkflowHistory(
  reviewId: string,
): { transitions: WorkflowTransitionRecord[]; notes: WorkflowNote[] } | null {
  const workflow = findWorkflow(reviewId);
  if (!workflow) return null;
  return {
    transitions: [...workflow.history],
    notes: [...workflow.notes],
  };
}

/**
 * Get all workflows in a given state.
 */
export function listWorkflowsByState(
  state: WorkflowState,
): ReviewWorkflowRecord[] {
  return getWorkflows().filter((w) => w.currentState === state);
}

/**
 * Check if a review item is approved for execution (governance linkage).
 */
export function isApprovedForExecution(reviewId: string): boolean {
  const workflow = findWorkflow(reviewId);
  return workflow?.currentState === "approved_for_execution";
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildStrategicReviewWorkflowReport(
  overrides?: Partial<WorkflowInputs>,
): WorkflowReport {
  // Ensure all review items have workflows
  initializeAllReviewWorkflows(overrides);

  const workflows = getWorkflows();
  const items = buildStrategicReviewBoard(overrides?.reviewBoardInputs);

  const entries: WorkflowReportEntry[] = workflows.map((w) => {
    const reviewItem = items.find((i) => i.reviewId === w.reviewId);
    const lastTransition = w.history.length > 0
      ? w.history[w.history.length - 1]
      : null;

    return {
      workflowId: w.workflowId,
      reviewId: w.reviewId,
      currentState: w.currentState,
      domain: reviewItem?.domain ?? "unknown",
      priority: reviewItem?.priority ?? 0,
      risk: reviewItem?.risk ?? "medium",
      lastActor: lastTransition?.actorId ?? null,
      lastRole: lastTransition?.role ?? null,
      lastUpdated: w.updatedAt,
      noteCount: w.notes.length,
    };
  });

  const byState = (state: WorkflowState) =>
    entries.filter((e) => e.currentState === state);

  return {
    workflows: entries,
    pendingItems: byState("pending"),
    inReviewItems: byState("in_review"),
    approvedCandidateItems: byState("approved_candidate"),
    approvedForExecutionItems: byState("approved_for_execution"),
    deferredItems: byState("deferred"),
    rejectedItems: byState("rejected"),
    archivedItems: byState("archived"),
    summary: {
      totalWorkflows: entries.length,
      pendingCount: byState("pending").length,
      inReviewCount: byState("in_review").length,
      approvedCandidateCount: byState("approved_candidate").length,
      approvedForExecutionCount: byState("approved_for_execution").length,
      deferredCount: byState("deferred").length,
      rejectedCount: byState("rejected").length,
      archivedCount: byState("archived").length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<WorkflowState, string> = {
  pending: "[PENDING]",
  in_review: "[IN REVIEW]",
  approved_candidate: "[APPROVED CANDIDATE]",
  approved_for_execution: "[APPROVED FOR EXECUTION]",
  deferred: "[DEFERRED]",
  rejected: "[REJECTED]",
  archived: "[ARCHIVED]",
};

export function formatWorkflowRecord(w: ReviewWorkflowRecord): string {
  const lines: string[] = [];
  lines.push(`${STATE_LABELS[w.currentState]} ${w.reviewId}`);
  lines.push(`  Workflow ID: ${w.workflowId}`);
  lines.push(`  Transitions: ${w.history.length} | Notes: ${w.notes.length}`);
  if (w.history.length > 0) {
    const last = w.history[w.history.length - 1];
    lines.push(`  Last: ${last.from} → ${last.to} by ${last.actorId} (${last.role}) at ${last.timestamp}`);
  }
  return lines.join("\n");
}

export function formatWorkflowReport(report: WorkflowReport): string {
  const lines: string[] = [];

  lines.push("=== Strategic Review Workflow Report ===");
  lines.push(
    `Total: ${report.summary.totalWorkflows} | ` +
    `Pending: ${report.summary.pendingCount} | ` +
    `In Review: ${report.summary.inReviewCount} | ` +
    `Candidates: ${report.summary.approvedCandidateCount} | ` +
    `Exec-Ready: ${report.summary.approvedForExecutionCount}`,
  );
  lines.push(
    `Deferred: ${report.summary.deferredCount} | ` +
    `Rejected: ${report.summary.rejectedCount} | ` +
    `Archived: ${report.summary.archivedCount}`,
  );
  lines.push("");

  const sections: Array<{ title: string; subtitle: string; items: WorkflowReportEntry[] }> = [
    { title: "Pending", subtitle: "レビュー待ち", items: report.pendingItems },
    { title: "In Review", subtitle: "レビュー中", items: report.inReviewItems },
    { title: "Approved Candidate", subtitle: "承認候補", items: report.approvedCandidateItems },
    { title: "Approved for Execution", subtitle: "実行承認済み", items: report.approvedForExecutionItems },
    { title: "Deferred", subtitle: "保留", items: report.deferredItems },
    { title: "Rejected", subtitle: "却下", items: report.rejectedItems },
    { title: "Archived", subtitle: "アーカイブ済み", items: report.archivedItems },
  ];

  for (const section of sections) {
    if (section.items.length > 0) {
      lines.push(`── ${section.title} (${section.subtitle}) ──`);
      for (const item of section.items) {
        const actor = item.lastActor ? `${item.lastActor} (${item.lastRole})` : "—";
        lines.push(`  ${item.reviewId} | priority: ${item.priority.toFixed(2)} | risk: ${item.risk} | domain: ${item.domain} | actor: ${actor} | notes: ${item.noteCount}`);
      }
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
