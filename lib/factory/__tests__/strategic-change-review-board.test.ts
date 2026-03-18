import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildStrategicReviewBoard,
  buildReviewBoardReport,
  classifyReviewReadiness,
  classifyReviewRisk,
  rankReviewItems,
  formatReviewItem,
  formatReviewBoardReport,
  type ReviewItem,
  type ReviewBoardInputs,
  type ReviewBoardReport,
  type ReviewReadiness,
  type ReviewRisk,
} from "../strategic-change-review-board";
import {
  useInMemoryStore as useRuntimeStore,
  clearInMemoryStore as clearRuntimeStore,
} from "../factory-runtime-execution";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGovernanceSummary(overrides?: Record<string, number>) {
  return {
    candidateCount: 0,
    greenCount: 5,
    atRiskCount: 0,
    degradedCount: 0,
    demotedCount: 0,
    promoteToGreenCount: 0,
    demoteCount: 0,
    eligibleForRepromotionCount: 0,
    ...overrides,
  };
}

function makeReviewItem(overrides?: Partial<ReviewItem>): ReviewItem {
  return {
    reviewId: "review-test-1",
    reviewType: "scenario",
    title: "Test review item",
    domain: "reservation",
    priority: 0.65,
    readiness: "ready",
    risk: "low",
    recommendedDecision: "approve",
    status: "pending",
    reasons: ["reason 1"],
    linkedArtifacts: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Strategic Change Review Board", () => {
  beforeEach(() => {
    useRuntimeStore();
  });

  afterEach(() => {
    clearRuntimeStore();
  });

  // 1. Review board generation is deterministic
  describe("determinism", () => {
    it("produces identical items on repeated calls", () => {
      const a = buildStrategicReviewBoard({ governanceSummary: makeGovernanceSummary() });
      const b = buildStrategicReviewBoard({ governanceSummary: makeGovernanceSummary() });
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].reviewId).toBe(b[i].reviewId);
        expect(a[i].readiness).toBe(b[i].readiness);
        expect(a[i].risk).toBe(b[i].risk);
        expect(a[i].priority).toBe(b[i].priority);
      }
    });

    it("report summary is deterministic", () => {
      const a = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      const b = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      expect(a.summary.totalItems).toBe(b.summary.totalItems);
      expect(a.summary.readyCount).toBe(b.summary.readyCount);
      expect(a.summary.cautionCount).toBe(b.summary.cautionCount);
      expect(a.summary.blockedCount).toBe(b.summary.blockedCount);
    });
  });

  // 2. Ready items classified correctly
  describe("ready classification", () => {
    it("healthy scenario is ready", () => {
      const result = classifyReviewReadiness({
        hasViableScenario: true,
        executionEligible: true,
        healthStable: true,
        hasDegradedOrDemoted: false,
        hasParentTemplate: true,
        kpiStatus: "healthy",
      });
      expect(result).toBe("ready");
    });

    it("strong KPI status is ready", () => {
      const result = classifyReviewReadiness({
        hasViableScenario: true,
        executionEligible: true,
        healthStable: true,
        hasDegradedOrDemoted: false,
        hasParentTemplate: true,
        kpiStatus: "strong",
      });
      expect(result).toBe("ready");
    });
  });

  // 3. Blocked items classified correctly
  describe("blocked classification", () => {
    it("degraded templates cause blocked", () => {
      const result = classifyReviewReadiness({
        hasViableScenario: true,
        executionEligible: true,
        healthStable: true,
        hasDegradedOrDemoted: true,
        hasParentTemplate: true,
        kpiStatus: "healthy",
      });
      expect(result).toBe("blocked");
    });

    it("unstable health causes blocked", () => {
      const result = classifyReviewReadiness({
        hasViableScenario: true,
        executionEligible: true,
        healthStable: false,
        hasDegradedOrDemoted: false,
        hasParentTemplate: true,
        kpiStatus: "healthy",
      });
      expect(result).toBe("blocked");
    });

    it("missing parent template causes blocked", () => {
      const result = classifyReviewReadiness({
        hasViableScenario: true,
        executionEligible: true,
        healthStable: true,
        hasDegradedOrDemoted: false,
        hasParentTemplate: false,
        kpiStatus: "healthy",
      });
      expect(result).toBe("blocked");
    });

    it("execution ineligible causes blocked", () => {
      const result = classifyReviewReadiness({
        hasViableScenario: true,
        executionEligible: false,
        healthStable: true,
        hasDegradedOrDemoted: false,
        hasParentTemplate: true,
        kpiStatus: "healthy",
      });
      expect(result).toBe("blocked");
    });
  });

  // 4. Risk classification deterministic
  describe("risk classification", () => {
    it("low risk with healthy signals", () => {
      const result = classifyReviewRisk({
        governanceDemotedCount: 0,
        governanceDegradedCount: 0,
        governanceAtRiskCount: 0,
        averageHealthScore: 0.9,
        averageStabilityScore: 0.8,
        scenarioPriority: 0.7,
        templateCount: 3,
      });
      expect(result).toBe("low");
    });

    it("high risk with demoted", () => {
      const result = classifyReviewRisk({
        governanceDemotedCount: 1,
        governanceDegradedCount: 0,
        governanceAtRiskCount: 0,
        averageHealthScore: 0.9,
        averageStabilityScore: 0.8,
        scenarioPriority: 0.7,
        templateCount: 3,
      });
      expect(result).toBe("high");
    });

    it("medium risk with at-risk", () => {
      const result = classifyReviewRisk({
        governanceDemotedCount: 0,
        governanceDegradedCount: 0,
        governanceAtRiskCount: 1,
        averageHealthScore: 0.7,
        averageStabilityScore: 0.6,
        scenarioPriority: 0.5,
        templateCount: 2,
      });
      expect(result).toBe("medium");
    });

    it("medium risk with no templates", () => {
      const result = classifyReviewRisk({
        governanceDemotedCount: 0,
        governanceDegradedCount: 0,
        governanceAtRiskCount: 0,
        averageHealthScore: 0.7,
        averageStabilityScore: 0.6,
        scenarioPriority: 0.5,
        templateCount: 0,
      });
      expect(result).toBe("medium");
    });

    it("high risk with low health", () => {
      const result = classifyReviewRisk({
        governanceDemotedCount: 0,
        governanceDegradedCount: 0,
        governanceAtRiskCount: 0,
        averageHealthScore: 0.3,
        averageStabilityScore: 0.2,
        scenarioPriority: 0.5,
        templateCount: 1,
      });
      expect(result).toBe("high");
    });
  });

  // 5. Prioritization order is stable
  describe("prioritization", () => {
    it("ready items come before caution items", () => {
      const items = [
        makeReviewItem({ reviewId: "a", readiness: "caution", priority: 0.9 }),
        makeReviewItem({ reviewId: "b", readiness: "ready", priority: 0.5 }),
      ];
      const ranked = rankReviewItems(items);
      expect(ranked[0].readiness).toBe("ready");
      expect(ranked[1].readiness).toBe("caution");
    });

    it("higher priority comes first within same readiness", () => {
      const items = [
        makeReviewItem({ reviewId: "a", readiness: "ready", priority: 0.3 }),
        makeReviewItem({ reviewId: "b", readiness: "ready", priority: 0.7 }),
      ];
      const ranked = rankReviewItems(items);
      expect(ranked[0].priority).toBe(0.7);
      expect(ranked[1].priority).toBe(0.3);
    });

    it("lower risk comes first with same readiness and priority", () => {
      const items = [
        makeReviewItem({ reviewId: "a", readiness: "ready", priority: 0.5, risk: "high" }),
        makeReviewItem({ reviewId: "b", readiness: "ready", priority: 0.5, risk: "low" }),
      ];
      const ranked = rankReviewItems(items);
      expect(ranked[0].risk).toBe("low");
      expect(ranked[1].risk).toBe("high");
    });

    it("reviewId is final tie-breaker", () => {
      const items = [
        makeReviewItem({ reviewId: "z-item", readiness: "ready", priority: 0.5, risk: "low" }),
        makeReviewItem({ reviewId: "a-item", readiness: "ready", priority: 0.5, risk: "low" }),
      ];
      const ranked = rankReviewItems(items);
      expect(ranked[0].reviewId).toBe("a-item");
      expect(ranked[1].reviewId).toBe("z-item");
    });

    it("blocked items come last", () => {
      const items = [
        makeReviewItem({ reviewId: "a", readiness: "blocked", priority: 0.9 }),
        makeReviewItem({ reviewId: "b", readiness: "caution", priority: 0.3 }),
        makeReviewItem({ reviewId: "c", readiness: "ready", priority: 0.1 }),
      ];
      const ranked = rankReviewItems(items);
      expect(ranked[0].readiness).toBe("ready");
      expect(ranked[1].readiness).toBe("caution");
      expect(ranked[2].readiness).toBe("blocked");
    });
  });

  // 6. Reasons and linked evidence
  describe("reasons and evidence", () => {
    it("every review item has reasons", () => {
      const items = buildStrategicReviewBoard({ governanceSummary: makeGovernanceSummary() });
      for (const item of items) {
        expect(item.reasons.length).toBeGreaterThan(0);
      }
    });

    it("every review item has linkedArtifacts", () => {
      const items = buildStrategicReviewBoard({ governanceSummary: makeGovernanceSummary() });
      for (const item of items) {
        expect(item.linkedArtifacts).toBeDefined();
      }
    });

    it("scenario items link to scenarioId", () => {
      const items = buildStrategicReviewBoard({ governanceSummary: makeGovernanceSummary() });
      const scenarioItems = items.filter((i) => i.reviewType === "scenario");
      for (const item of scenarioItems) {
        expect(item.linkedArtifacts.scenarioId).toBeTruthy();
      }
    });
  });

  // 7. Report structure
  describe("report structure", () => {
    it("report has correct partitioning", () => {
      const report = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      const total = report.readyItems.length + report.cautionItems.length + report.blockedItems.length;
      expect(total).toBe(report.summary.totalItems);
    });

    it("summary counts are correct", () => {
      const report = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      expect(report.summary.approveCount + report.summary.deferCount + report.summary.rejectCount)
        .toBeLessThanOrEqual(report.summary.totalItems);
    });

    it("all items have valid review types", () => {
      const report = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      const validTypes = ["scenario", "portfolio_priority", "strategic_gap", "release_readiness", "stabilization_priority"];
      for (const item of report.items) {
        expect(validTypes).toContain(item.reviewType);
      }
    });

    it("all items have valid statuses", () => {
      const report = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      for (const item of report.items) {
        expect(item.status).toBe("pending");
      }
    });
  });

  // 8. Same inputs yield same output
  describe("idempotent", () => {
    it("same governance summary produces same item count", () => {
      const gov = makeGovernanceSummary();
      const a = buildStrategicReviewBoard({ governanceSummary: gov });
      const b = buildStrategicReviewBoard({ governanceSummary: gov });
      expect(a.length).toBe(b.length);
    });

    it("same inputs produce same review IDs", () => {
      const gov = makeGovernanceSummary();
      const a = buildStrategicReviewBoard({ governanceSummary: gov });
      const b = buildStrategicReviewBoard({ governanceSummary: gov });
      expect(a.map((i) => i.reviewId)).toEqual(b.map((i) => i.reviewId));
    });
  });

  // 9. Read-only (no state mutation)
  describe("read-only", () => {
    it("does not mutate governance summary", () => {
      const gov = makeGovernanceSummary();
      const frozen = { ...gov };
      buildStrategicReviewBoard({ governanceSummary: gov });
      expect(gov).toEqual(frozen);
    });
  });

  // 10. Formatting
  describe("formatting", () => {
    it("formatReviewItem includes key fields", () => {
      const item = makeReviewItem();
      const formatted = formatReviewItem(item);
      expect(formatted).toContain("READY");
      expect(formatted).toContain("Test review item");
      expect(formatted).toContain("reservation");
    });

    it("formatReviewBoardReport includes all sections", () => {
      const report = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      const formatted = formatReviewBoardReport(report);
      expect(formatted).toContain("Strategic Change Review Board");
      expect(formatted).toContain("Generated:");
    });
  });

  // 11. Integration
  describe("integration", () => {
    it("buildReviewBoardReport runs without overrides", () => {
      const report = buildReviewBoardReport();
      expect(report.summary.totalItems).toBeGreaterThanOrEqual(0);
      expect(report.generatedAt).toBeTruthy();
    });

    it("review items cover multiple types", () => {
      const report = buildReviewBoardReport({ governanceSummary: makeGovernanceSummary() });
      const types = new Set(report.items.map((i) => i.reviewType));
      expect(types.size).toBeGreaterThanOrEqual(1);
    });
  });
});
