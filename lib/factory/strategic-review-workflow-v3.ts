/**
 * Strategic Review Workflow v3
 *
 * Extends v2 workflow with operational dimensions:
 *   1. Reviewer assignment (assign / reassign / unassign)
 *   2. Due date / SLA tracking (on_track / due_soon / overdue)
 *   3. Escalation detection (none / notify_admin / notify_owner / escalated)
 *   4. Re-review requirements after defer/caution
 *   5. Full audit trail for ops changes
 *
 * Does NOT auto-execute or auto-transition review states.
 * Does NOT bypass governance or role controls.
 */

import {
  getReviewWorkflow,
  listReviewWorkflows,
  initializeAllReviewWorkflows,
  type ReviewWorkflowRecord,
  type WorkflowInputs,
} from "./strategic-review-workflow";
import {
  buildStrategicReviewBoard,
  type ReviewItem,
  type ReviewBoardInputs,
} from "./strategic-change-review-board";
import { type FactoryActor, type FactoryRole } from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlaStatus = "on_track" | "due_soon" | "overdue";

export type EscalationStatus = "none" | "notify_admin" | "notify_owner" | "escalated";

export interface WorkflowAssignee {
  actorId: string;
  role: FactoryRole;
}

export interface WorkflowOpsRecord {
  workflowId: string;
  reviewId: string;
  assignee: WorkflowAssignee | null;
  dueAt: string | null;
  slaStatus: SlaStatus;
  escalationStatus: EscalationStatus;
  rereviewRequired: boolean;
  rereviewReason: string | null;
  opsHistory: OpsHistoryEntry[];
}

export interface OpsHistoryEntry {
  action: string;
  actorId: string;
  role: FactoryRole;
  detail: string;
  timestamp: string;
}

export interface WorkflowV3ReportEntry {
  workflowId: string;
  reviewId: string;
  currentState: string;
  assignee: WorkflowAssignee | null;
  dueAt: string | null;
  slaStatus: SlaStatus;
  escalationStatus: EscalationStatus;
  rereviewRequired: boolean;
  domain: string;
  priority: number;
  risk: string;
  lastUpdated: string;
}

export interface WorkflowV3Report {
  entries: WorkflowV3ReportEntry[];
  assignedItems: WorkflowV3ReportEntry[];
  dueSoonItems: WorkflowV3ReportEntry[];
  overdueItems: WorkflowV3ReportEntry[];
  escalatedItems: WorkflowV3ReportEntry[];
  rereviewItems: WorkflowV3ReportEntry[];
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
}

export interface WorkflowV3Inputs {
  reviewBoardInputs: Partial<ReviewBoardInputs>;
  workflowInputs: Partial<WorkflowInputs>;
  now: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default due window in milliseconds per state. */
const DEFAULT_DUE_WINDOWS_MS: Record<string, number> = {
  pending: 3 * 24 * 60 * 60 * 1000,       // 3 days
  in_review: 3 * 24 * 60 * 60 * 1000,      // 3 days
  approved_candidate: 2 * 24 * 60 * 60 * 1000, // 2 days
  deferred: 5 * 24 * 60 * 60 * 1000,       // 5 days for rereview
};

const DUE_SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface OpsMemoryState {
  records: WorkflowOpsRecord[];
}

let memoryState: OpsMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<OpsMemoryState>): void {
  memoryState = {
    records: initial?.records ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getRecords(): WorkflowOpsRecord[] {
  return memoryState?.records ?? [];
}

function findRecord(reviewId: string): WorkflowOpsRecord | undefined {
  return getRecords().find((r) => r.reviewId === reviewId);
}

function storeRecord(record: WorkflowOpsRecord): void {
  if (!memoryState) return;
  const idx = memoryState.records.findIndex((r) => r.reviewId === record.reviewId);
  if (idx >= 0) {
    memoryState.records[idx] = record;
  } else {
    memoryState.records.push(record);
  }
}

// ---------------------------------------------------------------------------
// Ops record initialization
// ---------------------------------------------------------------------------

function ensureOpsRecord(reviewId: string): WorkflowOpsRecord {
  const existing = findRecord(reviewId);
  if (existing) return existing;

  const workflow = getReviewWorkflow(reviewId);
  const workflowId = workflow?.workflowId ?? `wf-${reviewId}`;

  const record: WorkflowOpsRecord = {
    workflowId,
    reviewId,
    assignee: null,
    dueAt: null,
    slaStatus: "on_track",
    escalationStatus: "none",
    rereviewRequired: false,
    rereviewReason: null,
    opsHistory: [],
  };

  storeRecord(record);
  return record;
}

function ensureAllOpsRecords(overrides?: Partial<WorkflowV3Inputs>): void {
  initializeAllReviewWorkflows(overrides?.workflowInputs);
  const workflows = listReviewWorkflows();
  for (const w of workflows) {
    ensureOpsRecord(w.reviewId);
  }
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export function assignReviewWorkflow(
  reviewId: string,
  assignee: WorkflowAssignee,
  actor: FactoryActor,
): { success: boolean; record: WorkflowOpsRecord | null; reason: string } {
  // Role check: only owner/admin can assign, reviewer can self-claim
  if (actor.role !== "owner" && actor.role !== "admin") {
    if (actor.role === "reviewer") {
      // Reviewer can self-claim unassigned items only
      const record = ensureOpsRecord(reviewId);
      if (record.assignee !== null) {
        return { success: false, record, reason: "Reviewers can only self-claim unassigned items" };
      }
      if (assignee.actorId !== actor.actorId) {
        return { success: false, record, reason: "Reviewers can only assign themselves" };
      }
    } else {
      return { success: false, record: findRecord(reviewId) ?? null, reason: `Role ${actor.role} cannot assign reviews` };
    }
  }

  const record = ensureOpsRecord(reviewId);
  const prevAssignee = record.assignee;

  record.assignee = assignee;
  record.opsHistory.push({
    action: prevAssignee ? "reassign" : "assign",
    actorId: actor.actorId,
    role: actor.role,
    detail: prevAssignee
      ? `Reassigned from ${prevAssignee.actorId} to ${assignee.actorId} (${assignee.role})`
      : `Assigned to ${assignee.actorId} (${assignee.role})`,
    timestamp: new Date().toISOString(),
  });

  storeRecord(record);
  return { success: true, record, reason: "Assignment updated" };
}

export function unassignReviewWorkflow(
  reviewId: string,
  actor: FactoryActor,
): { success: boolean; record: WorkflowOpsRecord | null; reason: string } {
  if (actor.role !== "owner" && actor.role !== "admin") {
    return { success: false, record: findRecord(reviewId) ?? null, reason: `Role ${actor.role} cannot unassign reviews` };
  }

  const record = ensureOpsRecord(reviewId);
  const prevAssignee = record.assignee;

  if (!prevAssignee) {
    return { success: true, record, reason: "Already unassigned" };
  }

  record.assignee = null;
  record.opsHistory.push({
    action: "unassign",
    actorId: actor.actorId,
    role: actor.role,
    detail: `Unassigned ${prevAssignee.actorId}`,
    timestamp: new Date().toISOString(),
  });

  storeRecord(record);
  return { success: true, record, reason: "Unassigned" };
}

// ---------------------------------------------------------------------------
// Due date
// ---------------------------------------------------------------------------

export function updateReviewDueDate(
  reviewId: string,
  dueAt: string,
  actor: FactoryActor,
): { success: boolean; record: WorkflowOpsRecord | null; reason: string } {
  if (actor.role !== "owner" && actor.role !== "admin") {
    return { success: false, record: findRecord(reviewId) ?? null, reason: `Role ${actor.role} cannot set due dates` };
  }

  const record = ensureOpsRecord(reviewId);
  const prevDue = record.dueAt;

  record.dueAt = dueAt;
  record.opsHistory.push({
    action: "set_due_date",
    actorId: actor.actorId,
    role: actor.role,
    detail: prevDue
      ? `Due date changed from ${prevDue} to ${dueAt}`
      : `Due date set to ${dueAt}`,
    timestamp: new Date().toISOString(),
  });

  storeRecord(record);
  return { success: true, record, reason: "Due date updated" };
}

/**
 * Auto-assign default due date based on current workflow state.
 */
export function assignDefaultDueDate(
  reviewId: string,
  now?: string,
): string | null {
  const workflow = getReviewWorkflow(reviewId);
  if (!workflow) return null;

  const windowMs = DEFAULT_DUE_WINDOWS_MS[workflow.currentState];
  if (!windowMs) return null;

  const base = now ? new Date(now) : new Date();
  return new Date(base.getTime() + windowMs).toISOString();
}

// ---------------------------------------------------------------------------
// SLA evaluation
// ---------------------------------------------------------------------------

export function evaluateReviewSlaStatus(
  reviewId: string,
  now?: string,
): SlaStatus {
  const record = findRecord(reviewId);
  if (!record || !record.dueAt) return "on_track";

  const nowMs = now ? new Date(now).getTime() : Date.now();
  const dueMs = new Date(record.dueAt).getTime();
  const remaining = dueMs - nowMs;

  if (remaining < 0) return "overdue";
  if (remaining <= DUE_SOON_THRESHOLD_MS) return "due_soon";
  return "on_track";
}

// ---------------------------------------------------------------------------
// Escalation evaluation
// ---------------------------------------------------------------------------

export function evaluateReviewEscalationStatus(
  reviewId: string,
  now?: string,
  overrides?: Partial<WorkflowV3Inputs>,
): EscalationStatus {
  const record = findRecord(reviewId);
  if (!record) return "none";

  const sla = evaluateReviewSlaStatus(reviewId, now);
  if (sla !== "overdue") return "none";

  const workflow = getReviewWorkflow(reviewId);
  if (!workflow) return "none";

  // Get review item for priority
  const items = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  const reviewItem = items.find((i) => i.reviewId === reviewId);
  const priority = reviewItem?.priority ?? 0;

  // Count defer cycles
  const deferCount = workflow.history.filter((t) => t.to === "deferred").length;

  // High-priority blocked items overdue → escalated
  if (priority > 0.7 && (workflow.currentState === "pending" || workflow.currentState === "in_review")) {
    return "escalated";
  }

  // Repeated defer cycles → escalated
  if (deferCount >= 2) {
    return "escalated";
  }

  // Overdue approved_candidate → notify_owner
  if (workflow.currentState === "approved_candidate") {
    return "notify_owner";
  }

  // Overdue pending/in_review → notify_admin
  if (workflow.currentState === "pending" || workflow.currentState === "in_review") {
    return "notify_admin";
  }

  return "none";
}

// ---------------------------------------------------------------------------
// Re-review evaluation
// ---------------------------------------------------------------------------

export function evaluateReviewRereviewRequirement(
  reviewId: string,
): { required: boolean; reasons: string[] } {
  const workflow = getReviewWorkflow(reviewId);
  if (!workflow) return { required: false, reasons: ["Workflow not found"] };

  const reasons: string[] = [];

  // Deferred items require re-review
  if (workflow.currentState === "deferred") {
    reasons.push("Item is in deferred state");
  }

  // Manual note marks needs_rereview
  const hasRereviewNote = workflow.notes.some((n) => {
    const lower = n.message.toLowerCase();
    return lower.includes("needs_rereview") || lower.includes("needs rereview") || lower.includes("re-review");
  });
  if (hasRereviewNote) {
    reasons.push("Note indicates re-review is needed");
  }

  // Multiple defer cycles
  const deferCount = workflow.history.filter((t) => t.to === "deferred").length;
  if (deferCount >= 2) {
    reasons.push(`Item has been deferred ${deferCount} times`);
  }

  // Check explicit rereview flag
  const record = findRecord(reviewId);
  if (record?.rereviewRequired && record.rereviewReason) {
    reasons.push(record.rereviewReason);
  }

  return { required: reasons.length > 0, reasons };
}

export function setRereviewRequired(
  reviewId: string,
  required: boolean,
  reason: string,
  actor: FactoryActor,
): { success: boolean; record: WorkflowOpsRecord | null; reason: string } {
  if (actor.role !== "owner" && actor.role !== "admin") {
    return { success: false, record: findRecord(reviewId) ?? null, reason: `Role ${actor.role} cannot set re-review requirement` };
  }

  const record = ensureOpsRecord(reviewId);
  record.rereviewRequired = required;
  record.rereviewReason = required ? reason : null;

  record.opsHistory.push({
    action: required ? "set_rereview" : "clear_rereview",
    actorId: actor.actorId,
    role: actor.role,
    detail: required ? `Re-review required: ${reason}` : "Re-review cleared",
    timestamp: new Date().toISOString(),
  });

  storeRecord(record);
  return { success: true, record, reason: required ? "Re-review set" : "Re-review cleared" };
}

// ---------------------------------------------------------------------------
// Bulk evaluation
// ---------------------------------------------------------------------------

export function evaluateAllWorkflowOps(
  now?: string,
  overrides?: Partial<WorkflowV3Inputs>,
): WorkflowOpsRecord[] {
  ensureAllOpsRecords(overrides);
  const records = getRecords();

  for (const record of records) {
    // Auto-assign default due if missing
    if (!record.dueAt) {
      const defaultDue = assignDefaultDueDate(record.reviewId, now);
      if (defaultDue) {
        record.dueAt = defaultDue;
      }
    }

    // Evaluate SLA
    record.slaStatus = evaluateReviewSlaStatus(record.reviewId, now);

    // Evaluate escalation
    record.escalationStatus = evaluateReviewEscalationStatus(record.reviewId, now, overrides);

    // Evaluate rereview
    const rereview = evaluateReviewRereviewRequirement(record.reviewId);
    if (rereview.required && !record.rereviewRequired) {
      record.rereviewRequired = true;
      record.rereviewReason = rereview.reasons[0] ?? null;
    }

    storeRecord(record);
  }

  return records;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function getWorkflowOpsRecord(reviewId: string): WorkflowOpsRecord | null {
  return findRecord(reviewId) ?? null;
}

export function listWorkflowOpsRecords(): WorkflowOpsRecord[] {
  return [...getRecords()];
}

/**
 * Check if a review item is blocked from execution approval by rereview requirement.
 */
export function isBlockedByRereview(reviewId: string): boolean {
  const record = findRecord(reviewId);
  if (!record) return false;

  const rereview = evaluateReviewRereviewRequirement(reviewId);
  return rereview.required || record.rereviewRequired;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildStrategicReviewWorkflowV3Report(
  now?: string,
  overrides?: Partial<WorkflowV3Inputs>,
): WorkflowV3Report {
  evaluateAllWorkflowOps(now, overrides);

  const records = getRecords();
  const items = buildStrategicReviewBoard(overrides?.reviewBoardInputs);
  const workflows = listReviewWorkflows();

  const entries: WorkflowV3ReportEntry[] = records.map((r) => {
    const reviewItem = items.find((i) => i.reviewId === r.reviewId);
    const workflow = workflows.find((w) => w.reviewId === r.reviewId);

    return {
      workflowId: r.workflowId,
      reviewId: r.reviewId,
      currentState: workflow?.currentState ?? "unknown",
      assignee: r.assignee,
      dueAt: r.dueAt,
      slaStatus: r.slaStatus,
      escalationStatus: r.escalationStatus,
      rereviewRequired: r.rereviewRequired,
      domain: reviewItem?.domain ?? "unknown",
      priority: reviewItem?.priority ?? 0,
      risk: reviewItem?.risk ?? "medium",
      lastUpdated: workflow?.updatedAt ?? r.opsHistory[r.opsHistory.length - 1]?.timestamp ?? "",
    };
  });

  const assignedItems = entries.filter((e) => e.assignee !== null);
  const dueSoonItems = entries.filter((e) => e.slaStatus === "due_soon");
  const overdueItems = entries.filter((e) => e.slaStatus === "overdue");
  const escalatedItems = entries.filter((e) => e.escalationStatus !== "none");
  const rereviewItems = entries.filter((e) => e.rereviewRequired);

  return {
    entries,
    assignedItems,
    dueSoonItems,
    overdueItems,
    escalatedItems,
    rereviewItems,
    summary: {
      totalWorkflows: entries.length,
      assignedCount: assignedItems.length,
      unassignedCount: entries.length - assignedItems.length,
      onTrackCount: entries.filter((e) => e.slaStatus === "on_track").length,
      dueSoonCount: dueSoonItems.length,
      overdueCount: overdueItems.length,
      escalatedCount: escalatedItems.length,
      rereviewCount: rereviewItems.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SLA_ICONS: Record<SlaStatus, string> = {
  on_track: "[ON TRACK]",
  due_soon: "[DUE SOON]",
  overdue: "[OVERDUE]",
};

const ESCALATION_ICONS: Record<EscalationStatus, string> = {
  none: "",
  notify_admin: "[NOTIFY ADMIN]",
  notify_owner: "[NOTIFY OWNER]",
  escalated: "[ESCALATED]",
};

export function formatWorkflowOpsRecord(r: WorkflowOpsRecord): string {
  const lines: string[] = [];
  const slaTag = SLA_ICONS[r.slaStatus];
  const escTag = ESCALATION_ICONS[r.escalationStatus];
  lines.push(`${slaTag}${escTag ? " " + escTag : ""} ${r.reviewId}`);
  lines.push(`  Assignee: ${r.assignee ? `${r.assignee.actorId} (${r.assignee.role})` : "—"}`);
  lines.push(`  Due: ${r.dueAt ?? "—"} | Re-review: ${r.rereviewRequired ? "YES" : "no"}`);
  if (r.rereviewReason) {
    lines.push(`  Re-review reason: ${r.rereviewReason}`);
  }
  return lines.join("\n");
}

export function formatWorkflowV3Report(report: WorkflowV3Report): string {
  const lines: string[] = [];

  lines.push("=== Strategic Review Operations Report ===");
  lines.push(
    `Total: ${report.summary.totalWorkflows} | ` +
    `Assigned: ${report.summary.assignedCount} | ` +
    `Unassigned: ${report.summary.unassignedCount}`,
  );
  lines.push(
    `On Track: ${report.summary.onTrackCount} | ` +
    `Due Soon: ${report.summary.dueSoonCount} | ` +
    `Overdue: ${report.summary.overdueCount} | ` +
    `Escalated: ${report.summary.escalatedCount} | ` +
    `Re-review: ${report.summary.rereviewCount}`,
  );
  lines.push("");

  const sections: Array<{ title: string; subtitle: string; items: WorkflowV3ReportEntry[] }> = [
    { title: "Due Soon", subtitle: "期限が近い", items: report.dueSoonItems },
    { title: "Overdue", subtitle: "期限超過", items: report.overdueItems },
    { title: "Escalated", subtitle: "エスカレーション", items: report.escalatedItems },
    { title: "Re-Review Required", subtitle: "再レビュー必要", items: report.rereviewItems },
    { title: "Assigned Reviews", subtitle: "担当者あり", items: report.assignedItems },
  ];

  for (const section of sections) {
    if (section.items.length > 0) {
      lines.push(`── ${section.title} (${section.subtitle}) ──`);
      for (const item of section.items) {
        const assignee = item.assignee ? `${item.assignee.actorId} (${item.assignee.role})` : "—";
        lines.push(
          `  ${item.reviewId} | ${item.currentState} | assignee: ${assignee} | ` +
          `due: ${item.dueAt ?? "—"} | SLA: ${item.slaStatus} | esc: ${item.escalationStatus} | ` +
          `priority: ${item.priority.toFixed(2)} | risk: ${item.risk}`,
        );
      }
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
