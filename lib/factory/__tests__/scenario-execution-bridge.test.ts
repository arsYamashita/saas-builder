import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildScenarioExecutionPlan,
  validateScenarioExecution,
  previewScenarioExecution,
  applyScenarioExecution,
  buildScenarioExecutionReport,
  mapStepToJob,
  findScenarioById,
  listAvailableScenarios,
  formatExecutionPlan,
  formatExecutionResult,
  formatExecutionReport,
  useInMemoryStore,
  clearInMemoryStore,
  type ScenarioExecutionPlan,
  type ScenarioExecutionResult,
  type ExecutionEligibility,
} from "../scenario-execution-bridge";
import {
  useInMemoryStore as useRuntimeStore,
  clearInMemoryStore as clearRuntimeStore,
} from "../factory-runtime-execution";
import type { FactoryScenario, ScenarioStep } from "../factory-scenario-planner";
import type { FactoryActor } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides?: Partial<FactoryScenario>): FactoryScenario {
  return {
    scenarioId: "test-scenario-1",
    type: "expand_domain",
    domain: "reservation",
    targetTemplateCount: 3,
    currentTemplateCount: 1,
    gap: 2,
    priorityScore: 0.65,
    steps: [
      {
        stepType: "governance_review",
        description: "Evaluate governance status",
        parentTemplateId: null,
        targetTemplateId: null,
        targetStage: null,
      },
      {
        stepType: "derive_template",
        description: "Derive new template from reservation_saas",
        parentTemplateId: "reservation_saas",
        targetTemplateId: "hotel_booking_saas",
        targetStage: null,
      },
      {
        stepType: "validate",
        description: "Run regression tests",
        parentTemplateId: null,
        targetTemplateId: "hotel_booking_saas",
        targetStage: null,
      },
      {
        stepType: "release",
        description: "Release to dev stage",
        parentTemplateId: null,
        targetTemplateId: "hotel_booking_saas",
        targetStage: "dev",
      },
    ],
    estimatedImpact: { coverageIncrease: 0.1, portfolioStrength: 0.05 },
    reasons: ["Test scenario"],
    ...overrides,
  };
}

function makeActor(role: "owner" | "admin" | "reviewer" | "operator" | "viewer" = "admin"): FactoryActor {
  return { actorId: `test-actor-${role}`, role };
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

describe("Scenario Execution Bridge", () => {
  beforeEach(() => {
    useInMemoryStore();
    useRuntimeStore();
  });

  afterEach(() => {
    clearInMemoryStore();
    clearRuntimeStore();
  });

  // 1. Scenario → execution plan mapping
  describe("scenario → execution plan mapping", () => {
    it("converts scenario steps to execution jobs", () => {
      const scenario = makeScenario();
      const plan = buildScenarioExecutionPlan(scenario, makeActor());

      expect(plan.scenarioId).toBe("test-scenario-1");
      expect(plan.jobs).toHaveLength(4);
      expect(plan.jobs[0].sourceStepType).toBe("governance_review");
      expect(plan.jobs[0].orchestrationJobId).toBe("governance_evaluation");
      expect(plan.jobs[1].sourceStepType).toBe("derive_template");
      expect(plan.jobs[1].orchestrationJobId).toBe("derivation_pipeline_prepare");
    });

    it("maps all step types correctly", () => {
      const step0 = mapStepToJob(
        { stepType: "governance_review", description: "gov", parentTemplateId: null, targetTemplateId: null, targetStage: null },
        0, "s1",
      );
      expect(step0.orchestrationJobId).toBe("governance_evaluation");

      const step1 = mapStepToJob(
        { stepType: "derive_template", description: "derive", parentTemplateId: "p1", targetTemplateId: "t1", targetStage: null },
        1, "s1",
      );
      expect(step1.orchestrationJobId).toBe("derivation_pipeline_prepare");

      const step2 = mapStepToJob(
        { stepType: "validate", description: "val", parentTemplateId: null, targetTemplateId: null, targetStage: null },
        2, "s1",
      );
      expect(step2.orchestrationJobId).toBe("nightly_regression");

      const step3 = mapStepToJob(
        { stepType: "release", description: "rel", parentTemplateId: null, targetTemplateId: null, targetStage: "dev" },
        3, "s1",
      );
      expect(step3.orchestrationJobId).toBe("marketplace_catalog_refresh");

      const step4 = mapStepToJob(
        { stepType: "publish", description: "pub", parentTemplateId: null, targetTemplateId: null, targetStage: null },
        4, "s1",
      );
      expect(step4.orchestrationJobId).toBe("marketplace_catalog_refresh");

      const step5 = mapStepToJob(
        { stepType: "run_regression", description: "reg", parentTemplateId: null, targetTemplateId: null, targetStage: null },
        5, "s1",
      );
      expect(step5.orchestrationJobId).toBe("nightly_regression");

      const step6 = mapStepToJob(
        { stepType: "create_template", description: "create", parentTemplateId: null, targetTemplateId: null, targetStage: null },
        6, "s1",
      );
      expect(step6.orchestrationJobId).toBe("self_improvement_scan");
    });

    it("preserves step metadata in jobs", () => {
      const scenario = makeScenario();
      const plan = buildScenarioExecutionPlan(scenario, makeActor());

      const derivationJob = plan.jobs[1];
      expect(derivationJob.parentTemplateId).toBe("reservation_saas");
      expect(derivationJob.targetTemplateId).toBe("hotel_booking_saas");
      expect(derivationJob.sourceStepIndex).toBe(1);
    });
  });

  // 2. Deterministic mapping
  describe("deterministic mapping", () => {
    it("same scenario produces same plan structure", () => {
      const scenario = makeScenario();
      const actor = makeActor();
      const plan1 = buildScenarioExecutionPlan(scenario, actor);
      const plan2 = buildScenarioExecutionPlan(scenario, actor);

      expect(plan1.jobs.length).toBe(plan2.jobs.length);
      expect(plan1.executionOrder).toEqual(plan2.executionOrder);
      for (let i = 0; i < plan1.jobs.length; i++) {
        expect(plan1.jobs[i].orchestrationJobId).toBe(plan2.jobs[i].orchestrationJobId);
        expect(plan1.jobs[i].sourceStepType).toBe(plan2.jobs[i].sourceStepType);
      }
    });

    it("execution order is deterministic", () => {
      const scenario = makeScenario();
      const plan = buildScenarioExecutionPlan(scenario, makeActor());
      // governance_evaluation should come first (prerequisite)
      expect(plan.executionOrder[0]).toBe("governance_evaluation");
    });
  });

  // 3. Eligibility validation
  describe("eligibility validation", () => {
    it("admin passes eligibility", () => {
      const scenario = makeScenario();
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(eligibility.allowed).toBe(true);
      expect(eligibility.blockedReasons).toHaveLength(0);
    });

    it("checks governance health", () => {
      const scenario = makeScenario();
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary({ demotedCount: 2 }) },
      );
      const govCheck = eligibility.checks.find((c) => c.check === "governance_health");
      expect(govCheck).toBeDefined();
      expect(govCheck!.passed).toBe(false);
      expect(eligibility.allowed).toBe(false);
    });

    it("checks parent template availability", () => {
      const scenario = makeScenario({
        steps: [
          {
            stepType: "derive_template",
            description: "Derive without parent",
            parentTemplateId: null,
            targetTemplateId: "new_template",
            targetStage: null,
          },
        ],
      });
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      const parentCheck = eligibility.checks.find((c) => c.check === "parent_template_availability");
      expect(parentCheck!.passed).toBe(false);
    });

    it("checks empty steps", () => {
      const scenario = makeScenario({ steps: [] });
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.blockedReasons).toContain("Scenario has no steps to execute");
    });

    it("low priority is warning, not blocker", () => {
      const scenario = makeScenario({ priorityScore: 0.1 });
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      const priorityCheck = eligibility.checks.find((c) => c.check === "priority_score");
      expect(priorityCheck!.passed).toBe(false);
      // But overall should still be allowed (priority is warning only)
      expect(eligibility.allowed).toBe(true);
    });
  });

  // 4. Dry-run correctness
  describe("dry-run correctness", () => {
    it("preview returns ready status for valid scenario", () => {
      const scenario = makeScenario();
      const result = previewScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.mode).toBe("dry_run");
      expect(result.status).toBe("ready");
      expect(result.scenarioId).toBe("test-scenario-1");
    });

    it("preview returns blocked status for invalid scenario", () => {
      const scenario = makeScenario({ steps: [] });
      const result = previewScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.status).toBe("blocked");
      expect(result.blockedReasons.length).toBeGreaterThan(0);
    });

    it("preview records in history", () => {
      const scenario = makeScenario();
      previewScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      const report = buildScenarioExecutionReport();
      expect(report.summary.totalExecutions).toBe(1);
    });
  });

  // 5. Execution success path
  describe("execution success path", () => {
    it("executes valid scenario", () => {
      const scenario = makeScenario();
      const result = applyScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.mode).toBe("execute");
      expect(["completed", "partial", "failed"]).toContain(result.status);
      expect(result.jobResults.length).toBeGreaterThan(0);
    });

    it("execution includes job results", () => {
      const scenario = makeScenario();
      const result = applyScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.summary.totalJobs).toBeGreaterThan(0);
    });
  });

  // 6. Failure cascade
  describe("failure cascade", () => {
    it("blocked scenario does not execute", () => {
      const scenario = makeScenario({ steps: [] });
      const result = applyScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.status).toBe("blocked");
      expect(result.jobResults).toHaveLength(0);
      expect(result.summary.totalJobs).toBe(0);
    });

    it("demoted templates block execution", () => {
      const scenario = makeScenario();
      const result = applyScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary({ demotedCount: 3 }) },
      );
      expect(result.status).toBe("blocked");
    });
  });

  // 7. Role authorization enforcement
  describe("role authorization", () => {
    it("viewer is blocked from execution", () => {
      const scenario = makeScenario();
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("viewer"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(eligibility.allowed).toBe(false);
      expect(eligibility.blockedReasons.some((r) => r.includes("Unauthorized"))).toBe(true);
    });

    it("owner passes all role checks", () => {
      const scenario = makeScenario();
      const eligibility = validateScenarioExecution(
        scenario,
        makeActor("owner"),
        { governanceSummary: makeGovernanceSummary() },
      );
      const roleChecks = eligibility.checks.filter((c) => c.check.startsWith("role_authorization"));
      expect(roleChecks.every((c) => c.passed)).toBe(true);
    });

    it("blocked viewer does not execute", () => {
      const scenario = makeScenario();
      const result = applyScenarioExecution(
        scenario,
        makeActor("viewer"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.status).toBe("blocked");
    });
  });

  // 8. Report structure correctness
  describe("report structure", () => {
    it("empty report has correct structure", () => {
      const report = buildScenarioExecutionReport();
      expect(report.recentExecutions).toHaveLength(0);
      expect(report.summary.totalExecutions).toBe(0);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report tracks executions", () => {
      const scenario = makeScenario();
      const actor = makeActor("admin");
      previewScenarioExecution(scenario, actor, { governanceSummary: makeGovernanceSummary() });
      applyScenarioExecution(scenario, actor, { governanceSummary: makeGovernanceSummary() });

      const report = buildScenarioExecutionReport();
      expect(report.summary.totalExecutions).toBe(2);
    });

    it("report summary counts statuses correctly", () => {
      const scenario = makeScenario();
      const actor = makeActor("admin");

      // One blocked (viewer)
      applyScenarioExecution(scenario, makeActor("viewer"), { governanceSummary: makeGovernanceSummary() });
      // One executed
      applyScenarioExecution(scenario, actor, { governanceSummary: makeGovernanceSummary() });

      const report = buildScenarioExecutionReport();
      expect(report.summary.blockedCount).toBe(1);
      expect(report.summary.totalExecutions).toBe(2);
    });
  });

  // 9. Same input → same execution plan
  describe("idempotent plans", () => {
    it("same scenario + actor = same job count and order", () => {
      const scenario = makeScenario();
      const actor = makeActor();
      const plan1 = buildScenarioExecutionPlan(scenario, actor);
      const plan2 = buildScenarioExecutionPlan(scenario, actor);

      expect(plan1.totalJobs).toBe(plan2.totalJobs);
      expect(plan1.executionOrder).toEqual(plan2.executionOrder);
      expect(plan1.jobs.map((j) => j.orchestrationJobId)).toEqual(
        plan2.jobs.map((j) => j.orchestrationJobId),
      );
    });
  });

  // 10. Integration with runtime execution
  describe("integration", () => {
    it("preview uses planRuntimeExecution", () => {
      const scenario = makeScenario();
      const result = previewScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.mode).toBe("dry_run");
      // Runtime jobs should be planned
      expect(result.jobResults.length).toBeGreaterThan(0);
      for (const job of result.jobResults) {
        expect(job.status).toBe("planned");
      }
    });

    it("apply uses executeRuntimeRun", () => {
      const scenario = makeScenario();
      const result = applyScenarioExecution(
        scenario,
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      expect(result.mode).toBe("execute");
      // Runtime jobs should have been attempted
      expect(result.jobResults.length).toBeGreaterThan(0);
    });

    it("scenario lookup works with default report", () => {
      const scenarios = listAvailableScenarios();
      expect(Array.isArray(scenarios)).toBe(true);
      for (const s of scenarios) {
        expect(s.scenarioId).toBeTruthy();
        expect(s.type).toBeTruthy();
      }
    });

    it("findScenarioById returns null for unknown ID", () => {
      const found = findScenarioById("nonexistent_scenario_xyz");
      expect(found).toBeNull();
    });
  });

  // 11. Formatting
  describe("formatting", () => {
    it("formatExecutionPlan includes key fields", () => {
      const plan = buildScenarioExecutionPlan(makeScenario(), makeActor());
      const formatted = formatExecutionPlan(plan);
      expect(formatted).toContain("test-scenario-1");
      expect(formatted).toContain("expand_domain");
      expect(formatted).toContain("reservation");
    });

    it("formatExecutionResult includes status", () => {
      const result = previewScenarioExecution(
        makeScenario(),
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      const formatted = formatExecutionResult(result);
      expect(formatted).toContain("READY");
      expect(formatted).toContain("dry_run");
    });

    it("formatExecutionReport includes summary", () => {
      previewScenarioExecution(
        makeScenario(),
        makeActor("admin"),
        { governanceSummary: makeGovernanceSummary() },
      );
      const report = buildScenarioExecutionReport();
      const formatted = formatExecutionReport(report);
      expect(formatted).toContain("Scenario Execution Report");
      expect(formatted).toContain("Total: 1");
    });
  });
});
