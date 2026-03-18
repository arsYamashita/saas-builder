import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  evaluateScenarioAutoPromotion,
  evaluateAllScenarioAutoPromotions,
  applyScenarioAutoPromotions,
  listScenarioAutoPromotionDecisions,
  buildScenarioAutoPromotionReport,
  formatAutoPromotionResult,
  formatAutoPromotionReport,
  useInMemoryStore,
  clearInMemoryStore,
} from "../scenario-auto-promotion";
import {
  buildStrategicReviewBoard,
} from "../strategic-change-review-board";
import {
  initializeAllReviewWorkflows,
  initializeReviewWorkflow,
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

/**
 * Setup: initialize workflows and move all scenario items to in_review.
 * Returns the review IDs of scenario items.
 */
function setupScenarioWorkflows(): string[] {
  const items = buildStrategicReviewBoard();
  const scenarioItems = items.filter((i) => i.reviewType === "scenario");

  initializeAllReviewWorkflows();

  // Move all scenario items to in_review
  for (const item of scenarioItems) {
    transitionReviewWorkflow(item.reviewId, "in_review", admin());
  }

  return scenarioItems.map((i) => i.reviewId);
}

// ---------------------------------------------------------------------------

describe("Scenario Auto-Promotion", { timeout: 30000 }, () => {
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

  // ── 1. Eligible in_review scenario is marked auto-promotable ─

  describe("eligible scenarios", () => {
    it("evaluates scenario items for auto-promotion", () => {
      const reviewIds = setupScenarioWorkflows();
      expect(reviewIds.length).toBeGreaterThan(0);

      const results = evaluateAllScenarioAutoPromotions();
      expect(results.length).toBe(reviewIds.length);

      // Each result has expected structure
      for (const r of results) {
        expect(r.autoPromotionId).toMatch(/^autopromote-/);
        expect(r.reviewId).toBeTruthy();
        expect(typeof r.eligible).toBe("boolean");
        expect(r.reasons.length).toBeGreaterThan(0);
        expect(r.toState).toBe("approved_candidate");
      }
    });

    it("eligible items have decision auto_promote", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      const eligible = results.filter((r) => r.eligible);

      for (const r of eligible) {
        expect(r.decision).toBe("auto_promote");
        expect(r.fromState).toBe("in_review");
        expect(r.toState).toBe("approved_candidate");
      }
    });

    it("eligible items have reasons explaining why", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      const eligible = results.filter((r) => r.eligible);

      for (const r of eligible) {
        expect(r.reasons.some((reason) => reason.includes("ready"))).toBe(true);
        expect(r.reasons.some((reason) => reason.includes("low"))).toBe(true);
        expect(r.reasons.some((reason) => reason.includes("approve"))).toBe(true);
      }
    });
  });

  // ── 2. Blocked/high-risk/elevated scenarios are not eligible ─

  describe("ineligible scenarios", () => {
    it("not-eligible items have decision no_action", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      const notEligible = results.filter((r) => !r.eligible);

      for (const r of notEligible) {
        expect(r.decision).toBe("no_action");
      }
    });

    it("ineligible items have reasons explaining why", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      const notEligible = results.filter((r) => !r.eligible);

      for (const r of notEligible) {
        expect(r.reasons.length).toBeGreaterThan(0);
        // Should mention at least one failing criterion
        const hasReason = r.reasons.some(
          (reason) =>
            reason.includes("not") ||
            reason.includes("blocked") ||
            reason.includes("elevated") ||
            reason.includes("caution") ||
            reason.includes("high") ||
            reason.includes("medium") ||
            reason.includes("defer") ||
            reason.includes("reject") ||
            reason.includes("needs_investigation"),
        );
        expect(hasReason).toBe(true);
      }
    });

    it("review item not found returns not eligible", () => {
      const result = evaluateScenarioAutoPromotion("nonexistent-review");
      expect(result.eligible).toBe(false);
      expect(result.reasons[0]).toContain("not found");
    });
  });

  // ── 3. Only in_review items can advance ─────────────────────

  describe("state restrictions", () => {
    it("pending items are not eligible", () => {
      initializeAllReviewWorkflows();
      const items = buildStrategicReviewBoard();
      const scenarioItem = items.find((i) => i.reviewType === "scenario");
      if (!scenarioItem) return;

      const result = evaluateScenarioAutoPromotion(scenarioItem.reviewId);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("pending"))).toBe(true);
    });

    it("approved_candidate items are not eligible (already advanced)", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      // Move one to approved_candidate
      transitionReviewWorkflow(reviewIds[0], "approved_candidate", admin());

      const result = evaluateScenarioAutoPromotion(reviewIds[0]);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("approved_candidate"))).toBe(true);
    });

    it("deferred items are not eligible", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      transitionReviewWorkflow(reviewIds[0], "deferred", admin());

      const result = evaluateScenarioAutoPromotion(reviewIds[0]);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("deferred"))).toBe(true);
    });
  });

  // ── 4. Apply mode uses workflow transition correctly ────────

  describe("apply mode", () => {
    it("apply promotes eligible items via workflow transition", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(admin());

      const promoted = results.filter((r) => r.applied);
      for (const r of promoted) {
        const wf = getReviewWorkflow(r.reviewId);
        expect(wf?.currentState).toBe("approved_candidate");
      }
    });

    it("apply for specific review works", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      const results = applyScenarioAutoPromotions(admin(), undefined, reviewIds[0]);
      expect(results).toHaveLength(1);
    });

    it("applied results have applied=true", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(admin());
      const promoted = results.filter((r) => r.applied);

      for (const r of promoted) {
        expect(r.applied).toBe(true);
        expect(r.reasons.some((reason) => reason.includes("Applied by"))).toBe(true);
      }
    });

    it("not-eligible items are not applied", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(admin());
      const notEligible = results.filter((r) => !r.eligible);

      for (const r of notEligible) {
        expect(r.applied).toBe(false);
      }
    });
  });

  // ── 5. Unauthorized apply attempts are blocked ──────────────

  describe("authorization", () => {
    it("reviewer cannot apply auto-promotions", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(reviewer());
      expect(results).toHaveLength(0);
    });

    it("viewer cannot apply auto-promotions", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(viewer());
      expect(results).toHaveLength(0);
    });

    it("owner can apply auto-promotions", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(owner());
      expect(results.length).toBeGreaterThan(0);
    });

    it("admin can apply auto-promotions", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(admin());
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── 6. Decisions include explainable reasons ────────────────

  describe("reasons", () => {
    it("eligible decisions list passing criteria", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      const eligible = results.filter((r) => r.eligible);

      for (const r of eligible) {
        expect(r.reasons.some((reason) => reason.includes("criteria met"))).toBe(true);
      }
    });

    it("ineligible decisions list failing criteria", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      const notEligible = results.filter((r) => !r.eligible);

      // Each should have at least one reason that is not just a passing criterion
      for (const r of notEligible) {
        expect(r.reasons.length).toBeGreaterThan(0);
      }
    });
  });

  // ── 7. Report/history is deterministic ──────────────────────

  describe("report", () => {
    it("report has correct structure", () => {
      setupScenarioWorkflows();
      const report = buildScenarioAutoPromotionReport();

      expect(report.evaluations.length).toBeGreaterThan(0);
      expect(report.summary.totalEvaluated).toBe(report.evaluations.length);
      expect(
        report.summary.eligibleCount + report.summary.notEligibleCount,
      ).toBe(report.summary.totalEvaluated);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report partitions correctly", () => {
      setupScenarioWorkflows();
      const report = buildScenarioAutoPromotionReport();

      expect(
        report.eligibleItems.length + report.notEligibleItems.length,
      ).toBe(report.summary.totalEvaluated);
    });

    it("listScenarioAutoPromotionDecisions returns stored evaluations", () => {
      setupScenarioWorkflows();
      evaluateAllScenarioAutoPromotions();
      const decisions = listScenarioAutoPromotionDecisions();
      expect(decisions.length).toBeGreaterThan(0);
    });
  });

  // ── 8. Notes affect eligibility ────────────────────────────

  describe("note-based gating", () => {
    it("review with reject note is not eligible", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      addReviewWorkflowNote(reviewIds[0], reviewer(), "Should reject this scenario");
      const result = evaluateScenarioAutoPromotion(reviewIds[0]);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("deferral or rejection"))).toBe(true);
    });

    it("review with defer note is not eligible", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      addReviewWorkflowNote(reviewIds[0], reviewer(), "Defer this until next quarter");
      const result = evaluateScenarioAutoPromotion(reviewIds[0]);
      expect(result.eligible).toBe(false);
    });

    it("review with neutral note remains eligible if criteria met", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      addReviewWorkflowNote(reviewIds[0], reviewer(), "Looks good overall");
      const result = evaluateScenarioAutoPromotion(reviewIds[0]);
      // May or may not be eligible depending on other criteria, but note shouldn't block
      if (result.eligible) {
        expect(result.reasons.every((r) => !r.includes("deferral"))).toBe(true);
      }
    });
  });

  // ── 9. Same inputs yield same decisions ─────────────────────

  describe("determinism", () => {
    it("same scenario produces same eligibility", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      const r1 = evaluateScenarioAutoPromotion(reviewIds[0]);

      // Reset auto-promotion store only and re-evaluate
      clearInMemoryStore();
      useInMemoryStore();

      const r2 = evaluateScenarioAutoPromotion(reviewIds[0]);
      expect(r1.eligible).toBe(r2.eligible);
      expect(r1.decision).toBe(r2.decision);
    });

    it("evaluation decisions are deterministic for same review", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      // Evaluate first and second item, check consistency
      const r1 = evaluateScenarioAutoPromotion(reviewIds[0]);
      clearInMemoryStore();
      useInMemoryStore();
      const r2 = evaluateScenarioAutoPromotion(reviewIds[0]);

      expect(r1.eligible).toBe(r2.eligible);
      expect(r1.reviewId).toBe(r2.reviewId);
      expect(r1.reasons.length).toBe(r2.reasons.length);
    });
  });

  // ── 10. No scenario is auto-promoted to approved_for_execution ─

  describe("safety", () => {
    it("toState is always approved_candidate, never approved_for_execution", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();

      for (const r of results) {
        expect(r.toState).toBe("approved_candidate");
        expect(r.toState).not.toBe("approved_for_execution");
      }
    });

    it("applied promotions end in approved_candidate, not approved_for_execution", () => {
      setupScenarioWorkflows();
      const results = applyScenarioAutoPromotions(admin());
      const promoted = results.filter((r) => r.applied);

      for (const r of promoted) {
        const wf = getReviewWorkflow(r.reviewId);
        expect(wf?.currentState).toBe("approved_candidate");
        expect(wf?.currentState).not.toBe("approved_for_execution");
      }
    });

    it("previously deferred-then-reopened items are not eligible", () => {
      const reviewIds = setupScenarioWorkflows();
      if (reviewIds.length === 0) return;

      // Defer then re-open
      transitionReviewWorkflow(reviewIds[0], "deferred", admin());
      transitionReviewWorkflow(reviewIds[0], "in_review", admin());

      const result = evaluateScenarioAutoPromotion(reviewIds[0]);
      expect(result.eligible).toBe(false);
      expect(result.reasons.some((r) => r.includes("previously deferred"))).toBe(true);
    });
  });

  // ── 11. Formatting ─────────────────────────────────────────

  describe("formatting", () => {
    it("formatAutoPromotionResult produces readable output", () => {
      setupScenarioWorkflows();
      const results = evaluateAllScenarioAutoPromotions();
      if (results.length === 0) return;

      const text = formatAutoPromotionResult(results[0]);
      expect(text).toContain(results[0].reviewId);
      expect(text).toContain(results[0].eligible ? "ELIGIBLE" : "NOT ELIGIBLE");
    });

    it("formatAutoPromotionReport produces full report", () => {
      setupScenarioWorkflows();
      const report = buildScenarioAutoPromotionReport();
      const text = formatAutoPromotionReport(report);
      expect(text).toContain("Scenario Auto-Promotion Report");
      expect(text).toContain("Total:");
    });
  });
});
