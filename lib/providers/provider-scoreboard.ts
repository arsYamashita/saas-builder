/**
 * Provider Scoreboard — Factory Intelligence v1
 *
 * Aggregates provider × taskKind × template metrics from steps_json metadata.
 * No DB schema changes required — all data extracted from existing JSONB.
 */

import type { GenerationStep, GenerationStepMeta } from "@/types/generation-run";

// ── Input Types ──────────────────────────────────────────────

export interface GenerationRunInput {
  id: string;
  template_key: string;
  status: string;
  steps_json: GenerationStep[];
  promoted_at: string | null;
  review_status: string;
  /** v1.1: used by getRecentProviderMetrics for time-window filtering */
  started_at?: string;
}

// ── Output Types ─────────────────────────────────────────────

/** Per provider × taskKind breakdown */
export interface ProviderTaskMetric {
  provider: string;
  taskKind: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  successRate: number; // 0-100
  fallbackCount: number;
  fallbackRate: number; // 0-100
  rerunCount: number;
  rerunRate: number; // 0-100
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  // v1.1: token & cost metrics
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerStep: number;
  // v1.1: promotion contribution
  promotedSteps: number;
  promotedStepRate: number; // 0-100
  // v1.1: fallback reasons (top reasons)
  fallbackReasons: string[];
}

/** Per template summary */
export interface TemplateProviderSummary {
  templateKey: string;
  totalRuns: number;
  completedRuns: number;
  promotedRuns: number;
  promotionRate: number; // 0-100
  totalCostUsd: number;
  avgCostPerRun: number;
  stepMetrics: ProviderTaskMetric[];
}

export interface ProviderScoreboardData {
  templates: TemplateProviderSummary[];
  globalMetrics: ProviderTaskMetric[];
  generatedAt: string;
}

// ── Internal accumulator ─────────────────────────────────────

interface StepAccumulator {
  provider: string;
  taskKind: string;
  total: number;
  completed: number;
  failed: number;
  fallbackCount: number;
  rerunCount: number;
  durations: number[];
  // v1.1
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  promotedSteps: number;
  fallbackReasons: string[];
}

function makeKey(provider: string, taskKind: string): string {
  return `${provider}::${taskKind}`;
}

function accumulateStep(
  acc: Map<string, StepAccumulator>,
  step: GenerationStep,
  meta: GenerationStepMeta | undefined,
  isPromotedRun: boolean
): void {
  const provider = meta?.provider ?? "unknown";
  const taskKind = meta?.taskKind ?? step.key;
  const key = makeKey(provider, taskKind);

  if (!acc.has(key)) {
    acc.set(key, {
      provider,
      taskKind,
      total: 0,
      completed: 0,
      failed: 0,
      fallbackCount: 0,
      rerunCount: 0,
      durations: [],
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      promotedSteps: 0,
      fallbackReasons: [],
    });
  }

  const bucket = acc.get(key)!;
  bucket.total++;

  if (step.status === "completed") bucket.completed++;
  if (step.status === "failed") bucket.failed++;
  if (meta?.fallbackUsed) {
    bucket.fallbackCount++;
    if (meta.fallbackReason) bucket.fallbackReasons.push(meta.fallbackReason);
  }
  if (meta?.rerunAt) bucket.rerunCount++;
  if (meta?.durationMs != null && meta.durationMs > 0) {
    bucket.durations.push(meta.durationMs);
  }

  // v1.1: tokens & cost
  if (meta?.inputTokens != null) bucket.inputTokens += meta.inputTokens;
  if (meta?.outputTokens != null) bucket.outputTokens += meta.outputTokens;
  if (meta?.totalTokens != null) bucket.totalTokens += meta.totalTokens;
  if (meta?.estimatedCostUsd != null) bucket.totalCostUsd += meta.estimatedCostUsd;

  // v1.1: promotion contribution
  if (isPromotedRun && step.status === "completed") bucket.promotedSteps++;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function toMetric(bucket: StepAccumulator): ProviderTaskMetric {
  const sorted = [...bucket.durations].sort((a, b) => a - b);
  const avgMs =
    sorted.length > 0
      ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
      : 0;

  // Deduplicate fallback reasons, keep top 3
  const reasonCounts = new Map<string, number>();
  for (const r of bucket.fallbackReasons) {
    const short = r.slice(0, 100);
    reasonCounts.set(short, (reasonCounts.get(short) ?? 0) + 1);
  }
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => reason);

  return {
    provider: bucket.provider,
    taskKind: bucket.taskKind,
    totalSteps: bucket.total,
    completedSteps: bucket.completed,
    failedSteps: bucket.failed,
    successRate: bucket.total > 0 ? Math.round((bucket.completed / bucket.total) * 100) : 0,
    fallbackCount: bucket.fallbackCount,
    fallbackRate: bucket.total > 0 ? Math.round((bucket.fallbackCount / bucket.total) * 100) : 0,
    rerunCount: bucket.rerunCount,
    rerunRate: bucket.total > 0 ? Math.round((bucket.rerunCount / bucket.total) * 100) : 0,
    avgDurationMs: avgMs,
    p50DurationMs: percentile(sorted, 50),
    p95DurationMs: percentile(sorted, 95),
    // v1.1
    totalInputTokens: bucket.inputTokens,
    totalOutputTokens: bucket.outputTokens,
    totalTokens: bucket.totalTokens,
    totalCostUsd: Math.round(bucket.totalCostUsd * 10000) / 10000,
    avgCostPerStep: bucket.total > 0
      ? Math.round((bucket.totalCostUsd / bucket.total) * 10000) / 10000
      : 0,
    promotedSteps: bucket.promotedSteps,
    promotedStepRate: bucket.total > 0
      ? Math.round((bucket.promotedSteps / bucket.total) * 100)
      : 0,
    fallbackReasons: topReasons,
  };
}

// ── Public API ───────────────────────────────────────────────

// ── Recent Metrics ──────────────────────────────────────────

export interface RecentMetricsOptions {
  /** Cutoff timestamp — only runs started after this are "recent" */
  since?: string;
  /** Max number of most-recent runs to consider */
  maxRuns?: number;
}

const DEFAULT_RECENT_MAX_RUNS = 50;

/**
 * Computes provider metrics from recent runs only.
 *
 * "Recent" = runs started after `since` (default: 24h ago),
 * capped at `maxRuns` (default: 50) most-recent runs.
 *
 * Returns the same ProviderTaskMetric[] shape as globalMetrics.
 * If no recent runs match, returns an empty array (caller should
 * fall back to global metrics).
 */
export function getRecentProviderMetrics(
  runs: GenerationRunInput[],
  options?: RecentMetricsOptions
): ProviderTaskMetric[] {
  const since = options?.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const maxRuns = options?.maxRuns ?? DEFAULT_RECENT_MAX_RUNS;

  // Filter to recent runs with a started_at field
  const recentRuns = runs
    .filter((r) => r.started_at != null && r.started_at >= since)
    .slice(0, maxRuns);

  if (recentRuns.length === 0) return [];

  const acc = new Map<string, StepAccumulator>();
  for (const run of recentRuns) {
    const steps = run.steps_json ?? [];
    const isPromoted = run.promoted_at != null;
    for (const step of steps) {
      if (step.status === "pending") continue;
      accumulateStep(acc, step, step.meta, isPromoted);
    }
  }

  return Array.from(acc.values()).map(toMetric);
}

// ── Public API ───────────────────────────────────────────────

export function buildProviderScoreboard(
  runs: GenerationRunInput[]
): ProviderScoreboardData {
  // Group by template
  const byTemplate = new Map<string, GenerationRunInput[]>();
  for (const run of runs) {
    const key = run.template_key;
    if (!byTemplate.has(key)) byTemplate.set(key, []);
    byTemplate.get(key)!.push(run);
  }

  const globalAcc = new Map<string, StepAccumulator>();
  const templates: TemplateProviderSummary[] = [];

  for (const [templateKey, templateRuns] of Array.from(byTemplate.entries())) {
    const templateAcc = new Map<string, StepAccumulator>();

    const totalRuns = templateRuns.length;
    const completedRuns = templateRuns.filter((r: GenerationRunInput) => r.status === "completed").length;
    const promotedRuns = templateRuns.filter((r: GenerationRunInput) => r.promoted_at != null).length;
    const approvedRuns = templateRuns.filter((r: GenerationRunInput) => r.review_status === "approved").length;

    for (const run of templateRuns) {
      const steps = run.steps_json ?? [];
      const isPromoted = run.promoted_at != null;
      for (const step of steps) {
        if (step.status === "pending") continue; // skip never-started steps
        accumulateStep(templateAcc, step, step.meta, isPromoted);
        accumulateStep(globalAcc, step, step.meta, isPromoted);
      }
    }

    const stepMetrics = Array.from(templateAcc.values()).map(toMetric);
    const totalCostUsd = stepMetrics.reduce((sum, m) => sum + m.totalCostUsd, 0);

    templates.push({
      templateKey,
      totalRuns,
      completedRuns,
      promotedRuns,
      promotionRate: approvedRuns > 0 ? Math.round((promotedRuns / approvedRuns) * 100) : 0,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      avgCostPerRun: totalRuns > 0
        ? Math.round((totalCostUsd / totalRuns) * 10000) / 10000
        : 0,
      stepMetrics,
    });
  }

  templates.sort((a, b) => a.templateKey.localeCompare(b.templateKey));

  return {
    templates,
    globalMetrics: Array.from(globalAcc.values()).map(toMetric),
    generatedAt: new Date().toISOString(),
  };
}
