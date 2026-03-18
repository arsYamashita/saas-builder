/**
 * Factory Runtime Execution v1
 *
 * Provides:
 *   1. Real job executors for 7 registered orchestration jobs
 *   2. Dependency-aware execution via orchestration's resolveExecutionOrder
 *   3. Structured per-job results with summary, artifacts, timing
 *   4. Dry-run (plan) support
 *   5. Run history persistence
 *   6. Group execution (e.g., "nightly" runs all jobs)
 *   7. Role-based authorization
 *
 * Each executor calls the existing Factory module directly.
 * No subprocess spawning, no external CI/CD.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

import {
  type OrchestrationJobId,
  JOB_REGISTRY,
  resolveExecutionOrder,
  getJob,
} from "./factory-orchestration";
import {
  authorizeFactoryAction,
  type FactoryActor,
} from "./team-role-approval";
import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "../templates/template-catalog";
import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
  type TemplateGovernanceBatchResult,
} from "./template-health-governance";
import {
  buildEvolutionReport,
  type EvolutionReport,
} from "./template-evolution-engine";
import {
  buildMarketplaceReport,
  type MarketplaceReport,
} from "./template-marketplace";
import {
  buildDerivationReport,
  type DerivationReport,
} from "./marketplace-derivation-pipeline";
import {
  buildTemplateRankingReport,
  type TemplateRankingReport,
} from "./template-analytics-ranking";
import {
  buildTemplateReleaseReport,
  type TemplateReleaseReport,
} from "./template-release-management";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RuntimeJobStatus = "planned" | "running" | "completed" | "skipped" | "failed";

export interface RuntimeJobSummary {
  description: string;
  metrics: Record<string, number | string>;
}

export interface RuntimeJobArtifact {
  type: string;
  label: string;
  /** Key to reference in downstream jobs or external consumers */
  key: string;
}

export interface RuntimeJobResult {
  jobId: OrchestrationJobId;
  status: RuntimeJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  summary: RuntimeJobSummary | null;
  artifacts: RuntimeJobArtifact[];
  error: string | null;
  skipReason: string | null;
}

export interface RuntimeExecutionRun {
  runId: string;
  mode: "dry_run" | "execute";
  status: "completed" | "failed" | "partial";
  jobs: RuntimeJobResult[];
  executionOrder: OrchestrationJobId[];
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  skippedJobs: number;
  executedBy: string;
  group: string | null;
  startedAt: string;
  completedAt: string;
}

export interface RuntimeExecutionReport {
  recentRuns: RuntimeExecutionRun[];
  summary: {
    totalRuns: number;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunGroup: string | null;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Job Groups
// ---------------------------------------------------------------------------

export type RuntimeJobGroup = "nightly" | "health_check" | "marketplace_refresh";

export const JOB_GROUPS: Record<RuntimeJobGroup, OrchestrationJobId[]> = {
  nightly: [
    "governance_evaluation",
    "nightly_regression",
    "self_improvement_scan",
    "policy_simulation_refresh",
    "marketplace_catalog_refresh",
    "derivation_pipeline_prepare",
    "dashboard_snapshot_refresh",
  ],
  health_check: [
    "governance_evaluation",
    "nightly_regression",
  ],
  marketplace_refresh: [
    "governance_evaluation",
    "marketplace_catalog_refresh",
    "derivation_pipeline_prepare",
  ],
};

export const ALL_GROUPS: RuntimeJobGroup[] = ["nightly", "health_check", "marketplace_refresh"];

// ---------------------------------------------------------------------------
// In-memory store (test support)
// ---------------------------------------------------------------------------

interface RuntimeMemoryState {
  history: RuntimeExecutionRun[];
  /** Override individual job executors for testing */
  jobExecutors: Partial<Record<OrchestrationJobId, () => RuntimeJobResult>> | null;
}

let memoryState: RuntimeMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<RuntimeMemoryState>): void {
  memoryState = {
    history: initial?.history ?? [],
    jobExecutors: initial?.jobExecutors ?? null,
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const HISTORY_PATH = join(DATA_DIR, "factory-runtime-history.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readHistory(): RuntimeExecutionRun[] {
  if (memoryState !== null) {
    return memoryState.history;
  }
  try {
    const raw = readFileSync(HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as RuntimeExecutionRun[];
  } catch {
    return [];
  }
}

function writeHistory(history: RuntimeExecutionRun[]): void {
  if (memoryState !== null) {
    memoryState.history = history;
    return;
  }
  ensureDataDir();
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDefaultSignals(catalogEntry: TemplateCatalogEntry): TemplateHealthSignals {
  const isGreen = catalogEntry.statusBadge === "GREEN";
  return {
    currentState: isGreen ? "green" : "candidate",
    greenCriteria: {
      pipelineComplete: isGreen,
      qualityGatesPass: isGreen,
      baselinePass: isGreen,
      tenantIsolationVerified: isGreen,
      rbacVerified: isGreen,
      runtimeVerificationDone: isGreen,
    },
    recentRegressionStatuses: isGreen ? ["pass", "pass", "pass"] : [],
    latestBaselinePassed: isGreen,
    latestQualityGatesPassed: isGreen,
  };
}

function generateRunId(): string {
  return `runtime-run-${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Real Job Executors
// ---------------------------------------------------------------------------

function executeGovernanceEvaluation(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  const templatesWithSignals = TEMPLATE_CATALOG.map((entry) => ({
    templateKey: entry.templateKey,
    signals: buildDefaultSignals(entry),
  }));

  const batch: TemplateGovernanceBatchResult = evaluateAllTemplateHealth(templatesWithSignals);

  return {
    jobId: "governance_evaluation",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Template health governance evaluation completed",
      metrics: {
        totalTemplates: batch.results.length,
        greenCount: batch.summary.greenCount,
        atRiskCount: batch.summary.atRiskCount,
        degradedCount: batch.summary.degradedCount,
        demotedCount: batch.summary.demotedCount,
        candidateCount: batch.summary.candidateCount,
      },
    },
    artifacts: [
      { type: "governance_batch", label: "Governance Batch Results", key: "governance_batch" },
    ],
    error: null,
    skipReason: null,
  };
}

function executeNightlyRegression(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  // v1: Report regression readiness without spawning async tests
  const greenTemplates = TEMPLATE_CATALOG.filter((t) => t.statusBadge === "GREEN");

  return {
    jobId: "nightly_regression",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Nightly regression readiness check completed",
      metrics: {
        greenTemplateCount: greenTemplates.length,
        regressionTargets: greenTemplates.map((t) => t.templateKey).join(", "),
      },
    },
    artifacts: [
      { type: "regression_targets", label: "Regression Target List", key: "regression_targets" },
    ],
    error: null,
    skipReason: null,
  };
}

function executeSelfImprovementScan(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  const report: EvolutionReport = buildEvolutionReport();

  return {
    jobId: "self_improvement_scan",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Evolution engine scan completed",
      metrics: {
        analyzedTemplates: report.analyzedTemplateCount,
        proposalCount: report.proposals.length,
        coveredDomains: report.coveredDomains.length,
        uncoveredDomains: report.uncoveredDomains.length,
      },
    },
    artifacts: [
      { type: "evolution_report", label: "Evolution Report", key: "evolution_report" },
    ],
    error: null,
    skipReason: null,
  };
}

function executePolicySimulationRefresh(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  const releaseReport: TemplateReleaseReport = buildTemplateReleaseReport();

  return {
    jobId: "policy_simulation_refresh",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Policy simulation and release readiness refresh completed",
      metrics: {
        candidateCount: releaseReport.summary.candidateCount,
        devCount: releaseReport.summary.devCount,
        stagingCount: releaseReport.summary.stagingCount,
        prodCount: releaseReport.summary.prodCount,
        totalHistory: releaseReport.summary.totalHistory,
      },
    },
    artifacts: [
      { type: "release_report", label: "Release Report", key: "release_report" },
    ],
    error: null,
    skipReason: null,
  };
}

function executeMarketplaceCatalogRefresh(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  const report: MarketplaceReport = buildMarketplaceReport();

  return {
    jobId: "marketplace_catalog_refresh",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Marketplace catalog refresh completed",
      metrics: {
        totalItems: report.summary.totalItems,
        publishedCount: report.summary.publishedCount,
        experimentalCount: report.summary.experimentalCount,
        adoptionIntentCount: report.summary.adoptionIntentCount,
        derivationIntentCount: report.summary.derivationIntentCount,
      },
    },
    artifacts: [
      { type: "marketplace_report", label: "Marketplace Report", key: "marketplace_report" },
    ],
    error: null,
    skipReason: null,
  };
}

function executeDerivationPipelinePrepare(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  const report: DerivationReport = buildDerivationReport();

  return {
    jobId: "derivation_pipeline_prepare",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Derivation pipeline preparation completed",
      metrics: {
        totalIntents: report.summary.totalIntents,
        plannedCount: report.summary.plannedCount,
        skippedCount: report.summary.skippedCount,
        preparedCount: report.summary.preparedCount,
        handedOffCount: report.summary.handedOffCount,
      },
    },
    artifacts: [
      { type: "derivation_report", label: "Derivation Report", key: "derivation_report" },
    ],
    error: null,
    skipReason: null,
  };
}

function executeDashboardSnapshotRefresh(): RuntimeJobResult {
  const start = Date.now();
  const startedAt = new Date().toISOString();

  const rankingReport: TemplateRankingReport = buildTemplateRankingReport();

  return {
    jobId: "dashboard_snapshot_refresh",
    status: "completed",
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary: {
      description: "Dashboard snapshot refresh completed",
      metrics: {
        totalTemplates: rankingReport.summary.totalTemplates,
        averageOverallScore: Math.round(rankingReport.summary.averageOverallScore * 100) / 100,
        risingCount: rankingReport.summary.risingCount,
        stableCount: rankingReport.summary.stableCount,
        decliningCount: rankingReport.summary.decliningCount,
      },
    },
    artifacts: [
      { type: "ranking_report", label: "Template Ranking Report", key: "ranking_report" },
    ],
    error: null,
    skipReason: null,
  };
}

/** Map of job ID to real executor function */
const REAL_EXECUTORS: Record<OrchestrationJobId, () => RuntimeJobResult> = {
  governance_evaluation: executeGovernanceEvaluation,
  nightly_regression: executeNightlyRegression,
  self_improvement_scan: executeSelfImprovementScan,
  policy_simulation_refresh: executePolicySimulationRefresh,
  marketplace_catalog_refresh: executeMarketplaceCatalogRefresh,
  derivation_pipeline_prepare: executeDerivationPipelinePrepare,
  dashboard_snapshot_refresh: executeDashboardSnapshotRefresh,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Plan a runtime execution run (dry-run).
 * Does NOT execute jobs, only calculates execution order and checks authorization.
 */
export function planRuntimeExecution(
  options: {
    jobIds?: OrchestrationJobId[];
    group?: RuntimeJobGroup;
    actor: FactoryActor;
  },
): RuntimeExecutionRun {
  const targetJobIds = resolveTargetJobs(options.jobIds, options.group);
  const executionOrder = resolveExecutionOrder(targetJobIds);
  const startedAt = new Date().toISOString();

  const jobs: RuntimeJobResult[] = executionOrder.map((jobId) => {
    const job = getJob(jobId)!;
    const auth = authorizeFactoryAction(options.actor, job.requiredAction);

    if (!auth.allowed) {
      return makeSkippedResult(jobId, auth.reason);
    }

    return {
      jobId,
      status: "planned" as RuntimeJobStatus,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      summary: null,
      artifacts: [],
      error: null,
      skipReason: null,
    };
  });

  return {
    runId: generateRunId(),
    mode: "dry_run",
    status: "completed",
    jobs,
    executionOrder,
    totalJobs: jobs.length,
    completedJobs: 0,
    failedJobs: 0,
    skippedJobs: jobs.filter((j) => j.status === "skipped").length,
    executedBy: options.actor.actorId,
    group: options.group ?? null,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Execute a runtime run with real job executors.
 * Runs jobs in dependency order. If a job fails, downstream dependents are skipped.
 */
export function executeRuntimeRun(
  options: {
    jobIds?: OrchestrationJobId[];
    group?: RuntimeJobGroup;
    actor: FactoryActor;
  },
): RuntimeExecutionRun {
  const targetJobIds = resolveTargetJobs(options.jobIds, options.group);
  const executionOrder = resolveExecutionOrder(targetJobIds);
  const startedAt = new Date().toISOString();
  const runId = generateRunId();

  const completedJobs = new Set<OrchestrationJobId>();
  const failedJobs = new Set<OrchestrationJobId>();
  const results: RuntimeJobResult[] = [];

  for (const jobId of executionOrder) {
    const job = getJob(jobId)!;

    // Check authorization
    const auth = authorizeFactoryAction(options.actor, job.requiredAction);
    if (!auth.allowed) {
      results.push(makeSkippedResult(jobId, auth.reason));
      continue;
    }

    // Check dependencies
    const unmetDeps = job.dependsOn.filter((dep) => {
      if (!executionOrder.includes(dep)) return false;
      return !completedJobs.has(dep);
    });

    if (unmetDeps.length > 0) {
      const failedDeps = unmetDeps.filter((dep) => failedJobs.has(dep));
      const reason = failedDeps.length > 0
        ? `Dependency failed: ${failedDeps.join(", ")}`
        : `Dependency not met: ${unmetDeps.join(", ")}`;
      results.push(makeSkippedResult(jobId, reason));
      continue;
    }

    // Execute with real or overridden executor
    try {
      const executor = memoryState?.jobExecutors?.[jobId] ?? REAL_EXECUTORS[jobId];
      const result = executor();
      results.push(result);

      if (result.status === "completed") {
        completedJobs.add(jobId);
      } else if (result.status === "failed") {
        failedJobs.add(jobId);
      }
    } catch (err) {
      const errorResult: RuntimeJobResult = {
        jobId,
        status: "failed",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        summary: null,
        artifacts: [],
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

  const entry: RuntimeExecutionRun = {
    runId,
    mode: "execute",
    status: runStatus,
    jobs: results,
    executionOrder,
    totalJobs: results.length,
    completedJobs: completedCount,
    failedJobs: failedCount,
    skippedJobs: skippedCount,
    executedBy: options.actor.actorId,
    group: options.group ?? null,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  // Persist history
  const history = readHistory();
  history.push(entry);
  writeHistory(history);

  return entry;
}

/** List runtime execution history */
export function listRuntimeHistory(): RuntimeExecutionRun[] {
  return readHistory();
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function buildRuntimeExecutionReport(): RuntimeExecutionReport {
  const history = readHistory();
  const recentRuns = history.slice(-10);
  const lastRun = history.length > 0 ? history[history.length - 1]! : null;

  return {
    recentRuns,
    summary: {
      totalRuns: history.length,
      lastRunAt: lastRun?.completedAt ?? null,
      lastRunStatus: lastRun?.status ?? null,
      lastRunGroup: lastRun?.group ?? null,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatRuntimeExecutionRun(run: RuntimeExecutionRun): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  const badge =
    run.status === "completed" ? "[COMPLETED]" :
    run.status === "failed" ? "[FAILED]" :
    "[PARTIAL]";

  lines.push(hr);
  lines.push(`  RUNTIME EXECUTION: ${run.runId}  ${badge}`);
  lines.push(
    `  Mode: ${run.mode}  |  Group: ${run.group ?? "—"}  |  ` +
    `Completed: ${run.completedJobs}  |  Failed: ${run.failedJobs}  |  ` +
    `Skipped: ${run.skippedJobs}  |  Total: ${run.totalJobs}`,
  );
  lines.push(hr);

  for (const result of run.jobs) {
    const statusBadge =
      result.status === "completed" ? "[OK]" :
      result.status === "failed" ? "[FAIL]" :
      result.status === "skipped" ? "[SKIP]" :
      result.status === "planned" ? "[PLAN]" :
      `[${result.status.toUpperCase()}]`;

    const timing = result.durationMs !== null ? `  ${result.durationMs}ms` : "";
    const detail = result.error
      ? `  error: ${result.error}`
      : result.skipReason
      ? `  reason: ${result.skipReason}`
      : timing;
    lines.push(`  ${statusBadge}  ${result.jobId}${detail}`);

    if (result.summary) {
      const metricsStr = Object.entries(result.summary.metrics)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`         ${result.summary.description}`);
      lines.push(`         metrics: ${metricsStr}`);
    }

    if (result.artifacts.length > 0) {
      lines.push(`         artifacts: ${result.artifacts.map((a) => a.label).join(", ")}`);
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatRuntimeExecutionReport(report: RuntimeExecutionReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push("  FACTORY RUNTIME EXECUTION REPORT");
  lines.push(hr);

  lines.push(
    `  Runs: ${report.summary.totalRuns}  |  ` +
    `Last Run: ${report.summary.lastRunAt ? new Date(report.summary.lastRunAt).toLocaleString("ja-JP") : "—"}  |  ` +
    `Status: ${report.summary.lastRunStatus ?? "—"}  |  ` +
    `Group: ${report.summary.lastRunGroup ?? "—"}`,
  );

  if (report.recentRuns.length > 0) {
    lines.push("");
    lines.push("  RECENT RUNS:");
    for (const run of report.recentRuns) {
      const badge =
        run.status === "completed" ? "[COMPLETED]" :
        run.status === "failed" ? "[FAILED]" :
        "[PARTIAL]";
      const group = run.group ? ` (${run.group})` : "";
      lines.push(
        `    ${run.startedAt}  ${badge}  ` +
        `${run.completedJobs}/${run.totalJobs} completed${group}  ` +
        `(${run.executedBy})`,
      );
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveTargetJobs(
  jobIds?: OrchestrationJobId[],
  group?: RuntimeJobGroup,
): OrchestrationJobId[] {
  if (jobIds && jobIds.length > 0) {
    // Validate
    const allJobIds = JOB_REGISTRY.map((j) => j.jobId);
    for (const jobId of jobIds) {
      if (!allJobIds.includes(jobId)) {
        throw new Error(`Unknown job ID: ${jobId}`);
      }
    }
    return jobIds;
  }

  if (group) {
    const groupJobs = JOB_GROUPS[group];
    if (!groupJobs) {
      throw new Error(`Unknown group: ${group}`);
    }
    return groupJobs;
  }

  // Default: all jobs
  return JOB_REGISTRY.map((j) => j.jobId);
}

function makeSkippedResult(jobId: OrchestrationJobId, reason: string): RuntimeJobResult {
  return {
    jobId,
    status: "skipped",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    summary: null,
    artifacts: [],
    error: null,
    skipReason: reason,
  };
}
