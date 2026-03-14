/**
 * Provider Routing Intelligence v1.1 — Adaptive Routing
 *
 * Data-driven provider selection using Scoreboard metrics.
 * Pure logic layer — no DB changes, no quality gate changes.
 *
 * v1.0: Base routing score from global historical metrics.
 * v1.1: Adaptive routing blending base + recent performance.
 *
 * Final Score Formula:
 *   final_score = base_score * 0.7 + recent_score * 0.3
 *
 * Base/Recent Score Formula:
 *   (success_rate * 0.4)
 * + (promotion_rate * 0.25)
 * - (fallback_rate * 0.15)
 * - (rerun_rate * 0.10)
 * - (cost_penalty * 0.05)
 * - (duration_penalty * 0.05)
 */

import type { ProviderTaskMetric } from "./provider-scoreboard";
import type { ProviderId, TaskKind } from "./provider-interface";

// ── Weights ─────────────────────────────────────────────────

export const ROUTING_WEIGHTS = {
  successRate: 0.4,
  promotionRate: 0.25,
  fallbackRate: 0.15,
  rerunRate: 0.1,
  costPenalty: 0.05,
  durationPenalty: 0.05,
} as const;

/** v1.1: Blending weights for base vs recent scores */
export const ADAPTIVE_WEIGHTS = {
  base: 0.7,
  recent: 0.3,
} as const;

// ── Candidate Providers per TaskKind ────────────────────────

/**
 * Defines which providers are eligible for each pipeline step.
 * The router only considers providers in this list.
 */
export const STEP_CANDIDATE_PROVIDERS: Record<TaskKind, ProviderId[]> = {
  intake: ["gemini", "claude"],
  blueprint: ["gemini", "claude"],
  brief_rewrite: ["gemini", "claude"],
  implementation: ["claude", "gemini"],
  schema: ["claude"],
  api_design: ["claude", "gemini"],
  file_split: ["claude"],
  ui_generation: ["claude"],
  quality_fix: ["claude"],
  regression_repair: ["claude"],
};

// ── Types ───────────────────────────────────────────────────

export type MetricsWindow = "global" | "adaptive";

export interface RoutingDecision {
  provider: ProviderId;
  score: number;
  fallbacks: ProviderId[];
  /** Per-provider scores for logging/debugging */
  providerScores: Array<{ provider: ProviderId; score: number }>;
  /** v1.1: base score from global metrics (undefined on cold start) */
  baseScore?: number;
  /** v1.1: recent score from recent window (undefined when no recent data) */
  recentScore?: number;
  /** v1.1: which metrics window was used */
  metricsWindow: MetricsWindow;
}

export interface RoutingContext {
  /** Global metrics per provider for the given taskKind */
  metrics: ProviderTaskMetric[];
  /** v1.1: Recent metrics (last 24h / last 50 runs) */
  recentMetrics?: ProviderTaskMetric[];
}

// ── Normalization Helpers ───────────────────────────────────

/**
 * Normalizes a value to 0–100 range using min-max among candidates.
 * Returns 0 if max equals min (all same value).
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return ((value - min) / (max - min)) * 100;
}

// ── Core Scoring ────────────────────────────────────────────

/**
 * Computes a single-window routing score for a provider's metrics.
 *
 * Cost and duration penalties are normalized across all candidate metrics,
 * so pass the full set of metrics for context.
 */
export function computeBaseScore(
  metric: ProviderTaskMetric,
  allMetrics: ProviderTaskMetric[]
): number {
  // Direct rates (already 0-100)
  const successRate = metric.successRate;
  const promotionRate = metric.promotedStepRate;
  const fallbackRate = metric.fallbackRate;
  const rerunRate = metric.rerunRate;

  // Normalize cost and duration across candidates
  const costs = allMetrics.map((m) => m.avgCostPerStep);
  const durations = allMetrics.map((m) => m.p95DurationMs);

  const costPenalty = normalize(
    metric.avgCostPerStep,
    Math.min(...costs),
    Math.max(...costs)
  );

  const durationPenalty = normalize(
    metric.p95DurationMs,
    Math.min(...durations),
    Math.max(...durations)
  );

  const w = ROUTING_WEIGHTS;
  const score =
    successRate * w.successRate +
    promotionRate * w.promotionRate -
    fallbackRate * w.fallbackRate -
    rerunRate * w.rerunRate -
    costPenalty * w.costPenalty -
    durationPenalty * w.durationPenalty;

  return Math.round(score * 100) / 100;
}

/** @deprecated Use computeBaseScore — kept as alias for backward compatibility */
export const computeRoutingScore = computeBaseScore;

/**
 * v1.1: Computes the adaptive routing score blending base + recent.
 *
 * final = base * 0.7 + recent * 0.3
 *
 * If recentMetric is null (insufficient recent data), falls back to base only.
 */
export function computeAdaptiveScore(
  baseScore: number,
  recentScore: number | null
): number {
  if (recentScore == null) {
    return Math.round(baseScore * 100) / 100;
  }
  const w = ADAPTIVE_WEIGHTS;
  const score = baseScore * w.base + recentScore * w.recent;
  return Math.round(score * 100) / 100;
}

// ── Provider Selection ──────────────────────────────────────

/**
 * Selects the best provider for a given taskKind based on scoreboard metrics.
 *
 * v1.1: When recentMetrics are provided, blends base + recent scores.
 *
 * Algorithm:
 * 1. Filter metrics to candidate providers for this taskKind
 * 2. Compute base score for each candidate (global metrics)
 * 3. Compute recent score for each candidate (recent metrics, if available)
 * 4. Blend into final adaptive score
 * 5. Sort by final score descending
 * 6. Return highest as primary, rest as fallbacks
 *
 * If no metrics exist (cold start), returns the first candidate provider
 * with the rest as fallbacks.
 */
export function selectProvider(
  taskKind: TaskKind,
  context: RoutingContext
): RoutingDecision {
  const candidates = STEP_CANDIDATE_PROVIDERS[taskKind];

  if (candidates.length === 0) {
    throw new Error(`No candidate providers configured for taskKind=${taskKind}`);
  }

  // Filter metrics to candidates for this taskKind
  const candidateMetrics = context.metrics.filter(
    (m) =>
      m.taskKind === taskKind &&
      candidates.includes(m.provider as ProviderId)
  );

  // Cold start: no metrics available, use static ordering
  if (candidateMetrics.length === 0) {
    return {
      provider: candidates[0],
      score: 0,
      fallbacks: candidates.slice(1),
      providerScores: candidates.map((p) => ({ provider: p, score: 0 })),
      metricsWindow: "global",
    };
  }

  // Filter recent metrics to candidates for this taskKind
  const recentCandidateMetrics = (context.recentMetrics ?? []).filter(
    (m) =>
      m.taskKind === taskKind &&
      candidates.includes(m.provider as ProviderId)
  );

  const hasRecentData = recentCandidateMetrics.length > 0;
  const metricsWindow: MetricsWindow = hasRecentData ? "adaptive" : "global";

  // Compute scores per provider
  const scored: Array<{
    provider: ProviderId;
    score: number;
    baseScore: number;
    recentScore: number | null;
  }> = candidateMetrics.map((m) => {
    const base = computeBaseScore(m, candidateMetrics);

    // Find matching recent metric for this provider
    const recentMetric = recentCandidateMetrics.find(
      (rm) => rm.provider === m.provider
    );
    const recent = recentMetric
      ? computeBaseScore(recentMetric, recentCandidateMetrics)
      : null;

    const final = computeAdaptiveScore(base, recent);

    return {
      provider: m.provider as ProviderId,
      score: final,
      baseScore: base,
      recentScore: recent,
    };
  });

  // Sort descending by final score
  scored.sort((a, b) => b.score - a.score);

  // Include candidates without metrics at the end with score 0
  const scoredProviders = new Set(scored.map((s) => s.provider));
  for (const p of candidates) {
    if (!scoredProviders.has(p)) {
      scored.push({ provider: p, score: 0, baseScore: 0, recentScore: null });
    }
  }

  const primary = scored[0];
  const fallbacks = scored.slice(1).map((s) => s.provider);

  return {
    provider: primary.provider,
    score: primary.score,
    fallbacks,
    providerScores: scored.map((s) => ({ provider: s.provider, score: s.score })),
    baseScore: primary.baseScore,
    recentScore: primary.recentScore ?? undefined,
    metricsWindow,
  };
}

/**
 * Returns fallback providers for a taskKind, ordered by routing score.
 * Convenience wrapper over selectProvider.
 */
export function getFallbackProviders(
  taskKind: TaskKind,
  context: RoutingContext
): ProviderId[] {
  return selectProvider(taskKind, context).fallbacks;
}

// ── Logging Helper ──────────────────────────────────────────

export interface RoutingLog {
  taskKind: TaskKind;
  selectedProvider: ProviderId;
  routingScore: number;
  /** v1.1 */
  baseScore?: number;
  /** v1.1 */
  recentScore?: number;
  /** v1.1 */
  metricsWindow: MetricsWindow;
  fallbackProviders: ProviderId[];
  providerScores: Array<{ provider: ProviderId; score: number }>;
  timestamp: string;
}

/**
 * Builds a structured log entry for a routing decision.
 */
export function buildRoutingLog(
  taskKind: TaskKind,
  decision: RoutingDecision
): RoutingLog {
  return {
    taskKind,
    selectedProvider: decision.provider,
    routingScore: decision.score,
    baseScore: decision.baseScore,
    recentScore: decision.recentScore,
    metricsWindow: decision.metricsWindow,
    fallbackProviders: decision.fallbacks,
    providerScores: decision.providerScores,
    timestamp: new Date().toISOString(),
  };
}
