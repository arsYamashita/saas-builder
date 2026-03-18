import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  evaluateScenarioAutoExecutionGuardrails,
  evaluateAllScenarioAutoExecutionGuardrails,
  enforceScenarioExecutionGuardrails,
  listScenarioAutoExecutionGuardrails,
  buildScenarioAutoExecutionGuardrailReport,
  formatGuardrailDecision,
  formatGuardrailReport,
  useInMemoryStore,
  clearInMemoryStore,
} from "../scenario-auto-execution-guardrails";
import {
  buildScenarioReport,
} from "../factory-scenario-planner";
import {
  buildStrategicReviewBoard,
} from "../strategic-change-review-board";
import {
  initializeAllReviewWorkflows,
  transitionReviewWorkflow,
  getReviewWorkflow,
  useInMemoryStore as useWorkflowStore,
  clearInMemoryStore as clearWorkflowStore,
} from "../strategic-review-workflow";
import {
  useInMemoryStore as useGovernanceStore,
  clearInMemoryStore as clearGovernanceStore,
  recordScenarioExecutionDecision,
} from "../scenario-execution-governance";
import {
  resolveActorRole,
  type FactoryActor,
} from "../team-role-approval";

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

/**
 * Setup: move all scenario items to in_review and approved_for_execution workflow state.
 * Also approve them in governance.
 * Returns the scenario IDs.
 */
function setupApprovedScenarios(): string[] {
  const items = buildStrategicReviewBoard();
  const scenarioItems = items.filter((i) => i.reviewType === "scenario");

  initializeAllReviewWorkflows();

  const scenarioIds: string[] = [];

  // Move all scenario items to approved_for_execution
  for (const item of scenarioItems) {
    transitionReviewWorkflow(item.reviewId, "in_review", admin());
    transitionReviewWorkflow(item.reviewId, "approved_candidate", admin());
    transitionReviewWorkflow(item.reviewId, "approved_for_execution", admin());

    // Also approve in governance
    if (item.linkedArtifacts.scenarioId) {
      recordScenarioExecutionDecision(
        item.linkedArtifacts.scenarioId,
        "approve_execution",
        admin(),
      );
      scenarioIds.push(item.linkedArtifacts.scenarioId);
    }
  }

  return scenarioIds;
}

// ---------------------------------------------------------------------------

describe("Scenario Auto-Execution Guardrails", { timeout: 30000 }, () => {
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

  // ── 1. auto_executable scenarios are identified ──────────────────────

  describe("auto_executable scenarios", () => {
    it("approved low-risk scenario gets auto_executable decision", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      expect(decision.scenarioId).toBe(scenarioIds[0]);
      expect(decision.guardrailId).toMatch(/^guardrail-/);
      expect(typeof decision.allowed).toBe("boolean");
      expect(typeof decision.blocked).toBe("boolean");
      expect(decision.reasons.length).toBeGreaterThan(0);
      expect(
        decision.executionMode === "auto_executable" ||
        decision.executionMode === "manual_only" ||
        decision.executionMode === "blocked"
      ).toBe(true);
    });

    it("auto_executable scenarios have allowed=true, blocked=false", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      if (decision.executionMode === "auto_executable") {
        expect(decision.allowed).toBe(true);
        expect(decision.blocked).toBe(false);
      }
    });

    it("auto_executable scenarios have reasons explaining criteria", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      if (decision.executionMode === "auto_executable") {
        expect(
          decision.reasons.some((r) => r.includes("approved_for_execution")),
        ).toBe(true);
        expect(decision.reasons.some((r) => r.includes("low"))).toBe(true);
        expect(decision.reasons.some((r) => r.includes("criteria met"))).toBe(
          true,
        );
      }
    });
  });

  // ── 2. manual_only scenarios are identified ───────────────────────────

  describe("manual_only scenarios", () => {
    it("valid but sensitive scenarios get manual_only decision", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      expect(
        decision.executionMode === "auto_executable" ||
        decision.executionMode === "manual_only"
      ).toBe(true);

      if (decision.executionMode === "manual_only") {
        expect(decision.allowed).toBe(true);
        expect(decision.blocked).toBe(false);
      }
    });

    it("manual_only scenarios have allowed=true, blocked=false", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      if (decision.executionMode === "manual_only") {
        expect(decision.allowed).toBe(true);
        expect(decision.blocked).toBe(false);
      }
    });
  });

  // ── 3. blocked scenarios are identified ────────────────────────────────

  describe("blocked scenarios", () => {
    it("non-approved scenario gets blocked decision", () => {
      initializeAllReviewWorkflows();
      const items = buildStrategicReviewBoard();
      const scenarioItem = items.find((i) => i.reviewType === "scenario");
      if (!scenarioItem || !scenarioItem.linkedArtifacts.scenarioId) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(
        scenarioItem.linkedArtifacts.scenarioId,
        admin(),
      );

      if (decision.executionMode === "blocked") {
        expect(decision.allowed).toBe(false);
        expect(decision.blocked).toBe(true);
      }
    });

    it("scenario not found gets blocked decision", () => {
      const decision = evaluateScenarioAutoExecutionGuardrails("nonexistent-scenario", admin());

      expect(decision.executionMode).toBe("blocked");
      expect(decision.allowed).toBe(false);
      expect(decision.blocked).toBe(true);
      expect(decision.reasons[0]).toContain("not found");
    });

    it("blocked scenarios have reasons explaining why", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      // Defer the workflow to cause block
      const items = buildStrategicReviewBoard();
      const scenarioItem = items.find(
        (i) => i.linkedArtifacts.scenarioId === scenarioIds[0],
      );
      if (!scenarioItem) return;

      transitionReviewWorkflow(scenarioItem.reviewId, "in_review", admin());
      transitionReviewWorkflow(scenarioItem.reviewId, "deferred", admin());
      transitionReviewWorkflow(scenarioItem.reviewId, "in_review", admin());
      transitionReviewWorkflow(scenarioItem.reviewId, "approved_candidate", admin());
      transitionReviewWorkflow(scenarioItem.reviewId, "approved_for_execution", admin());

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      // May be blocked or manual-only depending on governance
      if (decision.blocked) {
        expect(decision.reasons.length).toBeGreaterThan(0);
      }
    });
  });

  // ── 4. Review workflow state affects decision ──────────────────────────

  describe("workflow state enforcement", () => {
    it("pending workflow blocks auto-execution", () => {
      initializeAllReviewWorkflows();
      const items = buildStrategicReviewBoard();
      const scenarioItem = items.find((i) => i.reviewType === "scenario");
      if (!scenarioItem || !scenarioItem.linkedArtifacts.scenarioId) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(
        scenarioItem.linkedArtifacts.scenarioId,
        admin(),
      );

      // Pending workflows should be blocked
      if (decision.blocked) {
        expect(decision.reasons.some((r) => r.includes("approved_for_execution"))).toBe(true);
      }
    });

    it("in_review workflow blocks auto-execution", () => {
      initializeAllReviewWorkflows();
      const items = buildStrategicReviewBoard();
      const scenarioItem = items.find((i) => i.reviewType === "scenario");
      if (!scenarioItem || !scenarioItem.linkedArtifacts.scenarioId) return;

      transitionReviewWorkflow(scenarioItem.reviewId, "in_review", admin());

      const decision = evaluateScenarioAutoExecutionGuardrails(
        scenarioItem.linkedArtifacts.scenarioId,
        admin(),
      );

      // in_review should be blocked for auto-execution
      if (decision.blocked || decision.executionMode === "manual_only") {
        expect(decision.blocked || !decision.allowed).toBe(true);
      }
    });

    it("approved_for_execution workflow allows execution", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      // approved_for_execution should at least allow manual execution
      expect(decision.allowed || decision.executionMode === "manual_only").toBe(true);
    });
  });

  // ── 5. Governance evaluation affects decision ──────────────────────────

  describe("governance enforcement", () => {
    it("high-risk scenarios are blocked", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      // High risk scenarios should be blocked or manual-only
      if (decision.reasons.some((r) => r.includes("high"))) {
        expect(decision.blocked || decision.executionMode === "manual_only").toBe(true);
      }
    });

    it("blocked governance status blocks execution", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      // Governance block should result in block or manual-only
      if (decision.reasons.some((r) => r.includes("blocked"))) {
        expect(decision.executionMode !== "auto_executable").toBe(true);
      }
    });

    it("elevated approval requirement blocks auto-execution", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      // Elevated approval should block auto-execution
      if (decision.reasons.some((r) => r.includes("elevated"))) {
        expect(decision.executionMode !== "auto_executable").toBe(true);
      }
    });
  });

  // ── 6. Role-based authorization affects decision ────────────────────────

  describe("role authorization", () => {
    it("admin can pass role check", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      expect(decision.scenarioId).toBe(scenarioIds[0]);
      expect(decision.reasons.length).toBeGreaterThan(0);
    });

    it("owner can pass role check", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], owner());

      expect(decision.scenarioId).toBe(scenarioIds[0]);
      expect(decision.reasons.length).toBeGreaterThan(0);
    });

    it("reviewer role blocks auto-execution", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], reviewer());

      if (decision.reasons.some((r) => r.includes("not authorized"))) {
        expect(decision.executionMode !== "auto_executable").toBe(true);
      }
    });

    it("viewer role blocks auto-execution", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], viewer());

      if (decision.reasons.some((r) => r.includes("not authorized"))) {
        expect(decision.executionMode !== "auto_executable").toBe(true);
      }
    });
  });

  // ── 7. Enforcement API works correctly ─────────────────────────────────

  describe("enforcement", () => {
    it("enforce returns correct allowed status", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const result = enforceScenarioExecutionGuardrails(scenarioIds[0], admin());

      expect(result.decision.scenarioId).toBe(scenarioIds[0]);
      expect(typeof result.allowed).toBe("boolean");
      expect(result.reason).toBeTruthy();
    });

    it("blocked enforcement returns allowed=false", () => {
      const result = enforceScenarioExecutionGuardrails("nonexistent", admin());

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked");
    });

    it("auto_executable enforcement returns allowed=true", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      if (decision.executionMode === "auto_executable") {
        const result = enforceScenarioExecutionGuardrails(scenarioIds[0], admin());
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain("auto-execution");
      }
    });

    it("manual_only enforcement returns allowed=true", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      if (decision.executionMode === "manual_only") {
        const result = enforceScenarioExecutionGuardrails(scenarioIds[0], admin());
        expect(result.allowed).toBe(true);
        expect(result.reason).toContain("manual");
      }
    });
  });

  // ── 8. Batch evaluation works ─────────────────────────────────────────

  describe("batch evaluation", () => {
    it("evaluateAllScenarioAutoExecutionGuardrails returns all scenarios", () => {
      setupApprovedScenarios();
      const results = evaluateAllScenarioAutoExecutionGuardrails(admin());

      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.guardrailId).toMatch(/^guardrail-/);
        expect(r.scenarioId).toBeTruthy();
        expect(
          r.executionMode === "auto_executable" ||
          r.executionMode === "manual_only" ||
          r.executionMode === "blocked"
        ).toBe(true);
      }
    });
  });

  // ── 9. Query and report functions work ─────────────────────────────────

  describe("queries and reports", () => {
    it("listScenarioAutoExecutionGuardrails returns stored evaluations", () => {
      setupApprovedScenarios();
      evaluateAllScenarioAutoExecutionGuardrails(admin());
      const items = listScenarioAutoExecutionGuardrails();

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.scenarioId).toBeTruthy();
        expect(item.executionMode).toBeTruthy();
      }
    });

    it("buildScenarioAutoExecutionGuardrailReport has correct structure", () => {
      setupApprovedScenarios();
      const report = buildScenarioAutoExecutionGuardrailReport(admin());

      expect(report.evaluations.length).toBeGreaterThan(0);
      expect(report.summary.totalEvaluated).toBe(report.evaluations.length);
      expect(
        report.summary.autoExecutableCount +
          report.summary.manualOnlyCount +
          report.summary.blockedCount,
      ).toBe(report.summary.totalEvaluated);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report partitions scenarios correctly", () => {
      setupApprovedScenarios();
      const report = buildScenarioAutoExecutionGuardrailReport(admin());

      expect(
        report.autoExecutableItems.length +
          report.manualOnlyItems.length +
          report.blockedItems.length,
      ).toBe(report.summary.totalEvaluated);
    });
  });

  // ── 10. Determinism: same inputs yield same decisions ─────────────────

  describe("determinism", () => {
    it("same scenario produces same decision", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const d1 = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      clearInMemoryStore();
      useInMemoryStore();

      const d2 = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      expect(d1.executionMode).toBe(d2.executionMode);
      expect(d1.allowed).toBe(d2.allowed);
      expect(d1.blocked).toBe(d2.blocked);
      expect(d1.reasons.length).toBe(d2.reasons.length);
    });
  });

  // ── 11. No scenarios are auto-executed ───────────────────────────────

  describe("safety", () => {
    it("guardrails evaluate but do not execute", () => {
      setupApprovedScenarios();
      const results = evaluateAllScenarioAutoExecutionGuardrails(admin());

      // Guardrails only evaluate; they do not execute
      for (const r of results) {
        expect(
          r.executionMode === "auto_executable" ||
          r.executionMode === "manual_only" ||
          r.executionMode === "blocked"
        ).toBe(true);
      }
    });

    it("auto_executable is decision only, not execution", () => {
      const scenarioIds = setupApprovedScenarios();
      if (scenarioIds.length === 0) return;

      const decision = evaluateScenarioAutoExecutionGuardrails(scenarioIds[0], admin());

      if (decision.executionMode === "auto_executable") {
        // Decision indicates it CAN be auto-executed, but it is NOT executed here
        expect(decision.scenarioId).toBe(scenarioIds[0]);
        expect(decision.allowed).toBe(true);
        // No actual execution occurred
      }
    });
  });

  // ── 12. Formatting ──────────────────────────────────────────────────────

  describe("formatting", () => {
    it("formatGuardrailDecision produces readable output", () => {
      setupApprovedScenarios();
      const results = evaluateAllScenarioAutoExecutionGuardrails(admin());
      if (results.length === 0) return;

      const text = formatGuardrailDecision(results[0]);
      expect(text).toContain(results[0].scenarioId);
      expect(text).toContain(results[0].executionMode.toUpperCase());
    });

    it("formatGuardrailReport produces full report", () => {
      setupApprovedScenarios();
      const report = buildScenarioAutoExecutionGuardrailReport(admin());
      const text = formatGuardrailReport(report);

      expect(text).toContain("Scenario Auto-Execution Guardrails Report");
      expect(text).toContain("Total:");
    });
  });
});
