/**
 * Provider Learning Loop v1
 *
 * Derives learned provider preferences from historical outcomes
 * and feeds bounded adjustments back into routing scores.
 *
 * Pure logic layer — no DB changes, no quality gate changes.
 *
 * Decision rules:
 *   - preferred: high success + promotion, low fallback/rerun
 *   - avoided: low success OR high fallback/rerun
 *   - neutral: everything else
 *
 * Adjustment is bounded to ±0.08 to prevent wild routing swings.
 * All decisions are deterministic and explainable.
 */

import type { ProviderId, TaskKind } from "./provider-interface";
import type { ProviderTaskMetric } from "./provider-scoreboard";

// ── Constants ────────────────────────────────────────────────

/** Maximum absolute adjustment to routing score */
export const MAX_ADJUSTMENT = 0.08;

/** Minimum steps required to derive any preference */
export const MIN_STEPS_FOR_LEARNING = 5;

/** Steps at which confidence reaches 1.0 */
export const FULL_CONFIDENCE_STEPS = 20;

/** Thresholds for preference classification */
export const PREFERENCE_THRESHOLDS = {
  preferred: {
    minSuccessRate: 80,
    minPromotedRate: 50,
    maxFallbackRate: 10,
  },
  avoided: {
    maxSuccessRate: 60,
    minFallbackRate: 30,
    minRerunRate: 25,
  },
} as const;

// ── Types ────────────────────────────────────────────────────

export type ProviderPreference = "preferred" | "neutral" | "avoided";

export interface LearnedProviderPreference {
  provider: ProviderId;
  taskKind: TaskKind;
  preference: ProviderPreference;
  confidence: number; // 0–1
  /** Bounded adjustment applied to routing score [-0.08, +0.08] */
  adjustment: number;
  reasonSummary: string;
}

export interface LearnedPreferences {
  preferences: LearnedProviderPreference[];
  derivedAt: string;
  inputMetricCount: number;
}

export interface ProviderLearningLog {
  taskKind: TaskKind;
  preferences: Array<{
    provider: ProviderId;
    preference: ProviderPreference;
    confidence: number;
    adjustment: number;
  }>;
  appliedAdjustments: Array<{
    provider: ProviderId;
    baseScore: number;
    adjustment: number;
    adjustedScore: number;
  }>;
  timestamp: string;
}

// ── Confidence Computation ───────────────────────────────────

/**
 * Computes learning confidence based on sample size.
 * Linear ramp from 0 at MIN_STEPS to 1.0 at FULL_CONFIDENCE_STEPS.
 */
export function computeLearningConfidence(totalSteps: number): number {
  if (totalSteps < MIN_STEPS_FOR_LEARNING) return 0;
  const raw = (totalSteps - MIN_STEPS_FOR_LEARNING) /
    (FULL_CONFIDENCE_STEPS - MIN_STEPS_FOR_LEARNING);
  return Math.min(1, Math.max(0, Math.round(raw * 100) / 100));
}

// ── Preference Classification ────────────────────────────────

/**
 * Classifies a provider's preference based on its metrics.
 * Returns the preference type and human-readable reasons.
 */
function classifyPreference(
  metric: ProviderTaskMetric
): { preference: ProviderPreference; reasons: string[] } {
  const reasons: string[] = [];
  const t = PREFERENCE_THRESHOLDS;

  // Check avoided conditions first (any single condition triggers)
  if (metric.successRate < t.avoided.maxSuccessRate) {
    reasons.push(`low success rate (${metric.successRate}% < ${t.avoided.maxSuccessRate}%)`);
    return { preference: "avoided", reasons };
  }
  if (metric.fallbackRate >= t.avoided.minFallbackRate) {
    reasons.push(`high fallback rate (${metric.fallbackRate}% >= ${t.avoided.minFallbackRate}%)`);
    return { preference: "avoided", reasons };
  }
  if (metric.rerunRate >= t.avoided.minRerunRate) {
    reasons.push(`high rerun rate (${metric.rerunRate}% >= ${t.avoided.minRerunRate}%)`);
    return { preference: "avoided", reasons };
  }

  // Check preferred conditions (must meet success AND at least one of promotion/fallback)
  if (metric.successRate >= t.preferred.minSuccessRate) {
    const hasHighPromotion = metric.promotedStepRate >= t.preferred.minPromotedRate;
    const hasLowFallback = metric.fallbackRate < t.preferred.maxFallbackRate;

    if (hasHighPromotion || hasLowFallback) {
      if (hasHighPromotion) {
        reasons.push(`high promotion rate (${metric.promotedStepRate}% >= ${t.preferred.minPromotedRate}%)`);
      }
      if (hasLowFallback) {
        reasons.push(`low fallback rate (${metric.fallbackRate}% < ${t.preferred.maxFallbackRate}%)`);
      }
      reasons.push(`high success rate (${metric.successRate}% >= ${t.preferred.minSuccessRate}%)`);
      return { preference: "preferred", reasons };
    }
  }

  return { preference: "neutral", reasons: ["metrics within normal range"] };
}

// ── Reason Summarization ─────────────────────────────────────

/**
 * Builds a human-readable reason summary for a preference decision.
 */
export function summarizeLearningReasons(
  provider: ProviderId,
  taskKind: TaskKind,
  preference: ProviderPreference,
  reasons: string[],
  confidence: number
): string {
  const tag = preference === "preferred" ? "PREFER" :
    preference === "avoided" ? "AVOID" : "NEUTRAL";
  return `[${tag}] ${provider}/${taskKind}: ${reasons.join("; ")} (confidence: ${confidence})`;
}

// ── Core Derivation ──────────────────────────────────────────

/**
 * Derives learned provider preferences from historical metrics.
 *
 * For each provider×taskKind in the metrics:
 * 1. Compute confidence from sample size
 * 2. Classify preference (preferred/neutral/avoided)
 * 3. Compute bounded adjustment
 * 4. Generate explainable reason summary
 *
 * Skips entries with insufficient data (< MIN_STEPS_FOR_LEARNING).
 */
export function deriveLearnedPreferences(
  metrics: ProviderTaskMetric[]
): LearnedPreferences {
  const preferences: LearnedProviderPreference[] = [];

  for (const metric of metrics) {
    const confidence = computeLearningConfidence(metric.totalSteps);
    if (confidence === 0) continue;

    const { preference, reasons } = classifyPreference(metric);

    // Compute bounded adjustment
    let adjustment = 0;
    if (preference === "preferred") {
      adjustment = MAX_ADJUSTMENT * confidence;
    } else if (preference === "avoided") {
      adjustment = -MAX_ADJUSTMENT * confidence;
    }
    adjustment = Math.round(adjustment * 10000) / 10000;

    const reasonSummary = summarizeLearningReasons(
      metric.provider as ProviderId,
      metric.taskKind as TaskKind,
      preference,
      reasons,
      confidence
    );

    preferences.push({
      provider: metric.provider as ProviderId,
      taskKind: metric.taskKind as TaskKind,
      preference,
      confidence,
      adjustment,
      reasonSummary,
    });
  }

  return {
    preferences,
    derivedAt: new Date().toISOString(),
    inputMetricCount: metrics.length,
  };
}

/**
 * Gets learned preferences filtered for a specific taskKind.
 */
export function getLearnedPreferences(
  allPreferences: LearnedPreferences,
  taskKind: TaskKind
): LearnedProviderPreference[] {
  return allPreferences.preferences.filter((p) => p.taskKind === taskKind);
}

/**
 * Returns preferred and avoided providers for a specific taskKind.
 */
export function getPreferencesByCategory(
  allPreferences: LearnedPreferences,
  taskKind: TaskKind
): {
  preferredProviders: ProviderId[];
  avoidedProviders: ProviderId[];
} {
  const taskPrefs = getLearnedPreferences(allPreferences, taskKind);
  return {
    preferredProviders: taskPrefs
      .filter((p) => p.preference === "preferred")
      .map((p) => p.provider),
    avoidedProviders: taskPrefs
      .filter((p) => p.preference === "avoided")
      .map((p) => p.provider),
  };
}

// ── Routing Score Adjustment ─────────────────────────────────

/**
 * Applies learned preference adjustments to routing scores.
 *
 * Takes the scored provider list from the router and applies bounded
 * adjustments based on learned preferences. Returns a new array
 * with adjusted scores (original array not mutated).
 *
 * Adjustment is clamped to [-MAX_ADJUSTMENT, +MAX_ADJUSTMENT].
 */
export function applyLearnedPreferenceAdjustment(
  providerScores: Array<{ provider: ProviderId; score: number }>,
  taskKind: TaskKind,
  allPreferences: LearnedPreferences
): Array<{ provider: ProviderId; score: number; adjustment: number }> {
  const taskPrefs = getLearnedPreferences(allPreferences, taskKind);
  const prefMap = new Map(taskPrefs.map((p) => [p.provider, p]));

  return providerScores.map((ps) => {
    const pref = prefMap.get(ps.provider);
    const adjustment = pref?.adjustment ?? 0;
    return {
      provider: ps.provider,
      score: Math.round((ps.score + adjustment) * 100) / 100,
      adjustment,
    };
  });
}

// ── Logging ──────────────────────────────────────────────────

/**
 * Builds a structured log entry for learning loop decisions.
 */
export function buildProviderLearningLog(
  taskKind: TaskKind,
  taskPreferences: LearnedProviderPreference[],
  adjustedScores: Array<{ provider: ProviderId; score: number; adjustment: number }>,
  originalScores: Array<{ provider: ProviderId; score: number }>
): ProviderLearningLog {
  return {
    taskKind,
    preferences: taskPreferences.map((p) => ({
      provider: p.provider,
      preference: p.preference,
      confidence: p.confidence,
      adjustment: p.adjustment,
    })),
    appliedAdjustments: adjustedScores.map((as) => {
      const orig = originalScores.find((o) => o.provider === as.provider);
      return {
        provider: as.provider,
        baseScore: orig?.score ?? 0,
        adjustment: as.adjustment,
        adjustedScore: as.score,
      };
    }),
    timestamp: new Date().toISOString(),
  };
}
