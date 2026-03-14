import { describe, it, expect } from "vitest";
import {
  computeRoutingScore,
  selectProvider,
  getFallbackProviders,
  buildRoutingLog,
  STEP_CANDIDATE_PROVIDERS,
  ROUTING_WEIGHTS,
} from "../provider-router";
import type { ProviderTaskMetric } from "../provider-scoreboard";
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

// ── computeRoutingScore ─────────────────────────────────────

describe("computeRoutingScore", () => {
  it("computes score using weighted formula", () => {
    const metric = makeMetric({
      provider: "claude",
      taskKind: "schema",
      successRate: 90,
      promotedStepRate: 80,
      fallbackRate: 5,
      rerunRate: 5,
      avgCostPerStep: 0.01,
      p95DurationMs: 5000,
    });

    const score = computeRoutingScore(metric, [metric]);
    // With single metric: cost_penalty=0, duration_penalty=0
    // score = 90*0.4 + 80*0.25 - 5*0.15 - 5*0.10 - 0*0.05 - 0*0.05
    //       = 36 + 20 - 0.75 - 0.5 = 54.75
    expect(score).toBe(54.75);
  });

  it("penalizes higher cost relative to other candidates", () => {
    const cheap = makeMetric({
      provider: "gemini",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
      avgCostPerStep: 0.001,
      p95DurationMs: 3000,
    });

    const expensive = makeMetric({
      provider: "claude",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
      avgCostPerStep: 0.05,
      p95DurationMs: 3000,
    });

    const all = [cheap, expensive];
    const cheapScore = computeRoutingScore(cheap, all);
    const expensiveScore = computeRoutingScore(expensive, all);

    // Same stats but expensive has higher cost_penalty
    expect(cheapScore).toBeGreaterThan(expensiveScore);
  });

  it("penalizes slower p95 duration relative to other candidates", () => {
    const fast = makeMetric({
      provider: "gemini",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
      avgCostPerStep: 0.01,
      p95DurationMs: 2000,
    });

    const slow = makeMetric({
      provider: "claude",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
      avgCostPerStep: 0.01,
      p95DurationMs: 15000,
    });

    const all = [fast, slow];
    expect(computeRoutingScore(fast, all)).toBeGreaterThan(
      computeRoutingScore(slow, all)
    );
  });

  it("returns 0 penalties when all candidates have equal cost and duration", () => {
    const a = makeMetric({
      provider: "gemini",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
      avgCostPerStep: 0.01,
      p95DurationMs: 5000,
    });

    const b = makeMetric({
      provider: "claude",
      taskKind: "blueprint",
      successRate: 80,
      promotedStepRate: 60,
      fallbackRate: 10,
      rerunRate: 10,
      avgCostPerStep: 0.01,
      p95DurationMs: 5000,
    });

    const all = [a, b];
    expect(computeRoutingScore(a, all)).toBe(computeRoutingScore(b, all));
  });

  it("higher success rate yields higher score", () => {
    const high = makeMetric({
      provider: "claude",
      taskKind: "schema",
      successRate: 95,
      promotedStepRate: 70,
      fallbackRate: 5,
      rerunRate: 5,
    });

    const low = makeMetric({
      provider: "gemini",
      taskKind: "schema",
      successRate: 60,
      promotedStepRate: 70,
      fallbackRate: 5,
      rerunRate: 5,
    });

    const all = [high, low];
    expect(computeRoutingScore(high, all)).toBeGreaterThan(
      computeRoutingScore(low, all)
    );
  });
});

// ── selectProvider ──────────────────────────────────────────

describe("selectProvider", () => {
  it("selects highest-scoring provider", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "claude",
          taskKind: "implementation",
          successRate: 95,
          promotedStepRate: 80,
          fallbackRate: 2,
          rerunRate: 3,
          avgCostPerStep: 0.02,
          p95DurationMs: 6000,
        }),
        makeMetric({
          provider: "gemini",
          taskKind: "implementation",
          successRate: 70,
          promotedStepRate: 40,
          fallbackRate: 20,
          rerunRate: 15,
          avgCostPerStep: 0.005,
          p95DurationMs: 4000,
        }),
      ],
    };

    const decision = selectProvider("implementation", context);
    expect(decision.provider).toBe("claude");
    expect(decision.score).toBeGreaterThan(0);
    expect(decision.fallbacks).toContain("gemini");
  });

  it("returns static ordering on cold start (no metrics)", () => {
    const context: RoutingContext = { metrics: [] };
    const decision = selectProvider("blueprint", context);

    // First candidate from STEP_CANDIDATE_PROVIDERS
    expect(decision.provider).toBe(STEP_CANDIDATE_PROVIDERS.blueprint[0]);
    expect(decision.score).toBe(0);
    expect(decision.metricsWindow).toBe("global");
    expect(decision.fallbacks.length).toBe(
      STEP_CANDIDATE_PROVIDERS.blueprint.length - 1
    );
  });

  it("ignores metrics from non-candidate providers", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "openai",
          taskKind: "schema",
          successRate: 99,
          promotedStepRate: 99,
        }),
        makeMetric({
          provider: "claude",
          taskKind: "schema",
          successRate: 85,
          promotedStepRate: 70,
        }),
      ],
    };

    // schema candidates: ["claude"] only
    const decision = selectProvider("schema", context);
    expect(decision.provider).toBe("claude");
    // openai should not appear
    expect(decision.fallbacks).not.toContain("openai");
  });

  it("includes unscored candidates at end of fallback list", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "gemini",
          taskKind: "blueprint",
          successRate: 90,
          promotedStepRate: 80,
        }),
        // claude has no metrics for blueprint
      ],
    };

    const decision = selectProvider("blueprint", context);
    expect(decision.provider).toBe("gemini");
    expect(decision.fallbacks).toContain("claude");
  });
});

// ── getFallbackProviders ────────────────────────────────────

describe("getFallbackProviders", () => {
  it("returns fallback providers ordered by score", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "claude",
          taskKind: "api_design",
          successRate: 90,
          promotedStepRate: 75,
        }),
        makeMetric({
          provider: "gemini",
          taskKind: "api_design",
          successRate: 70,
          promotedStepRate: 50,
        }),
      ],
    };

    const fallbacks = getFallbackProviders("api_design", context);
    expect(fallbacks).toEqual(["gemini"]);
  });

  it("returns empty array when single candidate", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "claude",
          taskKind: "file_split",
          successRate: 90,
        }),
      ],
    };

    const fallbacks = getFallbackProviders("file_split", context);
    expect(fallbacks).toEqual([]);
  });
});

// ── Provider sorting ────────────────────────────────────────

describe("provider sorting", () => {
  it("sorts providers by descending score", () => {
    const context: RoutingContext = {
      metrics: [
        makeMetric({
          provider: "gemini",
          taskKind: "blueprint",
          successRate: 60,
          promotedStepRate: 30,
          fallbackRate: 20,
          rerunRate: 15,
        }),
        makeMetric({
          provider: "claude",
          taskKind: "blueprint",
          successRate: 95,
          promotedStepRate: 85,
          fallbackRate: 2,
          rerunRate: 3,
        }),
      ],
    };

    const decision = selectProvider("blueprint", context);
    expect(decision.providerScores[0].provider).toBe("claude");
    expect(decision.providerScores[0].score).toBeGreaterThan(
      decision.providerScores[1].score
    );
  });
});

// ── Respects step provider list ─────────────────────────────

describe("router respects step provider list", () => {
  it("only considers configured candidates for schema (claude only)", () => {
    expect(STEP_CANDIDATE_PROVIDERS.schema).toEqual(["claude"]);

    const context: RoutingContext = {
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 85 }),
      ],
    };

    const decision = selectProvider("schema", context);
    expect(decision.provider).toBe("claude");
    expect(decision.fallbacks).toEqual([]);
  });

  it("considers both candidates for blueprint (gemini + claude)", () => {
    expect(STEP_CANDIDATE_PROVIDERS.blueprint).toContain("gemini");
    expect(STEP_CANDIDATE_PROVIDERS.blueprint).toContain("claude");
  });

  it("considers both candidates for implementation (claude + gemini)", () => {
    expect(STEP_CANDIDATE_PROVIDERS.implementation).toContain("claude");
    expect(STEP_CANDIDATE_PROVIDERS.implementation).toContain("gemini");
  });
});

// ── buildRoutingLog ─────────────────────────────────────────

describe("buildRoutingLog", () => {
  it("builds a structured log entry", () => {
    const decision = {
      provider: "claude" as const,
      score: 42.5,
      fallbacks: ["gemini" as const],
      providerScores: [
        { provider: "claude" as const, score: 42.5 },
        { provider: "gemini" as const, score: 25.0 },
      ],
      metricsWindow: "adaptive" as const,
      baseScore: 45.0,
      recentScore: 36.7,
    };

    const log = buildRoutingLog("schema", decision);
    expect(log.taskKind).toBe("schema");
    expect(log.selectedProvider).toBe("claude");
    expect(log.routingScore).toBe(42.5);
    expect(log.baseScore).toBe(45.0);
    expect(log.recentScore).toBe(36.7);
    expect(log.metricsWindow).toBe("adaptive");
    expect(log.fallbackProviders).toEqual(["gemini"]);
    expect(log.timestamp).toBeDefined();
  });
});

// ── ROUTING_WEIGHTS ─────────────────────────────────────────

describe("ROUTING_WEIGHTS", () => {
  it("sums positive and negative weights correctly", () => {
    const w = ROUTING_WEIGHTS;
    const positiveSum = w.successRate + w.promotionRate;
    const negativeSum = w.fallbackRate + w.rerunRate + w.costPenalty + w.durationPenalty;
    // Total weight allocation = 0.65 positive + 0.35 negative = 1.0
    expect(positiveSum + negativeSum).toBeCloseTo(1.0);
  });
});
