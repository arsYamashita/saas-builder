import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  useInMemoryStore,
  clearInMemoryStore,
  planRuntimeExecution,
  executeRuntimeRun,
  listRuntimeHistory,
  buildRuntimeExecutionReport,
  formatRuntimeExecutionRun,
  formatRuntimeExecutionReport,
  JOB_GROUPS,
  ALL_GROUPS,
  type RuntimeJobResult,
  type RuntimeJobStatus,
} from "../factory-runtime-execution";
import type { OrchestrationJobId } from "../factory-orchestration";
import type { FactoryActor } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const adminActor: FactoryActor = { actorId: "admin-1", role: "admin" };
const ownerActor: FactoryActor = { actorId: "owner-1", role: "owner" };
const viewerActor: FactoryActor = { actorId: "viewer-1", role: "viewer" };

function makeCompletedResult(jobId: OrchestrationJobId): RuntimeJobResult {
  return {
    jobId,
    status: "completed" as RuntimeJobStatus,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 1,
    summary: { description: `${jobId} done`, metrics: { count: 1 } },
    artifacts: [{ type: "test", label: "Test Artifact", key: "test" }],
    error: null,
    skipReason: null,
  };
}

function makeFailedResult(jobId: OrchestrationJobId, error: string): RuntimeJobResult {
  return {
    jobId,
    status: "failed" as RuntimeJobStatus,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 1,
    summary: null,
    artifacts: [],
    error,
    skipReason: null,
  };
}

function makeExecutors(
  overrides?: Partial<Record<OrchestrationJobId, () => RuntimeJobResult>>,
): Partial<Record<OrchestrationJobId, () => RuntimeJobResult>> {
  const all: OrchestrationJobId[] = [
    "governance_evaluation",
    "nightly_regression",
    "self_improvement_scan",
    "policy_simulation_refresh",
    "marketplace_catalog_refresh",
    "derivation_pipeline_prepare",
    "dashboard_snapshot_refresh",
  ];
  const executors: Partial<Record<OrchestrationJobId, () => RuntimeJobResult>> = {};
  for (const jobId of all) {
    executors[jobId] = () => makeCompletedResult(jobId);
  }
  if (overrides) {
    Object.assign(executors, overrides);
  }
  return executors;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("factory-runtime-execution", () => {
  beforeEach(() => {
    useInMemoryStore({ jobExecutors: makeExecutors() });
  });

  afterEach(() => {
    clearInMemoryStore();
  });

  // ── 1. Dependency Order ──────────────────────────────────────
  describe("dependency order", () => {
    it("respects dependency ordering in execution", () => {
      const run = executeRuntimeRun({ actor: adminActor });
      const order = run.executionOrder;

      // governance_evaluation must come before its dependents
      const govIdx = order.indexOf("governance_evaluation");
      const regIdx = order.indexOf("nightly_regression");
      const selfIdx = order.indexOf("self_improvement_scan");
      const mktIdx = order.indexOf("marketplace_catalog_refresh");
      const dashIdx = order.indexOf("dashboard_snapshot_refresh");

      expect(govIdx).toBeLessThan(regIdx);
      expect(govIdx).toBeLessThan(selfIdx);
      expect(govIdx).toBeLessThan(mktIdx);
      expect(govIdx).toBeLessThan(dashIdx);
      expect(mktIdx).toBeLessThan(order.indexOf("derivation_pipeline_prepare"));
    });

    it("handles single job with no dependencies", () => {
      const run = executeRuntimeRun({
        jobIds: ["governance_evaluation"],
        actor: adminActor,
      });
      expect(run.executionOrder).toEqual(["governance_evaluation"]);
      expect(run.completedJobs).toBe(1);
    });
  });

  // ── 2. Failure Cascade ───────────────────────────────────────
  describe("failure cascade", () => {
    it("skips downstream jobs when dependency fails", () => {
      useInMemoryStore({
        jobExecutors: makeExecutors({
          governance_evaluation: () => makeFailedResult("governance_evaluation", "governance failed"),
        }),
      });

      const run = executeRuntimeRun({ actor: adminActor });
      // governance fails → all dependents skipped → no completed jobs → status is "failed"
      expect(run.status).toBe("failed");

      const govResult = run.jobs.find((j) => j.jobId === "governance_evaluation");
      expect(govResult?.status).toBe("failed");
      expect(govResult?.error).toBe("governance failed");

      // Direct dependents should be skipped
      const regResult = run.jobs.find((j) => j.jobId === "nightly_regression");
      expect(regResult?.status).toBe("skipped");
      expect(regResult?.skipReason).toContain("governance_evaluation");
    });

    it("skips transitive dependents on failure", () => {
      useInMemoryStore({
        jobExecutors: makeExecutors({
          marketplace_catalog_refresh: () =>
            makeFailedResult("marketplace_catalog_refresh", "marketplace failed"),
        }),
      });

      const run = executeRuntimeRun({ actor: adminActor });

      // derivation_pipeline_prepare depends on marketplace_catalog_refresh
      const derivResult = run.jobs.find((j) => j.jobId === "derivation_pipeline_prepare");
      expect(derivResult?.status).toBe("skipped");
      expect(derivResult?.skipReason).toContain("marketplace_catalog_refresh");
    });

    it("catches executor exceptions and treats as failure", () => {
      useInMemoryStore({
        jobExecutors: makeExecutors({
          governance_evaluation: () => { throw new Error("kaboom"); },
        }),
      });

      const run = executeRuntimeRun({ actor: adminActor });
      const gov = run.jobs.find((j) => j.jobId === "governance_evaluation");
      expect(gov?.status).toBe("failed");
      expect(gov?.error).toBe("kaboom");
    });
  });

  // ── 3. Dry-Run ──────────────────────────────────────────────
  describe("dry-run (plan)", () => {
    it("returns planned status without executing", () => {
      const plan = planRuntimeExecution({ actor: adminActor });
      expect(plan.mode).toBe("dry_run");

      for (const job of plan.jobs) {
        // Should be planned or skipped (if auth fails)
        expect(["planned", "skipped"]).toContain(job.status);
        expect(job.summary).toBeNull();
        expect(job.artifacts).toEqual([]);
      }
    });

    it("does not persist to history", () => {
      planRuntimeExecution({ actor: adminActor });
      expect(listRuntimeHistory()).toHaveLength(0);
    });
  });

  // ── 4. Single Job Execution ─────────────────────────────────
  describe("single job execution", () => {
    it("executes only the specified job", () => {
      const run = executeRuntimeRun({
        jobIds: ["self_improvement_scan"],
        actor: adminActor,
      });

      expect(run.totalJobs).toBe(1);
      expect(run.jobs).toHaveLength(1);
      expect(run.jobs[0]!.jobId).toBe("self_improvement_scan");
      expect(run.jobs[0]!.status).toBe("completed");
    });

    it("throws on unknown job ID", () => {
      expect(() =>
        executeRuntimeRun({
          jobIds: ["nonexistent" as OrchestrationJobId],
          actor: adminActor,
        }),
      ).toThrow("Unknown job ID: nonexistent");
    });
  });

  // ── 5. Group Execution ──────────────────────────────────────
  describe("group execution", () => {
    it("runs all jobs in the nightly group", () => {
      const run = executeRuntimeRun({ group: "nightly", actor: adminActor });
      expect(run.group).toBe("nightly");
      expect(run.totalJobs).toBe(7);
      expect(run.completedJobs).toBe(7);
    });

    it("runs only health_check group jobs", () => {
      const run = executeRuntimeRun({ group: "health_check", actor: adminActor });
      expect(run.group).toBe("health_check");
      expect(run.totalJobs).toBe(2);
      expect(run.executionOrder).toContain("governance_evaluation");
      expect(run.executionOrder).toContain("nightly_regression");
    });

    it("runs marketplace_refresh group", () => {
      const run = executeRuntimeRun({ group: "marketplace_refresh", actor: adminActor });
      expect(run.group).toBe("marketplace_refresh");
      expect(run.totalJobs).toBe(3);
    });

    it("ALL_GROUPS covers all defined groups", () => {
      expect(ALL_GROUPS).toHaveLength(3);
      for (const g of ALL_GROUPS) {
        expect(JOB_GROUPS[g]).toBeDefined();
        expect(JOB_GROUPS[g].length).toBeGreaterThan(0);
      }
    });
  });

  // ── 6. History ──────────────────────────────────────────────
  describe("history", () => {
    it("persists execution to history", () => {
      executeRuntimeRun({ actor: adminActor });
      const history = listRuntimeHistory();
      expect(history).toHaveLength(1);
      expect(history[0]!.mode).toBe("execute");
    });

    it("accumulates multiple runs", () => {
      executeRuntimeRun({ actor: adminActor });
      executeRuntimeRun({ group: "health_check", actor: adminActor });
      expect(listRuntimeHistory()).toHaveLength(2);
    });
  });

  // ── 7. Authorization ───────────────────────────────────────
  describe("authorization", () => {
    it("viewer cannot execute orchestration.run jobs", () => {
      const plan = planRuntimeExecution({ actor: viewerActor });

      for (const job of plan.jobs) {
        expect(job.status).toBe("skipped");
        expect(job.skipReason).toContain("not authorized");
      }
    });

    it("admin can execute all orchestration.run jobs", () => {
      const run = executeRuntimeRun({ actor: adminActor });
      const skippedForAuth = run.jobs.filter(
        (j) => j.status === "skipped" && j.skipReason?.includes("not authorized"),
      );
      expect(skippedForAuth).toHaveLength(0);
    });

    it("owner can execute all orchestration.run jobs", () => {
      const run = executeRuntimeRun({ actor: ownerActor });
      expect(run.completedJobs).toBe(7);
    });
  });

  // ── 8. Determinism ─────────────────────────────────────────
  describe("determinism", () => {
    it("produces consistent execution order for same inputs", () => {
      const run1 = planRuntimeExecution({ actor: adminActor });
      const run2 = planRuntimeExecution({ actor: adminActor });
      expect(run1.executionOrder).toEqual(run2.executionOrder);
    });

    it("produces consistent job count for same group", () => {
      const run1 = planRuntimeExecution({ group: "health_check", actor: adminActor });
      const run2 = planRuntimeExecution({ group: "health_check", actor: adminActor });
      expect(run1.totalJobs).toEqual(run2.totalJobs);
    });
  });

  // ── 9. Result Structure ────────────────────────────────────
  describe("result structure", () => {
    it("completed jobs have summary and artifacts", () => {
      const run = executeRuntimeRun({
        jobIds: ["governance_evaluation"],
        actor: adminActor,
      });
      const result = run.jobs[0]!;
      expect(result.status).toBe("completed");
      expect(result.summary).not.toBeNull();
      expect(result.summary!.description).toBeTruthy();
      expect(result.summary!.metrics).toBeDefined();
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.durationMs).not.toBeNull();
    });

    it("skipped jobs have null summary and empty artifacts", () => {
      useInMemoryStore({
        jobExecutors: makeExecutors({
          governance_evaluation: () =>
            makeFailedResult("governance_evaluation", "boom"),
        }),
      });

      const run = executeRuntimeRun({ actor: adminActor });
      const skipped = run.jobs.filter((j) => j.status === "skipped");
      for (const s of skipped) {
        expect(s.summary).toBeNull();
        expect(s.artifacts).toEqual([]);
        expect(s.skipReason).toBeTruthy();
      }
    });
  });

  // ── 10. Report & Formatting ─────────────────────────────────
  describe("report and formatting", () => {
    it("builds runtime execution report", () => {
      executeRuntimeRun({ actor: adminActor });
      const report = buildRuntimeExecutionReport();

      expect(report.summary.totalRuns).toBe(1);
      expect(report.summary.lastRunStatus).toBe("completed");
      expect(report.recentRuns).toHaveLength(1);
      expect(report.generatedAt).toBeTruthy();
    });

    it("empty report when no runs", () => {
      const report = buildRuntimeExecutionReport();
      expect(report.summary.totalRuns).toBe(0);
      expect(report.summary.lastRunAt).toBeNull();
      expect(report.recentRuns).toHaveLength(0);
    });

    it("formatRuntimeExecutionRun produces readable output", () => {
      const run = executeRuntimeRun({ actor: adminActor });
      const output = formatRuntimeExecutionRun(run);
      expect(output).toContain("RUNTIME EXECUTION");
      expect(output).toContain("[COMPLETED]");
      expect(output).toContain("[OK]");
      expect(output).toContain("governance_evaluation");
    });

    it("formatRuntimeExecutionReport produces readable output", () => {
      executeRuntimeRun({ actor: adminActor });
      const report = buildRuntimeExecutionReport();
      const output = formatRuntimeExecutionReport(report);
      expect(output).toContain("FACTORY RUNTIME EXECUTION REPORT");
      expect(output).toContain("RECENT RUNS");
    });

    it("report captures group information", () => {
      executeRuntimeRun({ group: "health_check", actor: adminActor });
      const report = buildRuntimeExecutionReport();
      expect(report.summary.lastRunGroup).toBe("health_check");
    });
  });

  // ── 11. Real Executors ──────────────────────────────────────
  describe("real executors (integration)", () => {
    it("executes with real executors when no override", () => {
      useInMemoryStore({ jobExecutors: null });

      const run = executeRuntimeRun({
        jobIds: ["governance_evaluation"],
        actor: adminActor,
      });

      expect(run.completedJobs).toBe(1);
      const result = run.jobs[0]!;
      expect(result.status).toBe("completed");
      expect(result.summary).not.toBeNull();
      expect(result.summary!.metrics).toHaveProperty("totalTemplates");
    });

    it("runs all real executors in nightly group", () => {
      useInMemoryStore({ jobExecutors: null });

      const run = executeRuntimeRun({
        group: "nightly",
        actor: ownerActor,
      });

      expect(run.completedJobs).toBe(7);
      expect(run.failedJobs).toBe(0);

      // Each completed job should have summary and artifacts
      for (const job of run.jobs) {
        expect(job.status).toBe("completed");
        expect(job.summary).not.toBeNull();
        expect(job.artifacts.length).toBeGreaterThan(0);
      }
    });
  });
});
