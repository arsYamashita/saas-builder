/**
 * CI/CD Factory Orchestration v1
 *
 * Provides:
 *   1. Job registry for recurring Factory workflows
 *   2. Dry-run plan generation
 *   3. Sequential execution with dependency ordering
 *   4. Run history tracking
 *   5. Reporting for dashboard integration
 *   6. Role-based authorization
 *
 * Conservative v1 — in-memory execution (no actual subprocess spawning),
 * JSON file history, no external CI/CD integration.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import {
  authorizeFactoryAction,
  type FactoryActor,
  type FactoryAction,
} from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrchestrationJobId =
  | "governance_evaluation"
  | "nightly_regression"
  | "self_improvement_scan"
  | "policy_simulation_refresh"
  | "marketplace_catalog_refresh"
  | "derivation_pipeline_prepare"
  | "dashboard_snapshot_refresh";

export type OrchestrationRunStatus =
  | "planned"
  | "skipped"
  | "running"
  | "completed"
  | "failed";

export interface OrchestrationJob {
  jobId: OrchestrationJobId;
  label: string;
  description: string;
  /** Jobs that must complete before this one runs */
  dependsOn: OrchestrationJobId[];
  /** Required FactoryAction for execution */
  requiredAction: FactoryAction;
  /** Estimated duration label (informational) */
  estimatedDuration: string;
}

export interface OrchestrationJobResult {
  jobId: OrchestrationJobId;
  status: OrchestrationRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  skipReason: string | null;
}

export interface OrchestrationRunPlan {
  runId: string;
  mode: "dry_run" | "execute";
  jobs: OrchestrationJobResult[];
  executionOrder: OrchestrationJobId[];
  totalJobs: number;
  actor: FactoryActor;
  createdAt: string;
}

export interface OrchestrationHistoryEntry {
  runId: string;
  mode: "dry_run" | "execute";
  status: "completed" | "failed" | "partial";
  jobResults: OrchestrationJobResult[];
  executionOrder: OrchestrationJobId[];
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  skippedJobs: number;
  executedBy: string;
  startedAt: string;
  completedAt: string;
}

export interface OrchestrationReport {
  registry: OrchestrationJob[];
  recentRuns: OrchestrationHistoryEntry[];
  summary: {
    totalJobs: number;
    totalRuns: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Job Registry (static, code-defined)
// ---------------------------------------------------------------------------

export const JOB_REGISTRY: OrchestrationJob[] = [
  {
    jobId: "governance_evaluation",
    label: "Governance Evaluation",
    description: "Evaluate template health governance for all templates",
    dependsOn: [],
    requiredAction: "orchestration.run",
    estimatedDuration: "~5s",
  },
  {
    jobId: "nightly_regression",
    label: "Nightly Regression",
    description: "Run regression tests for all GREEN templates",
    dependsOn: ["governance_evaluation"],
    requiredAction: "orchestration.run",
    estimatedDuration: "~2min",
  },
  {
    jobId: "self_improvement_scan",
    label: "Self-Improvement Scan",
    description: "Scan for improvement proposals via evolution engine",
    dependsOn: ["governance_evaluation"],
    requiredAction: "orchestration.run",
    estimatedDuration: "~10s",
  },
  {
    jobId: "policy_simulation_refresh",
    label: "Policy Simulation Refresh",
    description: "Refresh policy simulation cache for promotion readiness",
    dependsOn: ["governance_evaluation"],
    requiredAction: "orchestration.run",
    estimatedDuration: "~3s",
  },
  {
    jobId: "marketplace_catalog_refresh",
    label: "Marketplace Catalog Refresh",
    description: "Rebuild marketplace catalog with latest health data",
    dependsOn: ["governance_evaluation"],
    requiredAction: "orchestration.run",
    estimatedDuration: "~2s",
  },
  {
    jobId: "derivation_pipeline_prepare",
    label: "Derivation Pipeline Prepare",
    description: "Process pending derivation intents into candidates",
    dependsOn: ["marketplace_catalog_refresh"],
    requiredAction: "orchestration.run",
    estimatedDuration: "~5s",
  },
  {
    jobId: "dashboard_snapshot_refresh",
    label: "Dashboard Snapshot Refresh",
    description: "Refresh dashboard data snapshot for observability",
    dependsOn: [
      "governance_evaluation",
      "nightly_regression",
      "self_improvement_scan",
      "marketplace_catalog_refresh",
    ],
    requiredAction: "orchestration.run",
    estimatedDuration: "~2s",
  },
];

// ---------------------------------------------------------------------------
// In-memory store (test support)
// ---------------------------------------------------------------------------

interface MemoryState {
  history: OrchestrationHistoryEntry[];
  /** Optional job executor override for testing */
  jobExecutor: ((jobId: OrchestrationJobId) => OrchestrationJobResult) | null;
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(initial?: Partial<MemoryState>): void {
  memoryState = {
    history: initial?.history ?? [],
    jobExecutor: initial?.jobExecutor ?? null,
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const HISTORY_PATH = join(DATA_DIR, "factory-orchestration-history.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readHistory(): OrchestrationHistoryEntry[] {
  if (memoryState !== null) {
    return memoryState.history;
  }
  try {
    const raw = readFileSync(HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as OrchestrationHistoryEntry[];
  } catch {
    return [];
  }
}

function writeHistory(history: OrchestrationHistoryEntry[]): void {
  if (memoryState !== null) {
    memoryState.history = history;
    return;
  }
  ensureDataDir();
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Dependency resolution (topological sort)
// ---------------------------------------------------------------------------

export function resolveExecutionOrder(
  jobIds: OrchestrationJobId[],
): OrchestrationJobId[] {
  const jobSet = new Set(jobIds);
  const jobMap = new Map<OrchestrationJobId, OrchestrationJob>();
  for (const job of JOB_REGISTRY) {
    if (jobSet.has(job.jobId)) {
      jobMap.set(job.jobId, job);
    }
  }

  const visited = new Set<OrchestrationJobId>();
  const result: OrchestrationJobId[] = [];

  function visit(jobId: OrchestrationJobId): void {
    if (visited.has(jobId)) return;
    visited.add(jobId);

    const job = jobMap.get(jobId);
    if (!job) return;

    for (const dep of job.dependsOn) {
      if (jobSet.has(dep)) {
        visit(dep);
      }
    }

    result.push(jobId);
  }

  for (const jobId of jobIds) {
    visit(jobId);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** List all registered jobs */
export function listJobs(): OrchestrationJob[] {
  return [...JOB_REGISTRY];
}

/** Get a specific job by ID */
export function getJob(jobId: OrchestrationJobId): OrchestrationJob | null {
  return JOB_REGISTRY.find((j) => j.jobId === jobId) ?? null;
}

/** Generate a unique run ID */
function generateRunId(): string {
  return `orch-run-${Date.now()}`;
}

/** Default job executor (simulated — v1 does not spawn subprocesses) */
function defaultJobExecutor(jobId: OrchestrationJobId): OrchestrationJobResult {
  const start = new Date().toISOString();
  // v1: Simulated execution — always succeeds
  return {
    jobId,
    status: "completed",
    startedAt: start,
    completedAt: new Date().toISOString(),
    durationMs: 0,
    error: null,
    skipReason: null,
  };
}

/**
 * Plan an orchestration run (dry-run).
 * Does NOT execute jobs, only calculates execution order and checks authorization.
 */
export function planOrchestrationRun(
  options: {
    jobIds?: OrchestrationJobId[];
    actor: FactoryActor;
  },
): OrchestrationRunPlan {
  const allJobIds = JOB_REGISTRY.map((j) => j.jobId);
  const targetJobIds = options.jobIds ?? allJobIds;

  // Validate job IDs
  for (const jobId of targetJobIds) {
    if (!allJobIds.includes(jobId)) {
      throw new Error(`Unknown job ID: ${jobId}`);
    }
  }

  const executionOrder = resolveExecutionOrder(targetJobIds);

  // Check authorization for each job
  const jobs: OrchestrationJobResult[] = executionOrder.map((jobId) => {
    const job = getJob(jobId)!;
    const auth = authorizeFactoryAction(options.actor, job.requiredAction);

    if (!auth.allowed) {
      return {
        jobId,
        status: "skipped" as OrchestrationRunStatus,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        skipReason: auth.reason,
      };
    }

    return {
      jobId,
      status: "planned" as OrchestrationRunStatus,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      error: null,
      skipReason: null,
    };
  });

  return {
    runId: generateRunId(),
    mode: "dry_run",
    jobs,
    executionOrder,
    totalJobs: jobs.length,
    actor: options.actor,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Execute an orchestration run.
 * Runs jobs in dependency order. If a job fails, downstream dependents are skipped.
 */
export function executeOrchestrationRun(
  options: {
    jobIds?: OrchestrationJobId[];
    actor: FactoryActor;
  },
): OrchestrationHistoryEntry {
  const allJobIds = JOB_REGISTRY.map((j) => j.jobId);
  const targetJobIds = options.jobIds ?? allJobIds;

  // Validate job IDs
  for (const jobId of targetJobIds) {
    if (!allJobIds.includes(jobId)) {
      throw new Error(`Unknown job ID: ${jobId}`);
    }
  }

  const executionOrder = resolveExecutionOrder(targetJobIds);
  const executor = memoryState?.jobExecutor ?? defaultJobExecutor;
  const startedAt = new Date().toISOString();
  const runId = generateRunId();

  const completedJobs = new Set<OrchestrationJobId>();
  const failedJobs = new Set<OrchestrationJobId>();
  const results: OrchestrationJobResult[] = [];

  for (const jobId of executionOrder) {
    const job = getJob(jobId)!;

    // Check authorization
    const auth = authorizeFactoryAction(options.actor, job.requiredAction);
    if (!auth.allowed) {
      results.push({
        jobId,
        status: "skipped",
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        skipReason: auth.reason,
      });
      continue;
    }

    // Check dependencies
    const unmetDeps = job.dependsOn.filter((dep) => {
      // Only check deps that are in our target set
      if (!executionOrder.includes(dep)) return false;
      return !completedJobs.has(dep);
    });

    if (unmetDeps.length > 0) {
      const failedDeps = unmetDeps.filter((dep) => failedJobs.has(dep));
      results.push({
        jobId,
        status: "skipped",
        startedAt: null,
        completedAt: null,
        durationMs: null,
        error: null,
        skipReason: failedDeps.length > 0
          ? `Dependency failed: ${failedDeps.join(", ")}`
          : `Dependency not met: ${unmetDeps.join(", ")}`,
      });
      continue;
    }

    // Execute
    try {
      const result = executor(jobId);
      results.push(result);

      if (result.status === "completed") {
        completedJobs.add(jobId);
      } else if (result.status === "failed") {
        failedJobs.add(jobId);
      }
    } catch (err) {
      const errorResult: OrchestrationJobResult = {
        jobId,
        status: "failed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        error: err instanceof Error ? err.message : String(err),
        skipReason: null,
      };
      results.push(errorResult);
      failedJobs.add(jobId);
    }
  }

  const completedCount = results.filter((r) => r.status === "completed").length;
  const failedCount = results.filter((r) => r.status === "failed").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;

  let runStatus: "completed" | "failed" | "partial";
  if (failedCount === 0 && skippedCount === 0) {
    runStatus = "completed";
  } else if (completedCount === 0) {
    runStatus = "failed";
  } else {
    runStatus = "partial";
  }

  const entry: OrchestrationHistoryEntry = {
    runId,
    mode: "execute",
    status: runStatus,
    jobResults: results,
    executionOrder,
    totalJobs: results.length,
    completedJobs: completedCount,
    failedJobs: failedCount,
    skippedJobs: skippedCount,
    executedBy: options.actor.actorId,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  // Persist history
  const history = readHistory();
  history.push(entry);
  writeHistory(history);

  return entry;
}

/** List orchestration run history */
export function listOrchestrationHistory(): OrchestrationHistoryEntry[] {
  return readHistory();
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function buildOrchestrationReport(): OrchestrationReport {
  const history = readHistory();
  const recentRuns = history.slice(-10);
  const lastRun = history.length > 0 ? history[history.length - 1]! : null;

  return {
    registry: [...JOB_REGISTRY],
    recentRuns,
    summary: {
      totalJobs: JOB_REGISTRY.length,
      totalRuns: history.length,
      lastRunAt: lastRun?.completedAt ?? null,
      lastRunStatus: lastRun?.status ?? null,
    },
    generatedAt: new Date().toISOString(),
  };
}

export function formatOrchestrationReport(
  report: OrchestrationReport,
): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push("  FACTORY ORCHESTRATION REPORT");
  lines.push(hr);

  lines.push(
    `  Jobs: ${report.summary.totalJobs}  |  ` +
    `Runs: ${report.summary.totalRuns}  |  ` +
    `Last Run: ${report.summary.lastRunAt ? new Date(report.summary.lastRunAt).toLocaleString("ja-JP") : "—"}  |  ` +
    `Status: ${report.summary.lastRunStatus ?? "—"}`,
  );

  lines.push("");
  lines.push("  JOB REGISTRY:");
  for (const job of report.registry) {
    const deps = job.dependsOn.length > 0
      ? ` (depends: ${job.dependsOn.join(", ")})`
      : "";
    lines.push(`    [${job.jobId}] ${job.label}${deps}`);
    lines.push(`      ${job.description}  ${job.estimatedDuration}`);
  }

  if (report.recentRuns.length > 0) {
    lines.push("");
    lines.push("  RECENT RUNS:");
    for (const run of report.recentRuns) {
      const badge =
        run.status === "completed" ? "[COMPLETED]" :
        run.status === "failed" ? "[FAILED]" :
        "[PARTIAL]";
      lines.push(
        `    ${run.startedAt}  ${badge}  ` +
        `${run.completedJobs}/${run.totalJobs} completed  ` +
        `(${run.executedBy})`,
      );
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatOrchestrationPlan(
  plan: OrchestrationRunPlan,
): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push(`  ORCHESTRATION PLAN: ${plan.runId}`);
  lines.push(`  Mode: ${plan.mode}  |  Jobs: ${plan.totalJobs}  |  Actor: ${plan.actor.actorId} (${plan.actor.role})`);
  lines.push(hr);

  lines.push("  Execution order:");
  for (let i = 0; i < plan.executionOrder.length; i++) {
    const jobId = plan.executionOrder[i]!;
    const jobResult = plan.jobs.find((j) => j.jobId === jobId);
    const status = jobResult?.status ?? "unknown";
    const badge =
      status === "planned" ? "[PLANNED]" :
      status === "skipped" ? "[SKIPPED]" :
      `[${status.toUpperCase()}]`;
    const reason = jobResult?.skipReason ? `  — ${jobResult.skipReason}` : "";
    lines.push(`    ${i + 1}. ${jobId}  ${badge}${reason}`);
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatOrchestrationResult(
  entry: OrchestrationHistoryEntry,
): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  const badge =
    entry.status === "completed" ? "[COMPLETED]" :
    entry.status === "failed" ? "[FAILED]" :
    "[PARTIAL]";

  lines.push(hr);
  lines.push(`  ORCHESTRATION RUN: ${entry.runId}  ${badge}`);
  lines.push(
    `  Completed: ${entry.completedJobs}  |  Failed: ${entry.failedJobs}  |  ` +
    `Skipped: ${entry.skippedJobs}  |  Total: ${entry.totalJobs}`,
  );
  lines.push(hr);

  for (const result of entry.jobResults) {
    const statusBadge =
      result.status === "completed" ? "[OK]" :
      result.status === "failed" ? "[FAIL]" :
      result.status === "skipped" ? "[SKIP]" :
      `[${result.status.toUpperCase()}]`;
    const detail = result.error
      ? `  error: ${result.error}`
      : result.skipReason
      ? `  reason: ${result.skipReason}`
      : result.durationMs !== null
      ? `  ${result.durationMs}ms`
      : "";
    lines.push(`  ${statusBadge}  ${result.jobId}${detail}`);
  }

  lines.push(hr);
  return lines.join("\n");
}
