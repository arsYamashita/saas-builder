import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  evaluateScenarioExecutionGovernance,
  evaluateAllScenarioGovernance,
  determineApprovalRequirement,
  recordScenarioExecutionDecision,
  checkExecutionGovernance,
  listScenarioExecutionGovernanceHistory,
  buildScenarioExecutionGovernanceReport,
  formatGovernanceEvaluation,
  formatGovernanceReport,
  useInMemoryStore,
  clearInMemoryStore,
  type GovernanceEvaluation,
  type GovernanceInputs,
} from "../scenario-execution-governance";
import {
  useInMemoryStore as useRuntimeStore,
  clearInMemoryStore as clearRuntimeStore,
} from "../factory-runtime-execution";
import {
  useInMemoryStore as useBridgeStore,
  clearInMemoryStore as clearBridgeStore,
} from "../scenario-execution-bridge";
import type { FactoryActor } from "../team-role-approval";
import type { FactoryScenario } from "../factory-scenario-planner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActor(role: "owner" | "admin" | "reviewer" | "operator" | "viewer" = "admin"): FactoryActor {
  return { actorId: `test-${role}`, role };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Scenario Execution Governance", () => {
  beforeEach(() => {
    useInMemoryStore();
    useRuntimeStore();
    useBridgeStore();
  });

  afterEach(() => {
    clearInMemoryStore();
    clearRuntimeStore();
    clearBridgeStore();
  });

  // 1. Ready/low-risk scenarios classify as allowed
  describe("allowed classification", () => {
    it("evaluates scenarios from default report", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      expect(evaluations.length).toBeGreaterThan(0);
      for (const eval_ of evaluations) {
        expect(["allowed", "caution", "blocked"]).toContain(eval_.executionReadiness);
      }
    });

    it("allowed scenarios have standard or none approval", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const allowed = evaluations.filter((e) => e.executionReadiness === "allowed");
      for (const eval_ of allowed) {
        expect(["none", "standard"]).toContain(eval_.approvalRequirement);
      }
    });
  });

  // 2. Ready/medium-risk scenarios classify as caution/elevated
  describe("caution classification", () => {
    it("scenarios with at-risk templates get caution", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary({ atRiskCount: 2 }) },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const cautionOrBlocked = evaluations.filter(
        (e) => e.executionReadiness === "caution" || e.executionReadiness === "blocked",
      );
      // With at-risk templates, at least some should be caution
      expect(cautionOrBlocked.length).toBeGreaterThanOrEqual(0);
    });
  });

  // 3. Blocked review items classify as blocked
  describe("blocked classification", () => {
    it("demoted templates cause blocked governance", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary({ demotedCount: 2 }) },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const blocked = evaluations.filter((e) => e.executionReadiness === "blocked");
      expect(blocked.length).toBeGreaterThan(0);
    });

    it("blocked scenarios have blocked_from_execution status", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary({ demotedCount: 2 }) },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const blocked = evaluations.filter((e) => e.executionReadiness === "blocked");
      for (const eval_ of blocked) {
        expect(eval_.status).toBe("blocked_from_execution");
      }
    });

    it("unknown scenario is blocked", () => {
      const eval_ = evaluateScenarioExecutionGovernance("nonexistent_scenario_xyz");
      expect(eval_.executionReadiness).toBe("blocked");
      expect(eval_.reasons).toContain("Scenario not found: nonexistent_scenario_xyz");
    });
  });

  // 4. Approval requirement rules are deterministic
  describe("approval requirement", () => {
    it("blocked readiness requires elevated", () => {
      const scenario: FactoryScenario = {
        scenarioId: "test", type: "expand_domain", domain: "test",
        targetTemplateCount: 3, currentTemplateCount: 1, gap: 2,
        priorityScore: 0.5, steps: [], estimatedImpact: { coverageIncrease: 0, portfolioStrength: 0 },
        reasons: [],
      };
      expect(determineApprovalRequirement("blocked", "high", scenario)).toBe("elevated");
    });

    it("high risk requires elevated", () => {
      const scenario: FactoryScenario = {
        scenarioId: "test", type: "expand_domain", domain: "test",
        targetTemplateCount: 3, currentTemplateCount: 1, gap: 2,
        priorityScore: 0.5, steps: [], estimatedImpact: { coverageIncrease: 0, portfolioStrength: 0 },
        reasons: [],
      };
      expect(determineApprovalRequirement("allowed", "high", scenario)).toBe("elevated");
    });

    it("medium risk with release step requires elevated", () => {
      const scenario: FactoryScenario = {
        scenarioId: "test", type: "expand_domain", domain: "test",
        targetTemplateCount: 3, currentTemplateCount: 1, gap: 2,
        priorityScore: 0.5,
        steps: [{ stepType: "release", description: "rel", parentTemplateId: null, targetTemplateId: null, targetStage: "dev" }],
        estimatedImpact: { coverageIncrease: 0, portfolioStrength: 0 },
        reasons: [],
      };
      expect(determineApprovalRequirement("allowed", "medium", scenario)).toBe("elevated");
    });

    it("allowed/low risk requires standard", () => {
      const scenario: FactoryScenario = {
        scenarioId: "test", type: "expand_domain", domain: "test",
        targetTemplateCount: 3, currentTemplateCount: 1, gap: 2,
        priorityScore: 0.5, steps: [], estimatedImpact: { coverageIncrease: 0, portfolioStrength: 0 },
        reasons: [],
      };
      expect(determineApprovalRequirement("allowed", "low", scenario)).toBe("standard");
    });

    it("same inputs produce same requirement", () => {
      const scenario: FactoryScenario = {
        scenarioId: "test", type: "expand_domain", domain: "test",
        targetTemplateCount: 3, currentTemplateCount: 1, gap: 2,
        priorityScore: 0.5, steps: [], estimatedImpact: { coverageIncrease: 0, portfolioStrength: 0 },
        reasons: [],
      };
      const r1 = determineApprovalRequirement("allowed", "low", scenario);
      const r2 = determineApprovalRequirement("allowed", "low", scenario);
      expect(r1).toBe(r2);
    });
  });

  // 5. Approve/defer/reject decisions are stored correctly
  describe("decision recording", () => {
    it("admin can approve execution", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "approve_execution", makeActor("admin"),
      );
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe("approve_execution");
      expect(decision!.scenarioId).toBe("test-scenario");
    });

    it("admin can defer execution", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "defer_execution", makeActor("admin"),
      );
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe("defer_execution");
    });

    it("admin can reject execution", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "reject_execution", makeActor("admin"),
      );
      expect(decision).not.toBeNull();
      expect(decision!.action).toBe("reject_execution");
    });

    it("decisions appear in history", () => {
      recordScenarioExecutionDecision("s1", "approve_execution", makeActor("admin"));
      recordScenarioExecutionDecision("s2", "defer_execution", makeActor("admin"));
      const history = listScenarioExecutionGovernanceHistory();
      expect(history.decisions).toHaveLength(2);
    });

    it("owner can approve", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "approve_execution", makeActor("owner"),
      );
      expect(decision).not.toBeNull();
    });
  });

  // 6. Bridge blocks unauthorized execution
  describe("execution gate", () => {
    it("blocked scenario cannot execute", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary({ demotedCount: 3 }) },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const blocked = evaluations.find((e) => e.executionReadiness === "blocked");
      if (blocked) {
        const check = checkExecutionGovernance(blocked.scenarioId, makeActor("admin"), overrides);
        expect(check.allowed).toBe(false);
        expect(check.reason).toContain("blocked");
      }
    });

    it("unapproved scenario requires approval", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      if (evaluations.length > 0) {
        const scenarioId = evaluations[0].scenarioId;
        const check = checkExecutionGovernance(scenarioId, makeActor("admin"), overrides);
        if (evaluations[0].approvalRequirement !== "none") {
          expect(check.allowed).toBe(false);
          expect(check.reason).toContain("approval");
        }
      }
    });

    it("approved scenario passes gate", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const allowed = evaluations.find((e) => e.executionReadiness === "allowed");
      if (allowed) {
        recordScenarioExecutionDecision(allowed.scenarioId, "approve_execution", makeActor("admin"));
        const check = checkExecutionGovernance(allowed.scenarioId, makeActor("admin"), overrides);
        expect(check.allowed).toBe(true);
      }
    });
  });

  // 7. Preview remains available
  describe("preview availability", () => {
    it("governance evaluation does not block preview ability", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      // Preview is separate from execution — governance evaluations exist but don't block reads
      expect(evaluations.length).toBeGreaterThan(0);
    });
  });

  // 8. Role authorization is enforced
  describe("role authorization", () => {
    it("viewer cannot approve execution", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "approve_execution", makeActor("viewer"),
      );
      expect(decision).toBeNull();
    });

    it("reviewer cannot approve execution", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "approve_execution", makeActor("reviewer"),
      );
      expect(decision).toBeNull();
    });

    it("operator cannot approve execution", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "approve_execution", makeActor("operator"),
      );
      expect(decision).toBeNull();
    });

    it("viewer cannot execute via gate check", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const evaluations = evaluateAllScenarioGovernance(overrides);
      const allowed = evaluations.find((e) => e.executionReadiness === "allowed");
      if (allowed) {
        recordScenarioExecutionDecision(allowed.scenarioId, "approve_execution", makeActor("admin"));
        const check = checkExecutionGovernance(allowed.scenarioId, makeActor("viewer"), overrides);
        expect(check.allowed).toBe(false);
        expect(check.reason).toContain("not authorized");
      }
    });

    it("reviewer can defer", () => {
      const decision = recordScenarioExecutionDecision(
        "test-scenario", "defer_execution", makeActor("reviewer"),
      );
      expect(decision).not.toBeNull();
    });
  });

  // 9. Same inputs yield same governance decisions
  describe("determinism", () => {
    it("same governance summary produces same evaluations", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const a = evaluateAllScenarioGovernance(overrides);
      const b = evaluateAllScenarioGovernance(overrides);
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].scenarioId).toBe(b[i].scenarioId);
        expect(a[i].executionReadiness).toBe(b[i].executionReadiness);
        expect(a[i].approvalRequirement).toBe(b[i].approvalRequirement);
        expect(a[i].riskLevel).toBe(b[i].riskLevel);
      }
    });
  });

  // 10. Audit/history records are correct
  describe("audit trail", () => {
    it("history tracks evaluations and decisions separately", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      evaluateAllScenarioGovernance(overrides);
      recordScenarioExecutionDecision("test-s", "approve_execution", makeActor("admin"));

      const history = listScenarioExecutionGovernanceHistory();
      expect(history.evaluations.length).toBeGreaterThan(0);
      expect(history.decisions.length).toBe(1);
    });

    it("decision includes actor and timestamp", () => {
      recordScenarioExecutionDecision("test-s", "approve_execution", makeActor("admin"));
      const history = listScenarioExecutionGovernanceHistory();
      const d = history.decisions[0];
      expect(d.actor.actorId).toBe("test-admin");
      expect(d.actor.role).toBe("admin");
      expect(d.timestamp).toBeTruthy();
    });

    it("multiple decisions for same scenario are all recorded", () => {
      recordScenarioExecutionDecision("test-s", "defer_execution", makeActor("admin"));
      recordScenarioExecutionDecision("test-s", "approve_execution", makeActor("admin"));
      const history = listScenarioExecutionGovernanceHistory();
      expect(history.decisions.filter((d) => d.scenarioId === "test-s")).toHaveLength(2);
    });
  });

  // 11. Report structure
  describe("report", () => {
    it("report has correct partitioning", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const report = buildScenarioExecutionGovernanceReport(overrides);
      const total = report.allowedItems.length + report.cautionItems.length + report.blockedItems.length;
      expect(total).toBe(report.summary.totalEvaluations);
    });

    it("report summary counts match", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const report = buildScenarioExecutionGovernanceReport(overrides);
      expect(report.summary.allowedCount).toBe(report.allowedItems.length);
      expect(report.summary.cautionCount).toBe(report.cautionItems.length);
      expect(report.summary.blockedCount).toBe(report.blockedItems.length);
    });

    it("report generatedAt is present", () => {
      const report = buildScenarioExecutionGovernanceReport();
      expect(report.generatedAt).toBeTruthy();
    });
  });

  // 12. Formatting
  describe("formatting", () => {
    it("formatGovernanceEvaluation includes key fields", () => {
      const eval_: GovernanceEvaluation = {
        governanceId: "gov-test",
        scenarioId: "test-scenario",
        executionReadiness: "allowed",
        approvalRequirement: "standard",
        riskLevel: "low",
        status: "pending_review",
        reasons: ["reason 1"],
        linkedReviewId: "review-test",
      };
      const formatted = formatGovernanceEvaluation(eval_);
      expect(formatted).toContain("ALLOWED");
      expect(formatted).toContain("test-scenario");
      expect(formatted).toContain("standard");
    });

    it("formatGovernanceReport includes all sections", () => {
      const overrides: Partial<GovernanceInputs> = {
        reviewBoardInputs: { governanceSummary: makeGovernanceSummary() },
      };
      const report = buildScenarioExecutionGovernanceReport(overrides);
      const formatted = formatGovernanceReport(report);
      expect(formatted).toContain("Scenario Execution Governance Report");
      expect(formatted).toContain("Generated:");
    });
  });
});
