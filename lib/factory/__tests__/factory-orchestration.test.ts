import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  JOB_REGISTRY,
  listJobs,
  getJob,
  resolveExecutionOrder,
  planOrchestrationRun,
  executeOrchestrationRun,
  listOrchestrationHistory,
  buildOrchestrationReport,
  formatOrchestrationReport,
  formatOrchestrationPlan,
  formatOrchestrationResult,
  useInMemoryStore,
  clearInMemoryStore,
  type OrchestrationJobId,
  type OrchestrationJobResult,
} from "../factory-orchestration";

import { resolveActorRole } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function adminActor() {
  return resolveActorRole("test-admin", "admin");
}

function viewerActor() {
  return resolveActorRole("test-viewer", "viewer");
}

function ownerActor() {
  return resolveActorRole("test-owner", "owner");
}

function successExecutor(jobId: OrchestrationJobId): OrchestrationJobResult {
  return {
    jobId,
    status: "completed",
    startedAt: "2026-03-16T00:00:00.000Z",
    completedAt: "2026-03-16T00:00:01.000Z",
    durationMs: 1000,
    error: null,
    skipReason: null,
  };
}

function failingExecutor(failJobId: OrchestrationJobId) {
  return (jobId: OrchestrationJobId): OrchestrationJobResult => {
    if (jobId === failJobId) {
      return {
        jobId,
        status: "failed",
        startedAt: "2026-03-16T00:00:00.000Z",
        completedAt: "2026-03-16T00:00:01.000Z",
        durationMs: 500,
        error: `Job ${jobId} failed intentionally`,
        skipReason: null,
      };
    }
    return successExecutor(jobId);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Factory Orchestration v1", () => {
  beforeEach(() => {
    useInMemoryStore({ jobExecutor: successExecutor });
  });

  afterEach(() => {
    clearInMemoryStore();
  });

  // 1. Registry determinism
  describe("Job Registry", () => {
    it("returns a deterministic list of 7 jobs", () => {
      const jobs = listJobs();
      expect(jobs).toHaveLength(7);
      const ids = jobs.map((j) => j.jobId);
      expect(ids).toEqual([
        "governance_evaluation",
        "nightly_regression",
        "self_improvement_scan",
        "policy_simulation_refresh",
        "marketplace_catalog_refresh",
        "derivation_pipeline_prepare",
        "dashboard_snapshot_refresh",
      ]);
    });

    it("each job has required fields", () => {
      for (const job of JOB_REGISTRY) {
        expect(job.jobId).toBeTruthy();
        expect(job.label).toBeTruthy();
        expect(job.description).toBeTruthy();
        expect(job.requiredAction).toBeTruthy();
        expect(job.estimatedDuration).toBeTruthy();
        expect(Array.isArray(job.dependsOn)).toBe(true);
      }
    });

    it("getJob returns correct job or null", () => {
      const job = getJob("governance_evaluation");
      expect(job).not.toBeNull();
      expect(job!.label).toBe("Governance Evaluation");

      const unknown = getJob("nonexistent" as OrchestrationJobId);
      expect(unknown).toBeNull();
    });
  });

  // 2. Dependency resolution
  describe("Dependency Resolution", () => {
    it("resolves correct execution order for all jobs", () => {
      const allIds = JOB_REGISTRY.map((j) => j.jobId);
      const order = resolveExecutionOrder(allIds);

      // governance_evaluation must come first (no deps)
      expect(order[0]).toBe("governance_evaluation");

      // nightly_regression depends on governance, so must come after
      const govIdx = order.indexOf("governance_evaluation");
      const nightlyIdx = order.indexOf("nightly_regression");
      expect(nightlyIdx).toBeGreaterThan(govIdx);

      // derivation_pipeline_prepare depends on marketplace_catalog_refresh
      const marketIdx = order.indexOf("marketplace_catalog_refresh");
      const derivIdx = order.indexOf("derivation_pipeline_prepare");
      expect(derivIdx).toBeGreaterThan(marketIdx);

      // dashboard_snapshot_refresh depends on governance, nightly, self_improvement, marketplace
      const dashIdx = order.indexOf("dashboard_snapshot_refresh");
      expect(dashIdx).toBeGreaterThan(govIdx);
      expect(dashIdx).toBeGreaterThan(nightlyIdx);
      expect(dashIdx).toBeGreaterThan(order.indexOf("self_improvement_scan"));
      expect(dashIdx).toBeGreaterThan(marketIdx);
    });

    it("resolves order for subset of jobs", () => {
      const order = resolveExecutionOrder([
        "derivation_pipeline_prepare",
        "marketplace_catalog_refresh",
        "governance_evaluation",
      ]);

      expect(order).toHaveLength(3);
      expect(order.indexOf("governance_evaluation")).toBeLessThan(
        order.indexOf("marketplace_catalog_refresh"),
      );
      expect(order.indexOf("marketplace_catalog_refresh")).toBeLessThan(
        order.indexOf("derivation_pipeline_prepare"),
      );
    });

    it("handles single job with no dependencies", () => {
      const order = resolveExecutionOrder(["governance_evaluation"]);
      expect(order).toEqual(["governance_evaluation"]);
    });
  });

  // 3. Plan mode (dry-run)
  describe("Plan Mode", () => {
    it("generates a plan without executing", () => {
      const plan = planOrchestrationRun({ actor: adminActor() });

      expect(plan.mode).toBe("dry_run");
      expect(plan.totalJobs).toBe(7);
      expect(plan.runId).toMatch(/^orch-run-/);

      // All jobs should be "planned" for admin
      for (const job of plan.jobs) {
        expect(job.status).toBe("planned");
      }
    });

    it("plan for viewer skips orchestration.run jobs", () => {
      const plan = planOrchestrationRun({ actor: viewerActor() });

      // Viewer can only orchestration.plan, not orchestration.run
      for (const job of plan.jobs) {
        expect(job.status).toBe("skipped");
        expect(job.skipReason).toContain("not authorized");
      }
    });

    it("plan for specific jobs only", () => {
      const plan = planOrchestrationRun({
        jobIds: ["governance_evaluation", "nightly_regression"],
        actor: adminActor(),
      });

      expect(plan.totalJobs).toBe(2);
      expect(plan.executionOrder).toEqual([
        "governance_evaluation",
        "nightly_regression",
      ]);
    });

    it("throws for unknown job IDs", () => {
      expect(() =>
        planOrchestrationRun({
          jobIds: ["unknown_job" as OrchestrationJobId],
          actor: adminActor(),
        }),
      ).toThrow("Unknown job ID: unknown_job");
    });
  });

  // 4. Execution
  describe("Execution", () => {
    it("executes all jobs successfully", () => {
      const result = executeOrchestrationRun({ actor: adminActor() });

      expect(result.status).toBe("completed");
      expect(result.completedJobs).toBe(7);
      expect(result.failedJobs).toBe(0);
      expect(result.skippedJobs).toBe(0);
      expect(result.executedBy).toBe("test-admin");
    });

    it("executes a single job", () => {
      const result = executeOrchestrationRun({
        jobIds: ["governance_evaluation"],
        actor: adminActor(),
      });

      expect(result.totalJobs).toBe(1);
      expect(result.completedJobs).toBe(1);
      expect(result.status).toBe("completed");
    });

    it("handles job failure and skips dependents", () => {
      useInMemoryStore({
        jobExecutor: failingExecutor("governance_evaluation"),
      });

      const result = executeOrchestrationRun({ actor: adminActor() });

      // governance_evaluation fails → all dependents should be skipped
      expect(result.status).toBe("failed");
      expect(result.failedJobs).toBe(1);

      const govResult = result.jobResults.find(
        (r) => r.jobId === "governance_evaluation",
      );
      expect(govResult!.status).toBe("failed");

      // nightly_regression depends on governance → skipped
      const nightlyResult = result.jobResults.find(
        (r) => r.jobId === "nightly_regression",
      );
      expect(nightlyResult!.status).toBe("skipped");
      expect(nightlyResult!.skipReason).toContain("governance_evaluation");
    });

    it("partial success when non-root job fails", () => {
      useInMemoryStore({
        jobExecutor: failingExecutor("nightly_regression"),
      });

      const result = executeOrchestrationRun({ actor: adminActor() });

      expect(result.status).toBe("partial");
      expect(result.completedJobs).toBeGreaterThan(0);
      expect(result.failedJobs).toBe(1);

      // governance should still complete
      const govResult = result.jobResults.find(
        (r) => r.jobId === "governance_evaluation",
      );
      expect(govResult!.status).toBe("completed");

      // dashboard_snapshot depends on nightly → skipped
      const dashResult = result.jobResults.find(
        (r) => r.jobId === "dashboard_snapshot_refresh",
      );
      expect(dashResult!.status).toBe("skipped");
    });
  });

  // 5. Role authorization
  describe("Role Authorization", () => {
    it("owner can run all jobs", () => {
      const result = executeOrchestrationRun({ actor: ownerActor() });
      expect(result.completedJobs).toBe(7);
      expect(result.skippedJobs).toBe(0);
    });

    it("admin can run all jobs", () => {
      const result = executeOrchestrationRun({ actor: adminActor() });
      expect(result.completedJobs).toBe(7);
      expect(result.skippedJobs).toBe(0);
    });

    it("operator can run all jobs", () => {
      const operatorActor = resolveActorRole("test-op", "operator");
      const result = executeOrchestrationRun({ actor: operatorActor });
      expect(result.completedJobs).toBe(7);
      expect(result.skippedJobs).toBe(0);
    });

    it("viewer cannot execute (all skipped)", () => {
      const result = executeOrchestrationRun({ actor: viewerActor() });
      expect(result.status).toBe("failed");
      expect(result.completedJobs).toBe(0);
      expect(result.skippedJobs).toBe(7);
    });

    it("reviewer cannot execute (all skipped)", () => {
      const reviewerActor = resolveActorRole("test-rev", "reviewer");
      const result = executeOrchestrationRun({ actor: reviewerActor });
      expect(result.status).toBe("failed");
      expect(result.completedJobs).toBe(0);
      expect(result.skippedJobs).toBe(7);
    });
  });

  // 6. History
  describe("History", () => {
    it("persists runs to history", () => {
      executeOrchestrationRun({ actor: adminActor() });
      executeOrchestrationRun({ actor: adminActor() });

      const history = listOrchestrationHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.runId).toMatch(/^orch-run-/);
      expect(history[1]!.runId).toMatch(/^orch-run-/);
    });

    it("empty history by default", () => {
      const history = listOrchestrationHistory();
      expect(history).toHaveLength(0);
    });

    it("history entries contain full results", () => {
      executeOrchestrationRun({ actor: adminActor() });
      const history = listOrchestrationHistory();
      const entry = history[0]!;

      expect(entry.mode).toBe("execute");
      expect(entry.executedBy).toBe("test-admin");
      expect(entry.jobResults).toHaveLength(7);
      expect(entry.executionOrder).toHaveLength(7);
      expect(entry.startedAt).toBeTruthy();
      expect(entry.completedAt).toBeTruthy();
    });
  });

  // 7. Reporting
  describe("Reporting", () => {
    it("builds report with empty history", () => {
      const report = buildOrchestrationReport();
      expect(report.registry).toHaveLength(7);
      expect(report.recentRuns).toHaveLength(0);
      expect(report.summary.totalJobs).toBe(7);
      expect(report.summary.totalRuns).toBe(0);
      expect(report.summary.lastRunAt).toBeNull();
      expect(report.summary.lastRunStatus).toBeNull();
    });

    it("builds report with history", () => {
      executeOrchestrationRun({ actor: adminActor() });
      const report = buildOrchestrationReport();

      expect(report.recentRuns).toHaveLength(1);
      expect(report.summary.totalRuns).toBe(1);
      expect(report.summary.lastRunStatus).toBe("completed");
      expect(report.summary.lastRunAt).toBeTruthy();
    });

    it("limits recent runs to 10", () => {
      for (let i = 0; i < 15; i++) {
        executeOrchestrationRun({ actor: adminActor() });
      }
      const report = buildOrchestrationReport();
      expect(report.recentRuns).toHaveLength(10);
      expect(report.summary.totalRuns).toBe(15);
    });
  });

  // 8. Formatting
  describe("Formatting", () => {
    it("formats report output", () => {
      executeOrchestrationRun({ actor: adminActor() });
      const report = buildOrchestrationReport();
      const output = formatOrchestrationReport(report);

      expect(output).toContain("FACTORY ORCHESTRATION REPORT");
      expect(output).toContain("Jobs: 7");
      expect(output).toContain("JOB REGISTRY");
      expect(output).toContain("governance_evaluation");
      expect(output).toContain("RECENT RUNS");
      expect(output).toContain("[COMPLETED]");
    });

    it("formats plan output", () => {
      const plan = planOrchestrationRun({ actor: adminActor() });
      const output = formatOrchestrationPlan(plan);

      expect(output).toContain("ORCHESTRATION PLAN");
      expect(output).toContain("[PLANNED]");
      expect(output).toContain("Execution order");
    });

    it("formats result output", () => {
      const result = executeOrchestrationRun({ actor: adminActor() });
      const output = formatOrchestrationResult(result);

      expect(output).toContain("ORCHESTRATION RUN");
      expect(output).toContain("[COMPLETED]");
      expect(output).toContain("[OK]");
    });

    it("formats failed result output", () => {
      useInMemoryStore({
        jobExecutor: failingExecutor("governance_evaluation"),
      });

      const result = executeOrchestrationRun({ actor: adminActor() });
      const output = formatOrchestrationResult(result);

      expect(output).toContain("[FAILED]");
      expect(output).toContain("[FAIL]");
      expect(output).toContain("[SKIP]");
    });
  });

  // 9. Determinism
  describe("Determinism", () => {
    it("same inputs produce consistent execution order", () => {
      const order1 = resolveExecutionOrder(JOB_REGISTRY.map((j) => j.jobId));
      const order2 = resolveExecutionOrder(JOB_REGISTRY.map((j) => j.jobId));
      expect(order1).toEqual(order2);
    });

    it("job registry is immutable from listJobs", () => {
      const jobs1 = listJobs();
      const jobs2 = listJobs();
      expect(jobs1).toEqual(jobs2);
      expect(jobs1).not.toBe(jobs2); // different array instances
    });
  });

  // 10. Edge cases
  describe("Edge Cases", () => {
    it("handles executor throwing an exception", () => {
      useInMemoryStore({
        jobExecutor: (jobId: OrchestrationJobId) => {
          if (jobId === "governance_evaluation") {
            throw new Error("Unexpected executor crash");
          }
          return successExecutor(jobId);
        },
      });

      const result = executeOrchestrationRun({
        jobIds: ["governance_evaluation"],
        actor: adminActor(),
      });

      expect(result.failedJobs).toBe(1);
      const govResult = result.jobResults.find(
        (r) => r.jobId === "governance_evaluation",
      );
      expect(govResult!.status).toBe("failed");
      expect(govResult!.error).toContain("Unexpected executor crash");
    });

    it("throws for unknown job ID in execution", () => {
      expect(() =>
        executeOrchestrationRun({
          jobIds: ["fake_job" as OrchestrationJobId],
          actor: adminActor(),
        }),
      ).toThrow("Unknown job ID: fake_job");
    });

    it("executes multiple runs and preserves all history", () => {
      executeOrchestrationRun({
        jobIds: ["governance_evaluation"],
        actor: adminActor(),
      });
      executeOrchestrationRun({
        jobIds: ["governance_evaluation", "nightly_regression"],
        actor: adminActor(),
      });

      const history = listOrchestrationHistory();
      expect(history).toHaveLength(2);
      expect(history[0]!.totalJobs).toBe(1);
      expect(history[1]!.totalJobs).toBe(2);
    });
  });
});
