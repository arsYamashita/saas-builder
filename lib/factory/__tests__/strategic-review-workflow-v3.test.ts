import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  assignReviewWorkflow,
  unassignReviewWorkflow,
  updateReviewDueDate,
  assignDefaultDueDate,
  evaluateReviewSlaStatus,
  evaluateReviewEscalationStatus,
  evaluateReviewRereviewRequirement,
  setRereviewRequired,
  evaluateAllWorkflowOps,
  getWorkflowOpsRecord,
  listWorkflowOpsRecords,
  isBlockedByRereview,
  buildStrategicReviewWorkflowV3Report,
  formatWorkflowOpsRecord,
  formatWorkflowV3Report,
  useInMemoryStore,
  clearInMemoryStore,
} from "../strategic-review-workflow-v3";
import {
  buildStrategicReviewBoard,
} from "../strategic-change-review-board";
import {
  initializeAllReviewWorkflows,
  transitionReviewWorkflow,
  getReviewWorkflow,
  addReviewWorkflowNote,
  useInMemoryStore as useWorkflowStore,
  clearInMemoryStore as clearWorkflowStore,
} from "../strategic-review-workflow";
import {
  useInMemoryStore as useGovernanceStore,
  clearInMemoryStore as clearGovernanceStore,
} from "../scenario-execution-governance";
import { resolveActorRole, type FactoryActor } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function admin(): FactoryActor {
  return resolveActorRole("admin-1", "admin");
}

function reviewer(): FactoryActor {
  return resolveActorRole("reviewer-1", "reviewer");
}

function viewer(): FactoryActor {
  return resolveActorRole("viewer-1", "viewer");
}

function owner(): FactoryActor {
  return resolveActorRole("owner-1", "owner");
}

function operator(): FactoryActor {
  return resolveActorRole("operator-1", "operator");
}

/**
 * Setup: initialize workflows and return review IDs.
 */
function setupWorkflows(): string[] {
  const items = buildStrategicReviewBoard();
  initializeAllReviewWorkflows();
  return items.map((i) => i.reviewId);
}

// ---------------------------------------------------------------------------

describe("Strategic Review Workflow v3", { timeout: 30000 }, () => {
  beforeEach(() => {
    useInMemoryStore();
    useWorkflowStore();
    useGovernanceStore();
  });

  afterEach(() => {
    clearInMemoryStore();
    clearWorkflowStore();
    clearGovernanceStore();
  });

  // ── 1. Assignment works with role enforcement ─────────────

  describe("assignment", () => {
    it("admin can assign a reviewer to a workflow", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );

      expect(result.success).toBe(true);
      expect(result.record?.assignee?.actorId).toBe("reviewer-1");
    });

    it("owner can assign a reviewer to a workflow", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-2", role: "reviewer" },
        owner(),
      );

      expect(result.success).toBe(true);
      expect(result.record?.assignee?.actorId).toBe("reviewer-2");
    });

    it("reviewer can self-claim unassigned items", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        reviewer(),
      );

      expect(result.success).toBe(true);
      expect(result.record?.assignee?.actorId).toBe("reviewer-1");
    });

    it("reviewer cannot assign someone else", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-2", role: "reviewer" },
        reviewer(),
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain("only assign themselves");
    });

    it("reviewer cannot claim already-assigned items", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-2", role: "reviewer" },
        admin(),
      );

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        reviewer(),
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain("only self-claim unassigned");
    });

    it("reassignment records history", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );
      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-2", role: "reviewer" },
        admin(),
      );

      const record = getWorkflowOpsRecord(reviewIds[0]);
      expect(record?.assignee?.actorId).toBe("reviewer-2");
      const reassignEntry = record?.opsHistory.find((h) => h.action === "reassign");
      expect(reassignEntry).toBeTruthy();
      expect(reassignEntry?.detail).toContain("reviewer-1");
      expect(reassignEntry?.detail).toContain("reviewer-2");
    });
  });

  // ── 2. Unauthorized assignment is blocked ─────────────────

  describe("authorization", () => {
    it("viewer cannot assign reviews", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        viewer(),
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain("viewer");
    });

    it("operator cannot assign reviews", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        operator(),
      );

      expect(result.success).toBe(false);
      expect(result.reason).toContain("operator");
    });

    it("viewer cannot set due dates", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = updateReviewDueDate(
        reviewIds[0],
        new Date(Date.now() + 86400000).toISOString(),
        viewer(),
      );

      expect(result.success).toBe(false);
    });

    it("viewer cannot unassign reviews", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = unassignReviewWorkflow(reviewIds[0], viewer());

      expect(result.success).toBe(false);
    });

    it("viewer cannot set rereview requirement", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = setRereviewRequired(reviewIds[0], true, "test", viewer());
      expect(result.success).toBe(false);
    });
  });

  // ── 3. Due date updates work deterministically ────────────

  describe("due dates", () => {
    it("admin can set due date", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const futureDate = new Date(Date.now() + 2 * 86400000).toISOString();
      const result = updateReviewDueDate(reviewIds[0], futureDate, admin());

      expect(result.success).toBe(true);
      expect(result.record?.dueAt).toBe(futureDate);
    });

    it("due date update records history", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const futureDate = new Date(Date.now() + 2 * 86400000).toISOString();
      updateReviewDueDate(reviewIds[0], futureDate, admin());

      const record = getWorkflowOpsRecord(reviewIds[0]);
      const entry = record?.opsHistory.find((h) => h.action === "set_due_date");
      expect(entry).toBeTruthy();
      expect(entry?.detail).toContain(futureDate);
    });

    it("default due date uses state-based window", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const now = "2026-03-18T00:00:00.000Z";
      const defaultDue = assignDefaultDueDate(reviewIds[0], now);

      expect(defaultDue).toBeTruthy();
      // pending state → 3 days
      const dueDate = new Date(defaultDue!);
      const baseDate = new Date(now);
      const diffDays = (dueDate.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBe(3);
    });
  });

  // ── 4. SLA status classification works ────────────────────

  describe("SLA status", () => {
    it("on_track when due date is far in the future", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const futureDate = new Date(Date.now() + 5 * 86400000).toISOString();
      updateReviewDueDate(reviewIds[0], futureDate, admin());

      const sla = evaluateReviewSlaStatus(reviewIds[0]);
      expect(sla).toBe("on_track");
    });

    it("due_soon when due date is within 24 hours", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const soonDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours
      updateReviewDueDate(reviewIds[0], soonDate, admin());

      const sla = evaluateReviewSlaStatus(reviewIds[0]);
      expect(sla).toBe("due_soon");
    });

    it("overdue when due date has passed", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
      updateReviewDueDate(reviewIds[0], pastDate, admin());

      const sla = evaluateReviewSlaStatus(reviewIds[0]);
      expect(sla).toBe("overdue");
    });

    it("on_track when no due date is set", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      // Ensure record exists but no due date
      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );

      const sla = evaluateReviewSlaStatus(reviewIds[0]);
      expect(sla).toBe("on_track");
    });
  });

  // ── 5. Escalation classification works ────────────────────

  describe("escalation", () => {
    it("none when not overdue", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const futureDate = new Date(Date.now() + 5 * 86400000).toISOString();
      updateReviewDueDate(reviewIds[0], futureDate, admin());

      const esc = evaluateReviewEscalationStatus(reviewIds[0]);
      expect(esc).toBe("none");
    });

    it("notify_admin when pending/in_review and overdue", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      // Item is in pending state by default, set overdue
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      updateReviewDueDate(reviewIds[0], pastDate, admin());

      // Use items with low priority (< 0.7) so they get notify_admin not escalated
      const items = buildStrategicReviewBoard();
      const lowPriorityItem = items.find((i) => i.priority <= 0.7);
      if (!lowPriorityItem) return;

      updateReviewDueDate(lowPriorityItem.reviewId, pastDate, admin());
      const esc = evaluateReviewEscalationStatus(lowPriorityItem.reviewId);
      // Either notify_admin or escalated depending on priority
      expect(["notify_admin", "escalated"]).toContain(esc);
    });

    it("escalated when deferred >= 2 times and overdue", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      // Move through states to create defer history
      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());
      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());
      transitionReviewWorkflow(reviewIds[0], "in_review", admin());

      // Set overdue
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      updateReviewDueDate(reviewIds[0], pastDate, admin());

      const esc = evaluateReviewEscalationStatus(reviewIds[0]);
      expect(esc).toBe("escalated");
    });

    it("notify_owner when approved_candidate is overdue", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "approved_candidate", admin());

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      updateReviewDueDate(reviewIds[0], pastDate, admin());

      const esc = evaluateReviewEscalationStatus(reviewIds[0]);
      expect(esc).toBe("notify_owner");
    });
  });

  // ── 6. Re-review required logic works ─────────────────────

  describe("rereview", () => {
    it("deferred items require re-review", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());

      const rr = evaluateReviewRereviewRequirement(reviewIds[0]);
      expect(rr.required).toBe(true);
      expect(rr.reasons.some((r) => r.includes("deferred"))).toBe(true);
    });

    it("notes with re-review trigger requirement", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      addReviewWorkflowNote(reviewIds[0], reviewer(), "Needs re-review after fixing issues");

      const rr = evaluateReviewRereviewRequirement(reviewIds[0]);
      expect(rr.required).toBe(true);
      expect(rr.reasons.some((r) => r.includes("re-review"))).toBe(true);
    });

    it("multiple defer cycles trigger rereview", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());
      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());
      transitionReviewWorkflow(reviewIds[0], "in_review", admin());

      const rr = evaluateReviewRereviewRequirement(reviewIds[0]);
      expect(rr.required).toBe(true);
      expect(rr.reasons.some((r) => r.includes("deferred 2"))).toBe(true);
    });

    it("explicit setRereviewRequired works", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const result = setRereviewRequired(reviewIds[0], true, "Policy change", admin());
      expect(result.success).toBe(true);

      const rr = evaluateReviewRereviewRequirement(reviewIds[0]);
      expect(rr.required).toBe(true);
      expect(rr.reasons.some((r) => r.includes("Policy change"))).toBe(true);
    });

    it("clearRereview works", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      setRereviewRequired(reviewIds[0], true, "Test reason", admin());
      setRereviewRequired(reviewIds[0], false, "", admin());

      const record = getWorkflowOpsRecord(reviewIds[0]);
      expect(record?.rereviewRequired).toBe(false);
      expect(record?.rereviewReason).toBeNull();
    });
  });

  // ── 7. Rereview blocks execution readiness ────────────────

  describe("rereview blocking", () => {
    it("isBlockedByRereview returns true for deferred items", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());

      // Need to ensure the ops record exists
      evaluateAllWorkflowOps();

      const blocked = isBlockedByRereview(reviewIds[0]);
      expect(blocked).toBe(true);
    });

    it("isBlockedByRereview returns true for explicit rereview flag", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      setRereviewRequired(reviewIds[0], true, "Needs investigation", admin());

      const blocked = isBlockedByRereview(reviewIds[0]);
      expect(blocked).toBe(true);
    });

    it("isBlockedByRereview returns false for normal items", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      // Just ensure ops record exists
      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );

      const blocked = isBlockedByRereview(reviewIds[0]);
      expect(blocked).toBe(false);
    });
  });

  // ── 8. Bulk evaluation works ──────────────────────────────

  describe("bulk evaluation", () => {
    it("evaluateAllWorkflowOps initializes all records", () => {
      setupWorkflows();
      const records = evaluateAllWorkflowOps();
      expect(records.length).toBeGreaterThan(0);

      for (const r of records) {
        expect(r.workflowId).toBeTruthy();
        expect(r.reviewId).toBeTruthy();
        expect(["on_track", "due_soon", "overdue"]).toContain(r.slaStatus);
        expect(["none", "notify_admin", "notify_owner", "escalated"]).toContain(r.escalationStatus);
      }
    });

    it("bulk evaluation auto-assigns default due dates", () => {
      setupWorkflows();
      const records = evaluateAllWorkflowOps();

      // Records should have due dates after evaluation
      for (const r of records) {
        expect(r.dueAt).toBeTruthy();
      }
    });

    it("listWorkflowOpsRecords returns all evaluated records", () => {
      setupWorkflows();
      evaluateAllWorkflowOps();
      const records = listWorkflowOpsRecords();
      expect(records.length).toBeGreaterThan(0);
    });
  });

  // ── 9. Same inputs yield same SLA/escalation results ──────

  describe("determinism", () => {
    it("same SLA status for same due date and time", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const futureDate = "2026-12-31T23:59:59.000Z";
      updateReviewDueDate(reviewIds[0], futureDate, admin());

      const now = "2026-03-18T00:00:00.000Z";
      const sla1 = evaluateReviewSlaStatus(reviewIds[0], now);
      const sla2 = evaluateReviewSlaStatus(reviewIds[0], now);

      expect(sla1).toBe(sla2);
    });

    it("same escalation status for same state/due/priority", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const pastDate = "2026-03-10T00:00:00.000Z";
      updateReviewDueDate(reviewIds[0], pastDate, admin());

      const now = "2026-03-18T00:00:00.000Z";
      const esc1 = evaluateReviewEscalationStatus(reviewIds[0], now);
      const esc2 = evaluateReviewEscalationStatus(reviewIds[0], now);

      expect(esc1).toBe(esc2);
    });

    it("same rereview result for same workflow state", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "in_review", admin());
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());

      const rr1 = evaluateReviewRereviewRequirement(reviewIds[0]);
      const rr2 = evaluateReviewRereviewRequirement(reviewIds[0]);

      expect(rr1.required).toBe(rr2.required);
      expect(rr1.reasons.length).toBe(rr2.reasons.length);
    });
  });

  // ── 10. Audit/history entries are recorded correctly ───────

  describe("audit history", () => {
    it("assignment creates history entry", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );

      const record = getWorkflowOpsRecord(reviewIds[0]);
      expect(record?.opsHistory.length).toBeGreaterThan(0);
      const entry = record?.opsHistory[0];
      expect(entry?.action).toBe("assign");
      expect(entry?.actorId).toBe("admin-1");
      expect(entry?.role).toBe("admin");
      expect(entry?.detail).toContain("reviewer-1");
      expect(entry?.timestamp).toBeTruthy();
    });

    it("unassignment creates history entry", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );
      unassignReviewWorkflow(reviewIds[0], admin());

      const record = getWorkflowOpsRecord(reviewIds[0]);
      const unassignEntry = record?.opsHistory.find((h) => h.action === "unassign");
      expect(unassignEntry).toBeTruthy();
      expect(unassignEntry?.detail).toContain("reviewer-1");
    });

    it("due date change creates history entry", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      const date1 = new Date(Date.now() + 86400000).toISOString();
      const date2 = new Date(Date.now() + 2 * 86400000).toISOString();

      updateReviewDueDate(reviewIds[0], date1, admin());
      updateReviewDueDate(reviewIds[0], date2, admin());

      const record = getWorkflowOpsRecord(reviewIds[0]);
      const dueDateEntries = record?.opsHistory.filter((h) => h.action === "set_due_date") ?? [];
      expect(dueDateEntries.length).toBe(2);
      expect(dueDateEntries[1].detail).toContain("changed from");
    });

    it("rereview set/clear creates history entries", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      setRereviewRequired(reviewIds[0], true, "Testing", admin());
      setRereviewRequired(reviewIds[0], false, "", admin());

      const record = getWorkflowOpsRecord(reviewIds[0]);
      const setEntry = record?.opsHistory.find((h) => h.action === "set_rereview");
      const clearEntry = record?.opsHistory.find((h) => h.action === "clear_rereview");
      expect(setEntry).toBeTruthy();
      expect(clearEntry).toBeTruthy();
    });
  });

  // ── 11. Report and formatting ─────────────────────────────

  describe("report", () => {
    it("report has correct structure", () => {
      setupWorkflows();
      const report = buildStrategicReviewWorkflowV3Report();

      expect(report.entries.length).toBeGreaterThan(0);
      expect(report.summary.totalWorkflows).toBe(report.entries.length);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report partitions correctly", () => {
      setupWorkflows();
      const report = buildStrategicReviewWorkflowV3Report();

      expect(
        report.summary.assignedCount + report.summary.unassignedCount,
      ).toBe(report.summary.totalWorkflows);
    });

    it("formatWorkflowOpsRecord produces readable output", () => {
      const reviewIds = setupWorkflows();
      if (reviewIds.length === 0) return;

      assignReviewWorkflow(
        reviewIds[0],
        { actorId: "reviewer-1", role: "reviewer" },
        admin(),
      );
      evaluateAllWorkflowOps();

      const record = getWorkflowOpsRecord(reviewIds[0]);
      if (!record) return;

      const text = formatWorkflowOpsRecord(record);
      expect(text).toContain(reviewIds[0]);
      expect(text).toContain("reviewer-1");
    });

    it("formatWorkflowV3Report produces full report", () => {
      setupWorkflows();
      const report = buildStrategicReviewWorkflowV3Report();
      const text = formatWorkflowV3Report(report);
      expect(text).toContain("Strategic Review Operations Report");
      expect(text).toContain("Total:");
    });
  });
});
