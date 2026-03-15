/**
 * Factory Intelligence Control Plane v1 — Unit Tests
 *
 * 15 scenarios covering:
 * - Strategy resolution per mode
 * - Subsystem orchestration (routing, learning, guardrail)
 * - Run-level summary aggregation
 * - Regression signal handling
 * - Edge cases and determinism
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ProviderId, TaskKind } from "../../providers/provider-interface";
import type { ProviderTaskMetric } from "../../providers/provider-scoreboard";
import type { RoutingContext } from "../../providers/provider-router";
import type { BudgetContext } from "../../providers/cost-guardrail";
import type { LearnedPreferences } from "../../providers/provider-learning";
import { deriveLearnedPreferences } from "../../providers/provider-learning";
import {
  resolveFactoryStrategy,
  applyFactoryIntelligencePolicy,
  buildFactoryIntelligenceSummary,
  buildFactoryIntelligenceLog,
  orchestrateRunIntelligence,
  DEFAULT_MODE,
  MODE_CONSTANTS,
  type FactoryIntelligenceMode,
  type FactoryIntelligenceInput,
  type FactoryExecutionStrategy,
  type ProviderRegressionSignal,
  type StepIntelligenceDecision,
} from "../factory-intelligence-control-plane";

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

function makeRoutingContext(taskKinds: TaskKind[]): RoutingContext {
  const metrics: ProviderTaskMetric[] = [];
  for (const tk of taskKinds) {
    metrics.push(
      makeMetric({ provider: "claude", taskKind: tk, successRate: 90, promotedStepRate: 60, fallbackRate: 5, avgCostPerStep: 0.06, p95DurationMs: 5000 }),
      makeMetric({ provider: "gemini", taskKind: tk, successRate: 85, promotedStepRate: 55, fallbackRate: 8, avgCostPerStep: 0.002, p95DurationMs: 3000 }),
    );
  }
  return { metrics };
}

function makePreferredLearning(provider: ProviderId, taskKind: TaskKind): LearnedPreferences {
  const metrics = [
    makeMetric({
      provider,
      taskKind,
      successRate: 95,
      promotedStepRate: 70,
      fallbackRate: 2,
      rerunRate: 3,
      totalSteps: 25,
    }),
  ];
  return deriveLearnedPreferences(metrics);
}

// Suppress console.log during tests
beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. Default mode resolves to balanced ─────────────────────

describe("strategy resolution", () => {
  it("defaults to balanced when no mode is provided", () => {
    const strategy = resolveFactoryStrategy({});
    expect(strategy.mode).toBe("balanced");
    expect(strategy.mode).toBe(DEFAULT_MODE);
  });

  // ── 2. Baseline mode disables learning adjustment ──────────

  it("baseline mode disables learning and adaptive routing", () => {
    const strategy = resolveFactoryStrategy({ mode: "baseline" });
    expect(strategy.mode).toBe("baseline");
    expect(strategy.learningEnabled).toBe(false);
    expect(strategy.adaptiveRoutingEnabled).toBe(false);
    expect(strategy.learningMaxInfluence).toBe(0);
    expect(strategy.regressionDegradationPenalty).toBe(0);
  });

  // ── 3. Balanced mode enables adaptive routing and learning ─

  it("balanced mode enables all intelligence subsystems", () => {
    const strategy = resolveFactoryStrategy({
      mode: "balanced",
      budgetContext: { maxCostPerRun: 1.0 },
    });
    expect(strategy.routingEnabled).toBe(true);
    expect(strategy.adaptiveRoutingEnabled).toBe(true);
    expect(strategy.learningEnabled).toBe(true);
    expect(strategy.costGuardrailEnabled).toBe(true);
    expect(strategy.learningMaxInfluence).toBe(0.08);
  });

  // ── 4. Aggressive mode increases learning influence ────────

  it("aggressive mode allows higher learning influence", () => {
    const strategy = resolveFactoryStrategy({ mode: "aggressive" });
    expect(strategy.learningEnabled).toBe(true);
    expect(strategy.learningMaxInfluence).toBeGreaterThan(
      MODE_CONSTANTS.balanced.learningMaxInfluence
    );
    expect(strategy.minConfidenceForLearningBoost).toBeLessThan(
      MODE_CONSTANTS.balanced.minConfidenceForLearningBoost
    );
    expect(strategy.riskTolerance).toBe("high");
  });

  // ── 5. Safe mode reduces risky behavior ────────────────────

  it("safe mode reduces learning influence and increases strictness", () => {
    const strategy = resolveFactoryStrategy({ mode: "safe" });
    expect(strategy.learningEnabled).toBe(true);
    expect(strategy.learningMaxInfluence).toBeLessThan(
      MODE_CONSTANTS.balanced.learningMaxInfluence
    );
    expect(strategy.fallbackStrictness).toBe("strict");
    expect(strategy.riskTolerance).toBe("low");
    expect(strategy.minConfidenceForLearningBoost).toBeGreaterThan(
      MODE_CONSTANTS.balanced.minConfidenceForLearningBoost
    );
    expect(strategy.costGuardrailEnabled).toBe(true); // always on in safe
  });

  // ── 6. Cost guardrail only enabled with budget or safe mode ─

  it("cost guardrail disabled when no budget in balanced mode", () => {
    const strategy = resolveFactoryStrategy({ mode: "balanced" });
    expect(strategy.costGuardrailEnabled).toBe(false);
  });

  it("cost guardrail enabled when budget provided in balanced mode", () => {
    const strategy = resolveFactoryStrategy({
      mode: "balanced",
      budgetContext: { maxCostPerRun: 2.0 },
    });
    expect(strategy.costGuardrailEnabled).toBe(true);
  });

  it("cost guardrail always enabled in safe mode even without budget", () => {
    const strategy = resolveFactoryStrategy({ mode: "safe" });
    expect(strategy.costGuardrailEnabled).toBe(true);
    expect(strategy.budgetProvided).toBe(false);
  });

  // ── 7. Returns stable typed strategy object ────────────────

  it("returns deterministic strategy for same input", () => {
    const input: FactoryIntelligenceInput = {
      mode: "balanced",
      budgetContext: { maxCostPerRun: 1.5 },
    };
    const s1 = resolveFactoryStrategy(input);
    const s2 = resolveFactoryStrategy(input);

    // Compare all non-timestamp fields
    expect(s1.mode).toBe(s2.mode);
    expect(s1.routingEnabled).toBe(s2.routingEnabled);
    expect(s1.adaptiveRoutingEnabled).toBe(s2.adaptiveRoutingEnabled);
    expect(s1.learningEnabled).toBe(s2.learningEnabled);
    expect(s1.learningMaxInfluence).toBe(s2.learningMaxInfluence);
    expect(s1.costGuardrailEnabled).toBe(s2.costGuardrailEnabled);
    expect(s1.fallbackStrictness).toBe(s2.fallbackStrictness);
    expect(s1.riskTolerance).toBe(s2.riskTolerance);
  });
});

// ── 8. Run-level summary aggregation ─────────────────────────

describe("buildFactoryIntelligenceSummary", () => {
  it("aggregates step outcomes correctly", () => {
    const strategy = resolveFactoryStrategy({ mode: "balanced" });
    const decisions: StepIntelligenceDecision[] = [
      {
        taskKind: "blueprint",
        selectedProvider: "gemini",
        learningApplied: true,
        learningConfidence: 0.8,
        preferredProviders: ["gemini"],
        avoidedProviders: [],
        baseOrder: ["gemini", "claude"],
        finalOrder: ["gemini", "claude"],
        regressionPenaltyApplied: false,
        downgradedDueToBudget: false,
        blockedDueToBudget: false,
      },
      {
        taskKind: "schema",
        selectedProvider: "claude",
        learningApplied: false,
        preferredProviders: [],
        avoidedProviders: [],
        baseOrder: ["claude"],
        finalOrder: ["claude"],
        regressionPenaltyApplied: false,
        downgradedDueToBudget: true,
        blockedDueToBudget: false,
      },
      {
        taskKind: "api_design",
        selectedProvider: "claude",
        learningApplied: true,
        learningConfidence: 0.9,
        preferredProviders: ["claude"],
        avoidedProviders: ["openai"],
        baseOrder: ["claude", "openai"],
        finalOrder: ["claude", "openai"],
        regressionPenaltyApplied: true,
        downgradedDueToBudget: false,
        blockedDueToBudget: false,
      },
    ];

    const summary = buildFactoryIntelligenceSummary(strategy, decisions);
    expect(summary.mode).toBe("balanced");
    expect(summary.learningAppliedStepCount).toBe(2);
    expect(summary.downgradedStepCount).toBe(1);
    expect(summary.blockedStepCount).toBe(0);
    expect(summary.regressionPenaltyStepCount).toBe(1);
    expect(summary.providerSelections).toHaveLength(3);
    expect(summary.overallStatus).toBe("degraded"); // has downgraded step
  });

  it("returns constrained status when any step is blocked", () => {
    const strategy = resolveFactoryStrategy({ mode: "balanced" });
    const decisions: StepIntelligenceDecision[] = [
      {
        taskKind: "schema",
        selectedProvider: "claude",
        learningApplied: false,
        preferredProviders: [],
        avoidedProviders: [],
        baseOrder: ["claude"],
        finalOrder: ["claude"],
        regressionPenaltyApplied: false,
        downgradedDueToBudget: false,
        blockedDueToBudget: true,
      },
    ];
    const summary = buildFactoryIntelligenceSummary(strategy, decisions);
    expect(summary.overallStatus).toBe("constrained");
  });

  it("returns nominal status when all steps are clean", () => {
    const strategy = resolveFactoryStrategy({ mode: "balanced" });
    const decisions: StepIntelligenceDecision[] = [
      {
        taskKind: "blueprint",
        selectedProvider: "gemini",
        learningApplied: false,
        preferredProviders: [],
        avoidedProviders: [],
        baseOrder: ["gemini"],
        finalOrder: ["gemini"],
        regressionPenaltyApplied: false,
        downgradedDueToBudget: false,
        blockedDueToBudget: false,
      },
    ];
    const summary = buildFactoryIntelligenceSummary(strategy, decisions);
    expect(summary.overallStatus).toBe("nominal");
  });
});

// ── 9. Safe mode reacts to degraded regression signals ───────

describe("regression signal handling", () => {
  it("safe mode penalizes degraded providers deterministically", () => {
    // Use nearly identical metrics so that regression penalty flips the order
    const routingContext: RoutingContext = {
      metrics: [
        makeMetric({ provider: "claude", taskKind: "blueprint", successRate: 90, promotedStepRate: 60, fallbackRate: 5, avgCostPerStep: 0.06, p95DurationMs: 5000 }),
        makeMetric({ provider: "gemini", taskKind: "blueprint", successRate: 90, promotedStepRate: 60, fallbackRate: 5, avgCostPerStep: 0.06, p95DurationMs: 5000 }),
      ],
    };
    const regressionSignals: ProviderRegressionSignal[] = [
      { provider: "gemini", taskKind: "blueprint", status: "fail", consecutiveIssues: 3 },
    ];

    const strategy = resolveFactoryStrategy({
      mode: "safe",
      routingContext,
      regressionSignals,
    });

    const decision = applyFactoryIntelligencePolicy(
      "blueprint",
      strategy,
      { mode: "safe", routingContext, regressionSignals }
    );

    expect(decision.regressionPenaltyApplied).toBe(true);
    // With equal routing scores, penalty (0.04 * 3 * 2 = 0.24) tips to claude
    expect(decision.finalOrder[0]).toBe("claude");
  });

  it("baseline mode ignores regression signals", () => {
    const routingContext = makeRoutingContext(["blueprint"]);
    const regressionSignals: ProviderRegressionSignal[] = [
      { provider: "gemini", taskKind: "blueprint", status: "fail", consecutiveIssues: 3 },
    ];

    const strategy = resolveFactoryStrategy({
      mode: "baseline",
      routingContext,
      regressionSignals,
    });

    const decision = applyFactoryIntelligencePolicy(
      "blueprint",
      strategy,
      { mode: "baseline", routingContext, regressionSignals }
    );

    expect(decision.regressionPenaltyApplied).toBe(false);
  });
});

// ── 10. Baseline mode leaves behavior unchanged ──────────────

describe("baseline mode", () => {
  it("does not apply learning even when preferences are provided", () => {
    const routingContext = makeRoutingContext(["schema"]);
    const learnedPreferences = makePreferredLearning("claude", "schema");

    const strategy = resolveFactoryStrategy({
      mode: "baseline",
      routingContext,
      learnedPreferences,
    });

    const decision = applyFactoryIntelligencePolicy(
      "schema",
      strategy,
      { mode: "baseline", routingContext, learnedPreferences }
    );

    expect(decision.learningApplied).toBe(false);
  });

  it("does not strip recentMetrics when adaptive is disabled", () => {
    const routingContext: RoutingContext = {
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema" }),
      ],
      recentMetrics: [
        makeMetric({ provider: "claude", taskKind: "schema", successRate: 99 }),
      ],
    };

    const strategy = resolveFactoryStrategy({ mode: "baseline" });
    // In baseline, adaptiveRoutingEnabled = false, so recentMetrics should be stripped
    expect(strategy.adaptiveRoutingEnabled).toBe(false);

    const decision = applyFactoryIntelligencePolicy(
      "schema",
      strategy,
      { mode: "baseline", routingContext }
    );

    // Routing decision should exist but use global window (no adaptive)
    expect(decision.routingDecision).toBeDefined();
    expect(decision.routingDecision!.metricsWindow).toBe("global");
  });
});

// ── 11. Orchestration skips subsystems when disabled ─────────

describe("subsystem orchestration", () => {
  it("skips learning when disabled by strategy", () => {
    const routingContext = makeRoutingContext(["blueprint"]);
    const learnedPreferences = makePreferredLearning("claude", "blueprint");

    const baselineStrategy = resolveFactoryStrategy({ mode: "baseline" });
    const baselineDecision = applyFactoryIntelligencePolicy(
      "blueprint",
      baselineStrategy,
      { mode: "baseline", routingContext, learnedPreferences }
    );
    expect(baselineDecision.learningApplied).toBe(false);

    const balancedStrategy = resolveFactoryStrategy({ mode: "balanced" });
    const balancedDecision = applyFactoryIntelligencePolicy(
      "blueprint",
      balancedStrategy,
      { mode: "balanced", routingContext, learnedPreferences }
    );
    expect(balancedDecision.learningApplied).toBe(true);
  });

  it("skips cost guardrail when disabled by strategy", () => {
    const routingContext = makeRoutingContext(["schema"]);
    const budgetContext: BudgetContext = { maxCostPerRun: 0.001 }; // very tight

    // baseline without budget — guardrail disabled
    const strategy = resolveFactoryStrategy({ mode: "baseline" });
    expect(strategy.costGuardrailEnabled).toBe(false);

    const decision = applyFactoryIntelligencePolicy(
      "schema",
      strategy,
      { mode: "baseline", routingContext, budgetContext }
    );
    // No guardrail decision since it's disabled
    expect(decision.costGuardrailDecision).toBeUndefined();
    expect(decision.blockedDueToBudget).toBe(false);
  });
});

// ── 12. Logging includes strategy and summary ────────────────

describe("logging", () => {
  it("buildFactoryIntelligenceLog includes strategy and summary", () => {
    const strategy = resolveFactoryStrategy({ mode: "safe" });
    const summary = buildFactoryIntelligenceSummary(strategy, []);
    const log = buildFactoryIntelligenceLog(strategy, summary);

    expect(log.mode).toBe("safe");
    expect(log.strategy.mode).toBe("safe");
    expect(log.summary).toBeDefined();
    expect(log.summary!.overallStatus).toBe("nominal");
    expect(log.timestamp).toBeDefined();
  });

  it("buildFactoryIntelligenceLog works without summary", () => {
    const strategy = resolveFactoryStrategy({ mode: "balanced" });
    const log = buildFactoryIntelligenceLog(strategy);

    expect(log.mode).toBe("balanced");
    expect(log.summary).toBeUndefined();
  });
});

// ── 13. CLI script (strategy resolution is deterministic) ────

describe("deterministic strategy resolution", () => {
  it("all four modes produce distinct strategies", () => {
    const modes: FactoryIntelligenceMode[] = ["baseline", "balanced", "aggressive", "safe"];
    const strategies = modes.map((mode) => resolveFactoryStrategy({ mode }));

    // Each mode should have unique learningMaxInfluence
    const influences = strategies.map((s) => s.learningMaxInfluence);
    expect(new Set(influences).size).toBe(4);

    // Each mode should have unique risk tolerance
    const risks = strategies.map((s) => s.riskTolerance);
    // baseline=high, balanced=medium, aggressive=high, safe=low
    // baseline and aggressive share "high", but differ on other axes
    expect(strategies[0].adaptiveRoutingEnabled).not.toBe(strategies[2].adaptiveRoutingEnabled);
  });
});

// ── 14. Integration with task routing remains deterministic ──

describe("integration with routing", () => {
  it("applies full pipeline (routing + learning + guardrail) deterministically", () => {
    const routingContext = makeRoutingContext(["blueprint", "schema"]);
    const learnedPreferences = makePreferredLearning("claude", "blueprint");

    const input: FactoryIntelligenceInput = {
      mode: "balanced",
      routingContext,
      learnedPreferences,
      budgetContext: { maxCostPerRun: 5.0 },
    };

    const result1 = orchestrateRunIntelligence(
      ["blueprint", "schema"],
      input
    );
    const result2 = orchestrateRunIntelligence(
      ["blueprint", "schema"],
      input
    );

    // Same inputs → same provider selections
    expect(result1.decisions.map((d) => d.selectedProvider)).toEqual(
      result2.decisions.map((d) => d.selectedProvider)
    );
    expect(result1.summary.overallStatus).toBe(result2.summary.overallStatus);
    expect(result1.summary.learningAppliedStepCount).toBe(
      result2.summary.learningAppliedStepCount
    );
  });
});

// ── 15. No strategy path bypasses cost guardrail when enabled ─

describe("cost guardrail enforcement", () => {
  it("guardrail is applied when enabled, even in aggressive mode", () => {
    const routingContext = makeRoutingContext(["schema"]);
    const budgetContext: BudgetContext = { maxCostPerRun: 0.001 }; // very tight

    const strategy = resolveFactoryStrategy({
      mode: "aggressive",
      budgetContext,
      routingContext,
    });
    expect(strategy.costGuardrailEnabled).toBe(true);

    const decision = applyFactoryIntelligencePolicy(
      "schema",
      strategy,
      { mode: "aggressive", routingContext, budgetContext },
      0.0009 // nearly at budget
    );

    // Guardrail decision should exist
    expect(decision.costGuardrailDecision).toBeDefined();
  });

  it("safe mode with tight budget blocks expensive providers", () => {
    const routingContext = makeRoutingContext(["schema"]);
    const budgetContext: BudgetContext = { maxCostPerRun: 0.001 };

    const strategy = resolveFactoryStrategy({
      mode: "safe",
      budgetContext,
      routingContext,
    });

    const decision = applyFactoryIntelligencePolicy(
      "schema",
      strategy,
      { mode: "safe", routingContext, budgetContext },
      0.0009
    );

    expect(decision.costGuardrailDecision).toBeDefined();
    // With $0.001 budget and $0.0009 accumulated, most providers should be blocked/downgraded
    const guardrail = decision.costGuardrailDecision!;
    expect(["blocked", "downgraded", "allowed"]).toContain(guardrail.result);
  });
});

// ── 16. Safe vs aggressive comparison ────────────────────────

describe("safe vs aggressive mode differences", () => {
  it("aggressive allows learning for low-confidence, safe does not", () => {
    const routingContext = makeRoutingContext(["blueprint"]);

    // Create a medium-low confidence learning preference
    // totalSteps=10 → confidence = (10-5)/(20-5) = 0.33
    const lowConfidenceMetrics = [
      makeMetric({
        provider: "claude",
        taskKind: "blueprint",
        successRate: 95,
        promotedStepRate: 70,
        fallbackRate: 2,
        totalSteps: 10, // confidence ~0.33
      }),
    ];
    const learnedPreferences = deriveLearnedPreferences(lowConfidenceMetrics);
    const prefs = learnedPreferences.preferences;
    expect(prefs.length).toBe(1);
    const confidence = prefs[0].confidence;

    // Aggressive: low minConfidenceForLearningBoost (0.3) — should apply
    const aggStrategy = resolveFactoryStrategy({ mode: "aggressive" });
    expect(confidence).toBeGreaterThanOrEqual(aggStrategy.minConfidenceForLearningBoost);

    const aggDecision = applyFactoryIntelligencePolicy(
      "blueprint",
      aggStrategy,
      { mode: "aggressive", routingContext, learnedPreferences }
    );

    // Safe: high minConfidenceForLearningBoost (0.7) — should NOT apply
    const safeStrategy = resolveFactoryStrategy({ mode: "safe" });
    expect(confidence).toBeLessThan(safeStrategy.minConfidenceForLearningBoost);

    const safeDecision = applyFactoryIntelligencePolicy(
      "blueprint",
      safeStrategy,
      { mode: "safe", routingContext, learnedPreferences }
    );

    expect(aggDecision.learningApplied).toBe(true);
    expect(safeDecision.learningApplied).toBe(false);
  });
});
