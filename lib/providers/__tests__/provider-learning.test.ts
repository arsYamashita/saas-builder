/**
 * Provider Learning Loop v1 — Unit Tests
 *
 * 14 scenarios covering:
 * - Confidence computation
 * - Preference classification (preferred / neutral / avoided)
 * - Bounded adjustment application
 * - Integration with routing scores
 * - Edge cases (cold start, single provider, etc.)
 */

import { describe, it, expect } from "vitest";
import type { ProviderTaskMetric } from "../provider-scoreboard";
import type { ProviderId, TaskKind } from "../provider-interface";
import {
  computeLearningConfidence,
  deriveLearnedPreferences,
  getLearnedPreferences,
  getPreferencesByCategory,
  applyLearnedPreferenceAdjustment,
  buildProviderLearningLog,
  summarizeLearningReasons,
  MAX_ADJUSTMENT,
  MIN_STEPS_FOR_LEARNING,
  FULL_CONFIDENCE_STEPS,
  PREFERENCE_THRESHOLDS,
} from "../provider-learning";

// ── Test Helpers ──────────────────────────────────────────────

function makeMetric(overrides: Partial<ProviderTaskMetric> & { provider: string; taskKind: string }): ProviderTaskMetric {
  return {
    totalSteps: 20,
    completedSteps: 18,
    failedSteps: 2,
    successRate: 90,
    fallbackCount: 1,
    fallbackRate: 5,
    rerunCount: 1,
    rerunRate: 5,
    avgDurationMs: 3000,
    p50DurationMs: 2800,
    p95DurationMs: 5000,
    totalInputTokens: 40000,
    totalOutputTokens: 80000,
    totalTokens: 120000,
    totalCostUsd: 1.2,
    avgCostPerStep: 0.06,
    promotedSteps: 12,
    promotedStepRate: 60,
    fallbackReasons: [],
    ...overrides,
  };
}

// ── 1. Confidence Computation ────────────────────────────────

describe("computeLearningConfidence", () => {
  it("returns 0 when totalSteps < MIN_STEPS_FOR_LEARNING", () => {
    expect(computeLearningConfidence(0)).toBe(0);
    expect(computeLearningConfidence(4)).toBe(0);
  });

  it("returns 0 at exactly MIN_STEPS_FOR_LEARNING", () => {
    expect(computeLearningConfidence(MIN_STEPS_FOR_LEARNING)).toBe(0);
  });

  it("ramps linearly between MIN and FULL steps", () => {
    const mid = Math.round((MIN_STEPS_FOR_LEARNING + FULL_CONFIDENCE_STEPS) / 2);
    const confidence = computeLearningConfidence(mid);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThan(1);
  });

  it("returns 1.0 at FULL_CONFIDENCE_STEPS", () => {
    expect(computeLearningConfidence(FULL_CONFIDENCE_STEPS)).toBe(1);
  });

  it("caps at 1.0 for steps beyond FULL_CONFIDENCE_STEPS", () => {
    expect(computeLearningConfidence(100)).toBe(1);
    expect(computeLearningConfidence(1000)).toBe(1);
  });
});

// ── 2. Preference Classification via deriveLearnedPreferences ─

describe("deriveLearnedPreferences — classification", () => {
  it("classifies high-success + high-promotion as preferred", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "schema",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        rerunRate: 3,
        totalSteps: 25,
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences).toHaveLength(1);
    expect(result.preferences[0].preference).toBe("preferred");
    expect(result.preferences[0].adjustment).toBeGreaterThan(0);
    expect(result.preferences[0].adjustment).toBeLessThanOrEqual(MAX_ADJUSTMENT);
  });

  it("classifies high-success + low-fallback as preferred (even without high promotion)", () => {
    const metrics = [
      makeMetric({
        provider: "gemini",
        taskKind: "blueprint",
        successRate: 85,
        promotedStepRate: 30, // below preferred threshold
        fallbackRate: 5,      // below preferred maxFallback
        rerunRate: 3,
        totalSteps: 20,
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences[0].preference).toBe("preferred");
  });

  it("classifies low success rate as avoided", () => {
    const metrics = [
      makeMetric({
        provider: "openai",
        taskKind: "api_design",
        successRate: 50,
        totalSteps: 20,
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences[0].preference).toBe("avoided");
    expect(result.preferences[0].adjustment).toBeLessThan(0);
    expect(result.preferences[0].adjustment).toBeGreaterThanOrEqual(-MAX_ADJUSTMENT);
  });

  it("classifies high fallback rate as avoided", () => {
    const metrics = [
      makeMetric({
        provider: "gemini",
        taskKind: "implementation",
        successRate: 80,
        fallbackRate: 35,
        totalSteps: 20,
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences[0].preference).toBe("avoided");
  });

  it("classifies high rerun rate as avoided", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "schema",
        successRate: 85,
        fallbackRate: 5,
        rerunRate: 30,
        totalSteps: 20,
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences[0].preference).toBe("avoided");
  });

  it("classifies average metrics as neutral", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "implementation",
        successRate: 75, // above avoided threshold but below preferred
        promotedStepRate: 40,
        fallbackRate: 15,
        rerunRate: 10,
        totalSteps: 20,
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences[0].preference).toBe("neutral");
    expect(result.preferences[0].adjustment).toBe(0);
  });

  it("skips metrics with insufficient data", () => {
    const metrics = [
      makeMetric({
        provider: "openai",
        taskKind: "blueprint",
        totalSteps: 3, // below MIN_STEPS_FOR_LEARNING
      }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences).toHaveLength(0);
  });
});

// ── 3. Bounded Adjustment ────────────────────────────────────

describe("applyLearnedPreferenceAdjustment", () => {
  it("applies positive adjustment for preferred provider", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "schema",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: FULL_CONFIDENCE_STEPS,
      }),
    ];
    const prefs = deriveLearnedPreferences(metrics);
    const scores: Array<{ provider: ProviderId; score: number }> = [
      { provider: "claude", score: 30 },
      { provider: "gemini", score: 28 },
    ];

    const adjusted = applyLearnedPreferenceAdjustment(scores, "schema", prefs);
    const claudeAdj = adjusted.find((a) => a.provider === "claude")!;
    expect(claudeAdj.adjustment).toBe(MAX_ADJUSTMENT);
    expect(claudeAdj.score).toBeCloseTo(30 + MAX_ADJUSTMENT, 2);
  });

  it("applies negative adjustment for avoided provider", () => {
    const metrics = [
      makeMetric({
        provider: "openai",
        taskKind: "api_design",
        successRate: 50,
        totalSteps: FULL_CONFIDENCE_STEPS,
      }),
    ];
    const prefs = deriveLearnedPreferences(metrics);
    const scores: Array<{ provider: ProviderId; score: number }> = [
      { provider: "openai", score: 25 },
      { provider: "claude", score: 24 },
    ];

    const adjusted = applyLearnedPreferenceAdjustment(scores, "api_design", prefs);
    const openaiAdj = adjusted.find((a) => a.provider === "openai")!;
    expect(openaiAdj.adjustment).toBe(-MAX_ADJUSTMENT);
    expect(openaiAdj.score).toBeCloseTo(25 - MAX_ADJUSTMENT, 2);
  });

  it("scales adjustment by confidence (partial confidence)", () => {
    const partialSteps = Math.round(
      (MIN_STEPS_FOR_LEARNING + FULL_CONFIDENCE_STEPS) / 2
    );
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "blueprint",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: partialSteps,
      }),
    ];
    const prefs = deriveLearnedPreferences(metrics);
    const scores: Array<{ provider: ProviderId; score: number }> = [
      { provider: "claude", score: 30 },
    ];

    const adjusted = applyLearnedPreferenceAdjustment(scores, "blueprint", prefs);
    expect(adjusted[0].adjustment).toBeGreaterThan(0);
    expect(adjusted[0].adjustment).toBeLessThan(MAX_ADJUSTMENT);
  });

  it("does not adjust providers without learned preferences", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "schema",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: 20,
      }),
    ];
    const prefs = deriveLearnedPreferences(metrics);
    const scores: Array<{ provider: ProviderId; score: number }> = [
      { provider: "claude", score: 30 },
      { provider: "gemini", score: 28 },
    ];

    const adjusted = applyLearnedPreferenceAdjustment(scores, "schema", prefs);
    const geminiAdj = adjusted.find((a) => a.provider === "gemini")!;
    expect(geminiAdj.adjustment).toBe(0);
    expect(geminiAdj.score).toBe(28);
  });
});

// ── 4. Preference Filtering ─────────────────────────────────

describe("getPreferencesByCategory", () => {
  it("separates preferred and avoided providers", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "schema",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: 20,
      }),
      makeMetric({
        provider: "openai",
        taskKind: "schema",
        successRate: 50,
        totalSteps: 20,
      }),
      makeMetric({
        provider: "gemini",
        taskKind: "schema",
        successRate: 75,
        fallbackRate: 15,
        rerunRate: 10,
        totalSteps: 20,
      }),
    ];

    const prefs = deriveLearnedPreferences(metrics);
    const { preferredProviders, avoidedProviders } = getPreferencesByCategory(prefs, "schema");

    expect(preferredProviders).toContain("claude");
    expect(avoidedProviders).toContain("openai");
    expect(preferredProviders).not.toContain("gemini");
    expect(avoidedProviders).not.toContain("gemini");
  });
});

// ── 5. Logging ──────────────────────────────────────────────

describe("buildProviderLearningLog", () => {
  it("builds a structured log entry", () => {
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "schema",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: 20,
      }),
    ];
    const prefs = deriveLearnedPreferences(metrics);
    const taskPrefs = getLearnedPreferences(prefs, "schema");
    const origScores = [{ provider: "claude" as ProviderId, score: 30 }];
    const adjustedScores = [{ provider: "claude" as ProviderId, score: 30.08, adjustment: 0.08 }];

    const log = buildProviderLearningLog("schema", taskPrefs, adjustedScores, origScores);
    expect(log.taskKind).toBe("schema");
    expect(log.preferences).toHaveLength(1);
    expect(log.preferences[0].preference).toBe("preferred");
    expect(log.appliedAdjustments).toHaveLength(1);
    expect(log.appliedAdjustments[0].baseScore).toBe(30);
    expect(log.appliedAdjustments[0].adjustedScore).toBe(30.08);
    expect(log.timestamp).toBeDefined();
  });
});

// ── 6. Reason Summary ───────────────────────────────────────

describe("summarizeLearningReasons", () => {
  it("produces a human-readable reason string", () => {
    const summary = summarizeLearningReasons(
      "claude",
      "schema",
      "preferred",
      ["high success rate (95% >= 80%)", "low fallback rate (2% < 10%)"],
      1.0
    );
    expect(summary).toContain("[PREFER]");
    expect(summary).toContain("claude/schema");
    expect(summary).toContain("high success rate");
    expect(summary).toContain("confidence: 1");
  });

  it("uses AVOID tag for avoided providers", () => {
    const summary = summarizeLearningReasons(
      "openai",
      "api_design",
      "avoided",
      ["low success rate (50% < 60%)"],
      0.8
    );
    expect(summary).toContain("[AVOID]");
    expect(summary).toContain("openai/api_design");
  });
});

// ── 7. Edge Cases ───────────────────────────────────────────

describe("edge cases", () => {
  it("handles empty metrics array", () => {
    const result = deriveLearnedPreferences([]);
    expect(result.preferences).toHaveLength(0);
    expect(result.inputMetricCount).toBe(0);
  });

  it("handles all metrics below confidence threshold", () => {
    const metrics = [
      makeMetric({ provider: "claude", taskKind: "schema", totalSteps: 3 }),
      makeMetric({ provider: "gemini", taskKind: "blueprint", totalSteps: 2 }),
    ];
    const result = deriveLearnedPreferences(metrics);
    expect(result.preferences).toHaveLength(0);
    expect(result.inputMetricCount).toBe(2);
  });

  it("adjustment can reorder providers", () => {
    // claude slightly behind gemini, but preferred → adjustment pushes it ahead
    const metrics = [
      makeMetric({
        provider: "claude",
        taskKind: "blueprint",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: 20,
      }),
      makeMetric({
        provider: "gemini",
        taskKind: "blueprint",
        successRate: 50, // avoided
        totalSteps: 20,
      }),
    ];
    const prefs = deriveLearnedPreferences(metrics);

    // Gemini slightly ahead before adjustment
    const scores: Array<{ provider: ProviderId; score: number }> = [
      { provider: "gemini", score: 25.05 },
      { provider: "claude", score: 25.0 },
    ];

    const adjusted = applyLearnedPreferenceAdjustment(scores, "blueprint", prefs);
    // After adjustment: claude +0.08 = 25.08, gemini -0.08 = 24.97
    adjusted.sort((a, b) => b.score - a.score);
    expect(adjusted[0].provider).toBe("claude");
    expect(adjusted[1].provider).toBe("gemini");
  });

  it("getLearnedPreferences filters by taskKind correctly", () => {
    const metrics = [
      makeMetric({ provider: "claude", taskKind: "schema", successRate: 95, promotedStepRate: 70, fallbackRate: 2, totalSteps: 20 }),
      makeMetric({ provider: "claude", taskKind: "blueprint", successRate: 50, totalSteps: 20 }),
    ];
    const prefs = deriveLearnedPreferences(metrics);

    const schemaPrefs = getLearnedPreferences(prefs, "schema");
    const blueprintPrefs = getLearnedPreferences(prefs, "blueprint");

    expect(schemaPrefs).toHaveLength(1);
    expect(schemaPrefs[0].preference).toBe("preferred");
    expect(blueprintPrefs).toHaveLength(1);
    expect(blueprintPrefs[0].preference).toBe("avoided");
  });
});
