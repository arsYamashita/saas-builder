import { describe, it, expect } from "vitest";
import {
  computeBaseScore,
  computeAdaptiveScore,
  selectProvider,
  buildRoutingLog,
  ADAPTIVE_WEIGHTS,
} from "../provider-router";
import { getRecentProviderMetrics } from "../provider-scoreboard";
import type { ProviderTaskMetric, GenerationRunInput } from "../provider-scoreboard";
import type { RoutingContext } from "../provider-router";

// ── Helpers ─────────────────────────────────────────────────

function makeMetric(
  overrides: Partial<ProviderTaskMetric> & { provider: string; taskKind: string }
): ProviderTaskMetric {
  return {
    totalSteps: 10,
    completedSteps: 8,
    failedSteps: 2,
    successRate: 80,
    fallbackCount: 1,
    fallbackRate: 10,
    rerunCount: 1,
    rerunRate: 10,
    avgDurationMs: 5000,
    p50DurationMs: 4000,
    p95DurationMs: 8000,
    totalInputTokens: 10000,
    totalOutputTokens: 5000,
    totalTokens: 15000,
    totalCostUsd: 0.05,
    avgCostPerStep: 0.005,
    promotedSteps: 6,
    promotedStepRate: 60,
    fallbackReasons: [],
    ...overrides,
  };
}

function makeRun(overrides: Partial<GenerationRunInput> & { id: string }): GenerationRunInput {
  return {
    template_key: "simple_crm_saas",
    status: "completed",
    steps_json: [],
    promoted_at: null,
    review_status: "pending",
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── computeAdaptiveScore ────────────────────────────────────

describe("computeAdaptiveScore", () => {
  it("blends base and recent scores using 0.7 / 0.3 weights", () => {
    const base = 50;
    const recent = 80;
    const expected = base * 0.7 + recent * 0.3; // 35 + 24 = 59
    expect(computeAdaptiveScore(base, recent)).toBe(59);
  });

  it("falls back to base score when recent is null", () => {
    const base = 42.5;
    expect(computeAdaptiveScore(base, null)).toBe(42.5);
  });

  it("rounds to 2 decimal places", () => {
    const score = computeAdaptiveScore(33.333, 66.666);
    // 33.333 * 0.7 + 66.666 * 0.3 = 23.3331 + 19.9998 = 43.3329
    expect(score).toBe(43.33);
  });

  it("ADAPTIVE_WEIGHTS sum to 1.0", () => {
    expect(ADAPTIVE_WEIGHTS.base + ADAPTIVE_WEIGHTS.recent).toBeCloseTo(1.0);
  });
});

// ── Recent score weighting works ────────────────────────────

describe("recent score weighting", () => {
  it("recent performance boost raises final score", () => {
    const globalClaude = makeMetric({
      provider: "claude",
      taskKind: "schema",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
    });

    // Recently Claude has been performing much better
    const recentClaude = makeMetric({
      provider: "claude",
      taskKind: "schema",
      successRate: 98,
      promotedStepRate: 95,
      fallbackRate: 0,
      rerunRate: 0,
    });

    const baseScore = computeBaseScore(globalClaude, [globalClaude]);
    const recentScore = computeBaseScore(recentClaude, [recentClaude]);
    const adaptiveScore = computeAdaptiveScore(baseScore, recentScore);

    // Recent is better → adaptive should be higher than base
    expect(adaptiveScore).toBeGreaterThan(baseScore);
    // But not as high as recent alone (damped by 0.7/0.3 blend)
    expect(adaptiveScore).toBeLessThan(recentScore);
  });

  it("recent performance drop lowers final score", () => {
    const globalClaude = makeMetric({
      provider: "claude",
      taskKind: "implementation",
      successRate: 90,
      promotedStepRate: 80,
      fallbackRate: 5,
      rerunRate: 5,
    });

    // Recently Claude has been degraded
    const recentClaude = makeMetric({
      provider: "claude",
      taskKind: "implementation",
      successRate: 50,
      promotedStepRate: 20,
      fallbackRate: 30,
      rerunRate: 25,
    });

    const baseScore = computeBaseScore(globalClaude, [globalClaude]);
    const recentScore = computeBaseScore(recentClaude, [recentClaude]);
    const adaptiveScore = computeAdaptiveScore(baseScore, recentScore);

    // Adaptive should be lower than base due to poor recent performance
    expect(adaptiveScore).toBeLessThan(baseScore);
  });
});

// ── Fallback to base metrics ────────────────────────────────

describe("fallback to base metrics when no recent data", () => {
  it("selectProvider uses global-only when no recentMetrics provided", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "claude",
          taskKind: "schema",
          successRate: 90,
          promotedStepRate: 80,
        }),
      ],
      // No recentMetrics
    };

    const decision = selectProvider("schema", context);
    expect(decision.metricsWindow).toBe("global");
    expect(decision.recentScore).toBeUndefined();
    expect(decision.baseScore).toBeDefined();
  });

  it("selectProvider uses global-only when recentMetrics is empty", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "claude",
          taskKind: "schema",
          successRate: 90,
        }),
      ],
      recentMetrics: [],
    };

    const decision = selectProvider("schema", context);
    expect(decision.metricsWindow).toBe("global");
    expect(decision.recentScore).toBeUndefined();
  });

  it("selectProvider uses adaptive when recentMetrics has data for candidate", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 80 }),
      ],
      recentMetrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 95 }),
      ],
    };

    const decision = selectProvider("schema", context);
    expect(decision.metricsWindow).toBe("adaptive");
    expect(decision.recentScore).toBeDefined();
    expect(decision.baseScore).toBeDefined();
  });
});

// ── Recent score affects provider ordering ──────────────────

describe("recent score affects provider ordering", () => {
  it("recent boost can flip provider preference", () => {
    // Global: gemini is slightly better
    const globalGemini = makeMetric({
      provider: "gemini",
      taskKind: "blueprint",
      successRate: 85,
      promotedStepRate: 70,
      fallbackRate: 5,
      rerunRate: 5,
      avgCostPerStep: 0.002,
      p95DurationMs: 3000,
    });
    const globalClaude = makeMetric({
      provider: "claude",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 65,
      fallbackRate: 8,
      rerunRate: 8,
      avgCostPerStep: 0.02,
      p95DurationMs: 5000,
    });

    // Recent: claude is dramatically better
    const recentGemini = makeMetric({
      provider: "gemini",
      taskKind: "blueprint",
      successRate: 40,
      promotedStepRate: 20,
      fallbackRate: 30,
      rerunRate: 25,
      avgCostPerStep: 0.002,
      p95DurationMs: 3000,
    });
    const recentClaude = makeMetric({
      provider: "claude",
      taskKind: "blueprint",
      successRate: 98,
      promotedStepRate: 95,
      fallbackRate: 0,
      rerunRate: 0,
      avgCostPerStep: 0.02,
      p95DurationMs: 5000,
    });

    // Without recent data: gemini wins
    const globalOnly: RoutingContext = {
      metrics: [globalGemini, globalClaude],
    };
    const globalDecision = selectProvider("blueprint", globalOnly);
    expect(globalDecision.provider).toBe("gemini");

    // With recent data: claude should win due to recent boost
    const adaptive: RoutingContext = {
      metrics: [globalGemini, globalClaude],
      recentMetrics: [recentGemini, recentClaude],
    };
    const adaptiveDecision = selectProvider("blueprint", adaptive);
    expect(adaptiveDecision.provider).toBe("claude");
    expect(adaptiveDecision.metricsWindow).toBe("adaptive");
  });

  it("provider with only global data gets no recent bonus", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "claude",
          taskKind: "api_design",
          successRate: 85,
          promotedStepRate: 70,
        }),
        makeMetric({
          provider: "gemini",
          taskKind: "api_design",
          successRate: 80,
          promotedStepRate: 65,
        }),
      ],
      // Only claude has recent metrics
      recentMetrics: [
        makeMetric({
          provider: "claude",
          taskKind: "api_design",
          successRate: 95,
          promotedStepRate: 90,
        }),
      ],
    };

    const decision = selectProvider("api_design", context);
    // Claude should still win (higher base + recent boost)
    expect(decision.provider).toBe("claude");
    expect(decision.metricsWindow).toBe("adaptive");
  });
});

// ── Router logs recent score ────────────────────────────────

describe("router logs recent score", () => {
  it("buildRoutingLog includes baseScore, recentScore, metricsWindow", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 85 }),
      ],
      recentMetrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 95 }),
      ],
    };

    const decision = selectProvider("schema", context);
    const log = buildRoutingLog("schema", decision);

    expect(log.baseScore).toBeDefined();
    expect(log.recentScore).toBeDefined();
    expect(log.metricsWindow).toBe("adaptive");
    expect(log.routingScore).toBe(decision.score);
  });

  it("buildRoutingLog shows global metricsWindow when no recent data", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 85 }),
      ],
    };

    const decision = selectProvider("schema", context);
    const log = buildRoutingLog("schema", decision);

    expect(log.metricsWindow).toBe("global");
    expect(log.recentScore).toBeUndefined();
  });
});

// ── getRecentProviderMetrics ────────────────────────────────

describe("getRecentProviderMetrics", () => {
  it("returns metrics from recent runs only", () => {
    const now = new Date();
    const recentRun = makeRun({
      id: "recent-1",
      started_at: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
      steps_json: [
        {
          key: "schema",
          label: "Schema",
          status: "completed",
          meta: { provider: "claude", taskKind: "schema", durationMs: 3000 },
        },
      ],
    });

    const oldRun = makeRun({
      id: "old-1",
      started_at: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(), // 48h ago
      steps_json: [
        {
          key: "schema",
          label: "Schema",
          status: "failed",
          meta: { provider: "claude", taskKind: "schema", durationMs: 10000 },
        },
      ],
    });

    const metrics = getRecentProviderMetrics(
      [recentRun, oldRun],
      { since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() }
    );

    // Only the recent run should be included
    expect(metrics.length).toBe(1);
    expect(metrics[0].provider).toBe("claude");
    expect(metrics[0].totalSteps).toBe(1);
    expect(metrics[0].successRate).toBe(100); // 1 completed out of 1
  });

  it("returns empty array when no recent runs exist", () => {
    const now = new Date();
    const oldRun = makeRun({
      id: "old-1",
      started_at: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(),
      steps_json: [
        {
          key: "schema",
          label: "Schema",
          status: "completed",
          meta: { provider: "claude", taskKind: "schema" },
        },
      ],
    });

    const metrics = getRecentProviderMetrics(
      [oldRun],
      { since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString() }
    );

    expect(metrics).toEqual([]);
  });

  it("respects maxRuns limit", () => {
    const now = new Date();
    const runs = Array.from({ length: 100 }, (_, i) =>
      makeRun({
        id: `run-${i}`,
        started_at: new Date(now.getTime() - i * 1000).toISOString(), // staggered
        steps_json: [
          {
            key: "schema",
            label: "Schema",
            status: "completed",
            meta: { provider: "claude", taskKind: "schema", durationMs: 1000 },
          },
        ],
      })
    );

    const metrics = getRecentProviderMetrics(
      runs,
      { maxRuns: 10 }
    );

    // Should only have processed 10 runs
    expect(metrics[0].totalSteps).toBe(10);
  });
});
