import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  initializeReviewWorkflow,
  initializeAllReviewWorkflows,
  transitionReviewWorkflow,
  validateReviewTransition,
  addReviewWorkflowNote,
  getReviewWorkflow,
  listReviewWorkflows,
  listReviewWorkflowHistory,
  listWorkflowsByState,
  isApprovedForExecution,
  buildStrategicReviewWorkflowReport,
  formatWorkflowRecord,
  formatWorkflowReport,
  useInMemoryStore,
  clearInMemoryStore,
  ALL_WORKFLOW_STATES,
  type WorkflowState,
} from "../strategic-review-workflow";
import { resolveActorRole, type FactoryActor } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function owner(): FactoryActor {
  return resolveActorRole("owner-1", "owner");
}

function admin(): FactoryActor {
  return resolveActorRole("admin-1", "admin");
}

function reviewer(): FactoryActor {
  return resolveActorRole("reviewer-1", "reviewer");
}

function operator(): FactoryActor {
  return resolveActorRole("operator-1", "operator");
}

function viewer(): FactoryActor {
  return resolveActorRole("viewer-1", "viewer");
}

const TEST_REVIEW = "review-expand_reservation_3";

// ---------------------------------------------------------------------------

describe("Strategic Review Workflow", () => {
  beforeEach(() => {
    useInMemoryStore();
  });

  afterEach(() => {
    clearInMemoryStore();
  });

  // ── 1. Workflow initializes in pending ──────────────────────

  describe("initialization", () => {
    it("initializes workflow in pending state", () => {
      const wf = initializeReviewWorkflow(TEST_REVIEW);
      expect(wf.currentState).toBe("pending");
      expect(wf.reviewId).toBe(TEST_REVIEW);
      expect(wf.workflowId).toBe(`wf-${TEST_REVIEW}`);
      expect(wf.history).toHaveLength(0);
      expect(wf.notes).toHaveLength(0);
    });

    it("returns existing workflow on re-initialization", () => {
      const wf1 = initializeReviewWorkflow(TEST_REVIEW);
      // Transition it
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      const wf2 = initializeReviewWorkflow(TEST_REVIEW);
      expect(wf2.currentState).toBe("in_review");
      expect(wf2.workflowId).toBe(wf1.workflowId);
    });

    it("initializes all review board workflows", () => {
      const workflows = initializeAllReviewWorkflows();
      expect(workflows.length).toBeGreaterThan(0);
      for (const wf of workflows) {
        expect(wf.currentState).toBe("pending");
      }
    });
  });

  // ── 2. Valid transitions succeed ────────────────────────────

  describe("valid transitions", () => {
    it("pending → in_review succeeds for admin", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      expect(result.success).toBe(true);
      expect(result.workflow?.currentState).toBe("in_review");
    });

    it("in_review → approved_candidate succeeds for admin", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      expect(result.success).toBe(true);
      expect(result.workflow?.currentState).toBe("approved_candidate");
    });

    it("approved_candidate → approved_for_execution succeeds for admin", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", admin());
      expect(result.success).toBe(true);
      expect(result.workflow?.currentState).toBe("approved_for_execution");
    });

    it("in_review → deferred succeeds for reviewer", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "deferred", reviewer());
      expect(result.success).toBe(true);
      expect(result.workflow?.currentState).toBe("deferred");
    });

    it("deferred → in_review re-opens review", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "deferred", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      expect(result.success).toBe(true);
      expect(result.workflow?.currentState).toBe("in_review");
    });

    it("approved_for_execution → archived succeeds", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "archived", admin());
      expect(result.success).toBe(true);
      expect(result.workflow?.currentState).toBe("archived");
    });

    it("rejected → archived succeeds", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "rejected", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "archived", admin());
      expect(result.success).toBe(true);
    });

    it("full lifecycle: pending → in_review → approved_candidate → approved_for_execution → archived", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", reviewer());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "archived", owner());
      expect(result.success).toBe(true);
      expect(result.workflow?.history).toHaveLength(4);
    });
  });

  // ── 3. Invalid transitions are blocked ──────────────────────

  describe("invalid transitions", () => {
    it("pending → approved_candidate is invalid", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain("not allowed");
    });

    it("pending → approved_for_execution is invalid", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", admin());
      expect(result.success).toBe(false);
    });

    it("archived → pending is invalid", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "rejected", admin());
      transitionReviewWorkflow(TEST_REVIEW, "archived", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "pending" as WorkflowState, admin());
      expect(result.success).toBe(false);
    });

    it("nonexistent workflow returns failure", () => {
      const result = transitionReviewWorkflow("nonexistent", "in_review", admin());
      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain("not found");
    });

    it("in_review → archived is invalid (must go through candidate)", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "archived", admin());
      expect(result.success).toBe(false);
    });
  });

  // ── 4. Role restrictions are enforced ───────────────────────

  describe("role restrictions", () => {
    it("reviewer cannot transition to approved_candidate", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", reviewer());
      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain("reviewer");
    });

    it("reviewer cannot transition to approved_for_execution", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", reviewer());
      expect(result.success).toBe(false);
    });

    it("operator cannot perform any transition", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = transitionReviewWorkflow(TEST_REVIEW, "in_review", operator());
      expect(result.success).toBe(false);
      expect(result.reasons[0]).toContain("operator");
    });

    it("viewer cannot perform any transition", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = transitionReviewWorkflow(TEST_REVIEW, "in_review", viewer());
      expect(result.success).toBe(false);
    });

    it("owner can perform all transitions", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      expect(transitionReviewWorkflow(TEST_REVIEW, "in_review", owner()).success).toBe(true);
      expect(transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", owner()).success).toBe(true);
      expect(transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", owner()).success).toBe(true);
      expect(transitionReviewWorkflow(TEST_REVIEW, "archived", owner()).success).toBe(true);
    });

    it("reviewer can start review (pending → in_review)", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = transitionReviewWorkflow(TEST_REVIEW, "in_review", reviewer());
      expect(result.success).toBe(true);
    });

    it("reviewer can defer from in_review", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      const result = transitionReviewWorkflow(TEST_REVIEW, "deferred", reviewer());
      expect(result.success).toBe(true);
    });
  });

  // ── 5. Notes are recorded correctly ─────────────────────────

  describe("notes", () => {
    it("adds note to workflow", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = addReviewWorkflowNote(
        TEST_REVIEW,
        reviewer(),
        "Parent template is stable",
      );
      expect(result.success).toBe(true);
      expect(result.workflow?.notes).toHaveLength(1);
      expect(result.workflow?.notes[0].message).toBe("Parent template is stable");
      expect(result.workflow?.notes[0].actorId).toBe("reviewer-1");
    });

    it("viewer cannot add notes", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = addReviewWorkflowNote(
        TEST_REVIEW,
        viewer(),
        "Some comment",
      );
      expect(result.success).toBe(false);
      expect(result.reason).toContain("Viewers cannot");
    });

    it("operator can add notes", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const result = addReviewWorkflowNote(
        TEST_REVIEW,
        operator(),
        "Ops perspective: looks stable",
      );
      expect(result.success).toBe(true);
    });

    it("multiple notes are preserved in order", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      addReviewWorkflowNote(TEST_REVIEW, reviewer(), "Note 1");
      addReviewWorkflowNote(TEST_REVIEW, admin(), "Note 2");
      addReviewWorkflowNote(TEST_REVIEW, reviewer(), "Note 3");
      const wf = getReviewWorkflow(TEST_REVIEW);
      expect(wf?.notes).toHaveLength(3);
      expect(wf?.notes[0].message).toBe("Note 1");
      expect(wf?.notes[2].message).toBe("Note 3");
    });

    it("note on nonexistent workflow fails", () => {
      const result = addReviewWorkflowNote(
        "nonexistent",
        admin(),
        "test",
      );
      expect(result.success).toBe(false);
    });
  });

  // ── 6. History is recorded correctly ────────────────────────

  describe("history", () => {
    it("records transitions in history", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", reviewer());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());

      const history = listReviewWorkflowHistory(TEST_REVIEW);
      expect(history).not.toBeNull();
      expect(history!.transitions).toHaveLength(2);
      expect(history!.transitions[0].from).toBe("pending");
      expect(history!.transitions[0].to).toBe("in_review");
      expect(history!.transitions[0].actorId).toBe("reviewer-1");
      expect(history!.transitions[1].from).toBe("in_review");
      expect(history!.transitions[1].to).toBe("approved_candidate");
      expect(history!.transitions[1].actorId).toBe("admin-1");
    });

    it("history includes timestamps", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());

      const history = listReviewWorkflowHistory(TEST_REVIEW);
      expect(history!.transitions[0].timestamp).toBeTruthy();
    });

    it("history for nonexistent workflow returns null", () => {
      expect(listReviewWorkflowHistory("nonexistent")).toBeNull();
    });

    it("failed transitions do not appear in history", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin()); // invalid
      const history = listReviewWorkflowHistory(TEST_REVIEW);
      expect(history!.transitions).toHaveLength(0);
    });
  });

  // ── 7. Governance integration ──────────────────────────────

  describe("governance linkage", () => {
    it("approved_for_execution is recognized", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_for_execution", admin());
      expect(isApprovedForExecution(TEST_REVIEW)).toBe(true);
    });

    it("approved_candidate is NOT execution-ready", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "approved_candidate", admin());
      expect(isApprovedForExecution(TEST_REVIEW)).toBe(false);
    });

    it("pending is NOT execution-ready", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      expect(isApprovedForExecution(TEST_REVIEW)).toBe(false);
    });

    it("deferred is NOT execution-ready", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "deferred", admin());
      expect(isApprovedForExecution(TEST_REVIEW)).toBe(false);
    });

    it("rejected is NOT execution-ready", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      transitionReviewWorkflow(TEST_REVIEW, "rejected", admin());
      expect(isApprovedForExecution(TEST_REVIEW)).toBe(false);
    });
  });

  // ── 8. Query functions ─────────────────────────────────────

  describe("query", () => {
    it("listWorkflowsByState returns matching workflows", () => {
      initializeReviewWorkflow("review-a");
      initializeReviewWorkflow("review-b");
      transitionReviewWorkflow("review-a", "in_review", admin());

      expect(listWorkflowsByState("pending")).toHaveLength(1);
      expect(listWorkflowsByState("in_review")).toHaveLength(1);
    });

    it("listReviewWorkflows returns all", () => {
      initializeReviewWorkflow("review-a");
      initializeReviewWorkflow("review-b");
      expect(listReviewWorkflows()).toHaveLength(2);
    });

    it("getReviewWorkflow returns null for nonexistent", () => {
      expect(getReviewWorkflow("nonexistent")).toBeNull();
    });
  });

  // ── 9. Determinism ─────────────────────────────────────────

  describe("determinism", () => {
    it("same inputs yield same workflow state", () => {
      initializeReviewWorkflow("review-x");
      transitionReviewWorkflow("review-x", "in_review", admin());
      const state1 = getReviewWorkflow("review-x")?.currentState;

      // Reset and replay
      clearInMemoryStore();
      useInMemoryStore();
      initializeReviewWorkflow("review-x");
      transitionReviewWorkflow("review-x", "in_review", admin());
      const state2 = getReviewWorkflow("review-x")?.currentState;

      expect(state1).toBe(state2);
    });

    it("same transition validation produces same result", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      const v1 = validateReviewTransition(TEST_REVIEW, "approved_candidate", admin());
      const v2 = validateReviewTransition(TEST_REVIEW, "approved_candidate", admin());
      expect(v1.valid).toBe(v2.valid);
      expect(v1.reasons).toEqual(v2.reasons);
    });

    it("all workflow states are defined", () => {
      expect(ALL_WORKFLOW_STATES).toHaveLength(7);
    });
  });

  // ── 10. No mutation outside workflow ────────────────────────

  describe("isolation", () => {
    it("workflow operations only affect workflow store", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", admin());
      addReviewWorkflowNote(TEST_REVIEW, admin(), "test note");

      // Verify only workflow is affected
      const wf = getReviewWorkflow(TEST_REVIEW);
      expect(wf).not.toBeNull();
      expect(wf?.currentState).toBe("in_review");
      expect(wf?.notes).toHaveLength(1);
    });

    it("clearInMemoryStore removes all workflows", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      clearInMemoryStore();
      useInMemoryStore();
      expect(getReviewWorkflow(TEST_REVIEW)).toBeNull();
    });
  });

  // ── 11. Report ─────────────────────────────────────────────

  describe("report", () => {
    it("report has correct structure", () => {
      const report = buildStrategicReviewWorkflowReport();
      expect(report.workflows.length).toBeGreaterThan(0);
      expect(report.summary.totalWorkflows).toBe(report.workflows.length);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report partitions by state correctly", () => {
      const report = buildStrategicReviewWorkflowReport();
      const total =
        report.pendingItems.length +
        report.inReviewItems.length +
        report.approvedCandidateItems.length +
        report.approvedForExecutionItems.length +
        report.deferredItems.length +
        report.rejectedItems.length +
        report.archivedItems.length;
      expect(total).toBe(report.summary.totalWorkflows);
    });

    it("report entries have domain and priority info", () => {
      const report = buildStrategicReviewWorkflowReport();
      for (const entry of report.workflows) {
        expect(entry.domain).toBeTruthy();
        expect(typeof entry.priority).toBe("number");
        expect(entry.risk).toBeTruthy();
      }
    });
  });

  // ── 12. Formatting ─────────────────────────────────────────

  describe("formatting", () => {
    it("formatWorkflowRecord produces readable output", () => {
      initializeReviewWorkflow(TEST_REVIEW);
      transitionReviewWorkflow(TEST_REVIEW, "in_review", reviewer());
      const wf = getReviewWorkflow(TEST_REVIEW)!;
      const text = formatWorkflowRecord(wf);
      expect(text).toContain("[IN REVIEW]");
      expect(text).toContain(TEST_REVIEW);
      expect(text).toContain("reviewer-1");
    });

    it("formatWorkflowReport produces full report", () => {
      const report = buildStrategicReviewWorkflowReport();
      const text = formatWorkflowReport(report);
      expect(text).toContain("Strategic Review Workflow Report");
      expect(text).toContain("Pending");
    });
  });
});
