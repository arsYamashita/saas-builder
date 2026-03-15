import { describe, it, expect } from "vitest";
import {
  evaluateStepBudget,
  evaluateRunBudget,
  chooseBudgetAwareProvider,
  computeProjectedRunCost,
  buildCostGuardrailLog,
  buildProviderCostEstimates,
  DEFAULT_STEP_COST_ESTIMATES,
  type StepBudgetInput,
  type BudgetContext,
  type CostGuardrailDecision,
} from "../cost-guardrail";
import type { ProviderTaskMetric } from "../provider-scoreboard";
import type { ProviderId } from "../provider-interface";

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

function makeCostMap(
  costs: Record<string, number | null>
): Map<ProviderId, number | null> {
  const map = new Map<ProviderId, number | null>();
  for (const [k, v] of Object.entries(costs)) {
    map.set(k as ProviderId, v);
  }
  return map;
}

// ── 1. allows primary provider when within budget ───────────

describe("evaluateStepBudget", () => {
  it("allows primary provider when within budget", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.05, gemini: 0.002 }),
      accumulatedCost: 0.1,
      budget: { maxCostPerRun: 1.0, maxCostPerStep: { schema: 0.1 } },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("allowed");
    expect(decision.selectedProvider).toBe("claude");
    expect(decision.projectedStepCost).toBe(0.05);
    expect(decision.rejectedProvidersDueToBudget).toEqual([]);
  });

  // ── 2. downgrades when primary exceeds step budget ──────

  it("downgrades to cheaper provider when primary exceeds step budget", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.08, gemini: 0.002 }),
      accumulatedCost: 0,
      budget: { maxCostPerRun: 1.0, maxCostPerStep: { schema: 0.05 } },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("downgraded");
    expect(decision.selectedProvider).toBe("gemini");
    expect(decision.costDowngradedFromProvider).toBe("claude");
    expect(decision.costDowngradedToProvider).toBe("gemini");
    expect(decision.rejectedProvidersDueToBudget).toContain("claude");
  });

  // ── 3. downgrades when primary exceeds run budget ───────

  it("downgrades to cheaper provider when primary exceeds run budget", () => {
    const input: StepBudgetInput = {
      taskKind: "implementation",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.08, gemini: 0.002 }),
      accumulatedCost: 0.95,
      budget: { maxCostPerRun: 1.0 },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("downgraded");
    expect(decision.selectedProvider).toBe("gemini");
    expect(decision.rejectedProvidersDueToBudget).toContain("claude");
  });

  // ── 4. blocks when no provider fits budget ────────────────

  it("blocks when no provider fits budget", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.08, gemini: 0.06 }),
      accumulatedCost: 0,
      budget: { maxCostPerRun: 1.0, maxCostPerStep: { schema: 0.01 } },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("blocked");
    expect(decision.selectedProvider).toBeNull();
    expect(decision.rejectedProvidersDueToBudget).toContain("claude");
    expect(decision.rejectedProvidersDueToBudget).toContain("gemini");
    expect(decision.reason).toBeTruthy();
  });

  // ── 5. blocks when accumulated run cost already exceeds ───

  it("blocks immediately when accumulated run cost already exceeds maxCostPerRun", () => {
    const input: StepBudgetInput = {
      taskKind: "api_design",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.01, gemini: 0.002 }),
      accumulatedCost: 1.5,
      budget: { maxCostPerRun: 1.0 },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("blocked");
    expect(decision.selectedProvider).toBeNull();
    expect(decision.reason).toContain("already exceeds");
  });

  // ── 6. respects optional no-budget mode ───────────────────

  it("allows when no budget constraints are set", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.5, gemini: 0.002 }),
      accumulatedCost: 100,
      budget: {},
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("allowed");
    expect(decision.selectedProvider).toBe("claude");
  });

  it("allows with null maxCostPerRun", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude"],
      providerCostEstimates: makeCostMap({ claude: 0.5 }),
      accumulatedCost: 100,
      budget: { maxCostPerRun: null },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("allowed");
  });

  // ── 7. respects per-step budget overrides ─────────────────

  it("uses per-step budget override for the specific taskKind", () => {
    const input: StepBudgetInput = {
      taskKind: "blueprint",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.05, gemini: 0.002 }),
      accumulatedCost: 0,
      budget: {
        maxCostPerRun: 10.0,
        maxCostPerStep: {
          blueprint: 0.01, // tight limit on blueprint
          schema: 1.0,     // generous for schema
        },
      },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("downgraded");
    expect(decision.selectedProvider).toBe("gemini");
    expect(decision.maxCostPerStep).toBe(0.01);
  });

  it("has no step limit when taskKind not in maxCostPerStep", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude"],
      providerCostEstimates: makeCostMap({ claude: 0.5 }),
      accumulatedCost: 0,
      budget: {
        maxCostPerRun: 10.0,
        maxCostPerStep: { blueprint: 0.01 }, // schema not listed
      },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("allowed");
    expect(decision.maxCostPerStep).toBeNull();
  });

  // ── 8. logs rejected providers due to budget ──────────────

  it("accumulates all rejected providers in order", () => {
    const input: StepBudgetInput = {
      taskKind: "implementation",
      rankedProviders: ["claude", "openai", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.1, openai: 0.08, gemini: 0.002 }),
      accumulatedCost: 0,
      budget: { maxCostPerStep: { implementation: 0.05 } },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("downgraded");
    expect(decision.selectedProvider).toBe("gemini");
    expect(decision.rejectedProvidersDueToBudget).toEqual(["claude", "openai"]);
  });

  // ── 9. preserves router ranking order before budget filtering ──

  it("preserves router ranking order — picks first that fits", () => {
    const input: StepBudgetInput = {
      taskKind: "api_design",
      rankedProviders: ["claude", "gemini", "openai"],
      providerCostEstimates: makeCostMap({ claude: 0.1, gemini: 0.002, openai: 0.03 }),
      accumulatedCost: 0,
      budget: { maxCostPerStep: { api_design: 0.05 } },
    };

    const decision = evaluateStepBudget(input);
    // gemini is second in ranking, openai is third — gemini should be picked first
    expect(decision.selectedProvider).toBe("gemini");
    expect(decision.rejectedProvidersDueToBudget).toEqual(["claude"]);
  });

  // ── Unknown cost ──────────────────────────────────────────

  it("allows provider with unknown cost (null estimate)", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude"],
      providerCostEstimates: makeCostMap({ claude: null }),
      accumulatedCost: 0,
      budget: { maxCostPerRun: 0.01 },
    };

    const decision = evaluateStepBudget(input);
    expect(decision.result).toBe("allowed");
    expect(decision.projectedStepCost).toBeNull();
  });
});

// ── 10. metadata includes guardrail result ──────────────────

describe("CostGuardrailDecision shape", () => {
  it("includes all metadata fields", () => {
    const input: StepBudgetInput = {
      taskKind: "schema",
      rankedProviders: ["claude", "gemini"],
      providerCostEstimates: makeCostMap({ claude: 0.05, gemini: 0.002 }),
      accumulatedCost: 0.2,
      budget: { maxCostPerRun: 1.0, maxCostPerStep: { schema: 0.1 } },
    };

    const decision = evaluateStepBudget(input);
    expect(decision).toHaveProperty("result");
    expect(decision).toHaveProperty("selectedProvider");
    expect(decision).toHaveProperty("rejectedProvidersDueToBudget");
    expect(decision).toHaveProperty("projectedStepCost");
    expect(decision).toHaveProperty("accumulatedEstimatedCost");
    expect(decision).toHaveProperty("maxCostPerRun");
    expect(decision).toHaveProperty("maxCostPerStep");
    expect(decision).toHaveProperty("originalProvider");
  });
});

// ── 11. fallback/projection handling is deterministic ───────

describe("deterministic behavior", () => {
  it("produces same result for same input", () => {
    const input: StepBudgetInput = {
      taskKind: "blueprint",
      rankedProviders: ["gemini", "claude"],
      providerCostEstimates: makeCostMap({ gemini: 0.002, claude: 0.05 }),
      accumulatedCost: 0.5,
      budget: { maxCostPerRun: 0.55 },
    };

    const d1 = evaluateStepBudget(input);
    const d2 = evaluateStepBudget(input);
    expect(d1.result).toBe(d2.result);
    expect(d1.selectedProvider).toBe(d2.selectedProvider);
    expect(d1.projectedStepCost).toBe(d2.projectedStepCost);
  });
});

// ── 12. accumulated estimated cost updates correctly ────────

describe("accumulated cost tracking", () => {
  it("updates accumulated cost after each step", () => {
    // Step 1
    const step1 = evaluateStepBudget({
      taskKind: "blueprint",
      rankedProviders: ["gemini"],
      providerCostEstimates: makeCostMap({ gemini: 0.01 }),
      accumulatedCost: 0,
      budget: { maxCostPerRun: 0.05 },
    });
    expect(step1.result).toBe("allowed");
    expect(step1.accumulatedEstimatedCost).toBe(0.01);

    // Step 2 using accumulated from step 1
    const step2 = evaluateStepBudget({
      taskKind: "implementation",
      rankedProviders: ["claude"],
      providerCostEstimates: makeCostMap({ claude: 0.02 }),
      accumulatedCost: step1.accumulatedEstimatedCost,
      budget: { maxCostPerRun: 0.05 },
    });
    expect(step2.result).toBe("allowed");
    expect(step2.accumulatedEstimatedCost).toBe(0.03);

    // Step 3 would exceed budget
    const step3 = evaluateStepBudget({
      taskKind: "schema",
      rankedProviders: ["claude"],
      providerCostEstimates: makeCostMap({ claude: 0.03 }),
      accumulatedCost: step2.accumulatedEstimatedCost,
      budget: { maxCostPerRun: 0.05 },
    });
    expect(step3.result).toBe("blocked");
    expect(step3.accumulatedEstimatedCost).toBe(0.03); // unchanged
  });
});

// ── evaluateRunBudget ───────────────────────────────────────

describe("evaluateRunBudget", () => {
  it("returns within budget when under limit", () => {
    const result = evaluateRunBudget(0.5, 1.0);
    expect(result.withinBudget).toBe(true);
    expect(result.remainingBudget).toBe(0.5);
  });

  it("returns over budget when at limit", () => {
    const result = evaluateRunBudget(1.0, 1.0);
    expect(result.withinBudget).toBe(false);
    expect(result.remainingBudget).toBe(0);
  });

  it("returns always within budget when no limit", () => {
    const result = evaluateRunBudget(999, null);
    expect(result.withinBudget).toBe(true);
    expect(result.remainingBudget).toBeNull();
  });
});

// ── buildProviderCostEstimates ──────────────────────────────

describe("buildProviderCostEstimates", () => {
  it("uses scoreboard metrics when available", () => {
    const metrics = [
      makeMetric({ provider: "claude", taskKind: "schema", avgCostPerStep: 0.042 }),
    ];

    const estimates = buildProviderCostEstimates("schema", ["claude"], metrics);
    expect(estimates.get("claude")).toBe(0.042);
  });

  it("falls back to default estimates when no metrics", () => {
    const estimates = buildProviderCostEstimates("schema", ["claude", "gemini"], []);
    expect(estimates.get("claude")).toBe(DEFAULT_STEP_COST_ESTIMATES.claude);
    expect(estimates.get("gemini")).toBe(DEFAULT_STEP_COST_ESTIMATES.gemini);
  });
});

// ── chooseBudgetAwareProvider ───────────────────────────────

describe("chooseBudgetAwareProvider", () => {
  it("combines routing ranking with budget filtering", () => {
    const decision = chooseBudgetAwareProvider({
      taskKind: "schema",
      rankedProviders: ["claude", "gemini"],
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema", avgCostPerStep: 0.08 }),
        makeMetric({ provider: "gemini", taskKind: "schema", avgCostPerStep: 0.002 }),
      ],
      accumulatedCost: 0,
      budget: { maxCostPerStep: { schema: 0.05 } },
    });

    expect(decision.result).toBe("downgraded");
    expect(decision.selectedProvider).toBe("gemini");
  });
});

// ── computeProjectedRunCost ─────────────────────────────────

describe("computeProjectedRunCost", () => {
  it("sums cheapest provider cost per remaining step", () => {
    const cost = computeProjectedRunCost({
      remainingSteps: ["schema", "api_design"],
      metrics: [
        makeMetric({ provider: "claude", taskKind: "schema", avgCostPerStep: 0.05 }),
        makeMetric({ provider: "gemini", taskKind: "schema", avgCostPerStep: 0.002 }),
        makeMetric({ provider: "claude", taskKind: "api_design", avgCostPerStep: 0.04 }),
      ],
      rankedProvidersPerStep: {
        schema: ["claude", "gemini"],
        api_design: ["claude"],
      },
    });

    // cheapest for schema = gemini 0.002, cheapest for api_design = claude 0.04
    expect(cost).toBe(0.042);
  });
});

// ── buildCostGuardrailLog ───────────────────────────────────

describe("buildCostGuardrailLog", () => {
  it("builds a structured log entry", () => {
    const decision: CostGuardrailDecision = {
      result: "downgraded",
      selectedProvider: "gemini",
      rejectedProvidersDueToBudget: ["claude"],
      projectedStepCost: 0.002,
      accumulatedEstimatedCost: 0.102,
      maxCostPerRun: 0.5,
      maxCostPerStep: 0.05,
      originalProvider: "claude",
      costDowngradedFromProvider: "claude",
      costDowngradedToProvider: "gemini",
      reason: "Provider claude projected cost $0.08 exceeds budget",
    };

    const log = buildCostGuardrailLog("schema", ["claude", "gemini"], decision);
    expect(log.taskKind).toBe("schema");
    expect(log.candidateProviders).toEqual(["claude", "gemini"]);
    expect(log.selectedProvider).toBe("gemini");
    expect(log.costGuardrailResult).toBe("downgraded");
    expect(log.rejectedProvidersDueToBudget).toEqual(["claude"]);
    expect(log.timestamp).toBeDefined();
  });
});
