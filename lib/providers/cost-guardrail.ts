/**
 * Cost Guardrail v1
 *
 * Budget-aware provider selection layer.
 * Sits after routing score ranking, before execution.
 *
 * Decision rules:
 *   A. Primary fits budget → allowed
 *   B. Primary exceeds budget → try next ranked cheaper provider → downgraded
 *   C. No candidate fits → blocked
 *   D. Accumulated run cost already exceeds maxCostPerRun → blocked immediately
 *
 * Pure logic layer — no DB changes, no quality gate changes.
 */

import type { ProviderId, TaskKind } from "./provider-interface";
import type { ProviderTaskMetric } from "./provider-scoreboard";

// ── Types ───────────────────────────────────────────────────

export type CostGuardrailResult = "allowed" | "downgraded" | "blocked";

export interface CostGuardrailDecision {
  result: CostGuardrailResult;
  selectedProvider: ProviderId | null;
  rejectedProvidersDueToBudget: ProviderId[];
  projectedStepCost: number | null;
  accumulatedEstimatedCost: number;
  maxCostPerRun: number | null;
  maxCostPerStep: number | null;
  /** Original top-ranked provider before budget filtering */
  originalProvider: ProviderId;
  /** Set when result = "downgraded" */
  costDowngradedFromProvider?: ProviderId;
  /** Set when result = "downgraded" */
  costDowngradedToProvider?: ProviderId;
  reason?: string;
}

export interface BudgetContext {
  /** Maximum total cost for the entire run (USD). null = no limit */
  maxCostPerRun?: number | null;
  /** Per-step cost limits (USD). Unset steps have no limit */
  maxCostPerStep?: Partial<Record<TaskKind, number>>;
}

export interface StepBudgetInput {
  taskKind: TaskKind;
  /** Providers ordered by routing score (best first) */
  rankedProviders: ProviderId[];
  /** Projected cost per provider for this step */
  providerCostEstimates: Map<ProviderId, number | null>;
  /** Cost accumulated from previous steps in this run */
  accumulatedCost: number;
  /** Budget constraints */
  budget: BudgetContext;
}

// ── Cost Estimation ─────────────────────────────────────────

/**
 * Default cost estimates per provider based on typical step usage.
 * Used when no scoreboard metrics are available.
 * Values derived from MODEL_PRICING with typical token counts
 * (~2k input, ~4k output per step).
 */
export const DEFAULT_STEP_COST_ESTIMATES: Record<ProviderId, number> = {
  gemini: 0.002,   // gemini-2.0-flash: very cheap
  claude: 0.066,   // claude-sonnet-4: moderate
  openai: 0.04,    // gpt-4o: moderate
};

/**
 * Builds a cost estimate map for providers using scoreboard metrics.
 * Falls back to default estimates when metrics are unavailable.
 */
export function buildProviderCostEstimates(
  taskKind: TaskKind,
  providers: ProviderId[],
  metrics: ProviderTaskMetric[]
): Map<ProviderId, number | null> {
  const estimates = new Map<ProviderId, number | null>();

  for (const provider of providers) {
    const metric = metrics.find(
      (m) => m.provider === provider && m.taskKind === taskKind
    );

    if (metric && metric.avgCostPerStep > 0) {
      estimates.set(provider, metric.avgCostPerStep);
    } else {
      // Use default estimate
      estimates.set(provider, DEFAULT_STEP_COST_ESTIMATES[provider] ?? null);
    }
  }

  return estimates;
}

// ── Core Guardrail Logic ────────────────────────────────────

/**
 * Evaluates whether a step can proceed within budget constraints.
 * Returns the guardrail decision with the approved or blocked provider.
 *
 * Flow:
 * 1. Check if accumulated cost already exceeds run budget → block
 * 2. For each provider (in ranking order):
 *    a. Estimate step cost
 *    b. Check against step budget
 *    c. Check against remaining run budget
 *    d. If fits → select (allowed or downgraded)
 * 3. If none fit → blocked
 */
export function evaluateStepBudget(input: StepBudgetInput): CostGuardrailDecision {
  const { taskKind, rankedProviders, providerCostEstimates, accumulatedCost, budget } = input;

  const maxRun = budget.maxCostPerRun ?? null;
  const maxStep = budget.maxCostPerStep?.[taskKind] ?? null;
  const originalProvider = rankedProviders[0];

  // Rule E: Block immediately if accumulated cost already exceeds run budget
  if (maxRun != null && accumulatedCost >= maxRun) {
    return {
      result: "blocked",
      selectedProvider: null,
      rejectedProvidersDueToBudget: [...rankedProviders],
      projectedStepCost: null,
      accumulatedEstimatedCost: accumulatedCost,
      maxCostPerRun: maxRun,
      maxCostPerStep: maxStep,
      originalProvider,
      reason: `Accumulated cost $${accumulatedCost} already exceeds run budget $${maxRun}`,
    };
  }

  const rejected: ProviderId[] = [];

  for (const provider of rankedProviders) {
    const estimatedCost = providerCostEstimates.get(provider) ?? null;

    // If we can't estimate cost, allow it (conservative = don't block unknown)
    if (estimatedCost == null) {
      const isDowngraded = provider !== originalProvider;
      return {
        result: isDowngraded ? "downgraded" : "allowed",
        selectedProvider: provider,
        rejectedProvidersDueToBudget: rejected,
        projectedStepCost: null,
        accumulatedEstimatedCost: accumulatedCost,
        maxCostPerRun: maxRun,
        maxCostPerStep: maxStep,
        originalProvider,
        ...(isDowngraded
          ? { costDowngradedFromProvider: originalProvider, costDowngradedToProvider: provider }
          : {}),
      };
    }

    // Check step budget (Rule A/B)
    if (maxStep != null && estimatedCost > maxStep) {
      rejected.push(provider);
      continue;
    }

    // Check run budget (remaining = maxRun - accumulated)
    if (maxRun != null && accumulatedCost + estimatedCost > maxRun) {
      rejected.push(provider);
      continue;
    }

    // Provider fits budget
    const isDowngraded = provider !== originalProvider;
    return {
      result: isDowngraded ? "downgraded" : "allowed",
      selectedProvider: provider,
      rejectedProvidersDueToBudget: rejected,
      projectedStepCost: estimatedCost,
      accumulatedEstimatedCost: accumulatedCost + estimatedCost,
      maxCostPerRun: maxRun,
      maxCostPerStep: maxStep,
      originalProvider,
      ...(isDowngraded
        ? {
            costDowngradedFromProvider: originalProvider,
            costDowngradedToProvider: provider,
            reason: `Provider ${originalProvider} projected cost $${providerCostEstimates.get(originalProvider)} exceeds budget`,
          }
        : {}),
    };
  }

  // Rule D: No candidate fits
  return {
    result: "blocked",
    selectedProvider: null,
    rejectedProvidersDueToBudget: rejected,
    projectedStepCost: null,
    accumulatedEstimatedCost: accumulatedCost,
    maxCostPerRun: maxRun,
    maxCostPerStep: maxStep,
    originalProvider,
    reason: `No provider fits budget (step limit: ${maxStep != null ? `$${maxStep}` : "none"}, run remaining: ${maxRun != null ? `$${Math.max(0, maxRun - accumulatedCost)}` : "none"})`,
  };
}

/**
 * Evaluates run-level budget status.
 * Returns true if the run can continue (accumulated cost within budget).
 */
export function evaluateRunBudget(
  accumulatedCost: number,
  maxCostPerRun: number | null
): { withinBudget: boolean; remainingBudget: number | null } {
  if (maxCostPerRun == null) {
    return { withinBudget: true, remainingBudget: null };
  }
  return {
    withinBudget: accumulatedCost < maxCostPerRun,
    remainingBudget: Math.max(0, maxCostPerRun - accumulatedCost),
  };
}

/**
 * Convenience: chooses a budget-aware provider from a routing-ranked list.
 *
 * Combines routing ranking + budget filtering in one call.
 * This is the primary integration point for the pipeline.
 */
export function chooseBudgetAwareProvider(opts: {
  taskKind: TaskKind;
  rankedProviders: ProviderId[];
  metrics: ProviderTaskMetric[];
  accumulatedCost: number;
  budget: BudgetContext;
}): CostGuardrailDecision {
  const costEstimates = buildProviderCostEstimates(
    opts.taskKind,
    opts.rankedProviders,
    opts.metrics
  );

  return evaluateStepBudget({
    taskKind: opts.taskKind,
    rankedProviders: opts.rankedProviders,
    providerCostEstimates: costEstimates,
    accumulatedCost: opts.accumulatedCost,
    budget: opts.budget,
  });
}

/**
 * Projects the total estimated cost for remaining steps in a run.
 * Uses cheapest available provider cost for each step.
 */
export function computeProjectedRunCost(opts: {
  remainingSteps: TaskKind[];
  metrics: ProviderTaskMetric[];
  rankedProvidersPerStep: Record<string, ProviderId[]>;
}): number {
  let total = 0;
  for (const taskKind of opts.remainingSteps) {
    const providers = opts.rankedProvidersPerStep[taskKind] ?? [];
    const estimates = buildProviderCostEstimates(taskKind, providers, opts.metrics);
    // Use cheapest available
    let cheapest = Infinity;
    for (const cost of Array.from(estimates.values())) {
      if (cost != null && cost < cheapest) cheapest = cost;
    }
    if (cheapest < Infinity) total += cheapest;
  }
  return Math.round(total * 10000) / 10000;
}

// ── Logging ─────────────────────────────────────────────────

export interface CostGuardrailLog {
  taskKind: TaskKind;
  candidateProviders: ProviderId[];
  selectedProvider: ProviderId | null;
  rejectedProvidersDueToBudget: ProviderId[];
  projectedStepCost: number | null;
  accumulatedEstimatedCost: number;
  maxCostPerRun: number | null;
  maxCostPerStep: number | null;
  costGuardrailResult: CostGuardrailResult;
  reason?: string;
  timestamp: string;
}

export function buildCostGuardrailLog(
  taskKind: TaskKind,
  candidateProviders: ProviderId[],
  decision: CostGuardrailDecision
): CostGuardrailLog {
  return {
    taskKind,
    candidateProviders,
    selectedProvider: decision.selectedProvider,
    rejectedProvidersDueToBudget: decision.rejectedProvidersDueToBudget,
    projectedStepCost: decision.projectedStepCost,
    accumulatedEstimatedCost: decision.accumulatedEstimatedCost,
    maxCostPerRun: decision.maxCostPerRun,
    maxCostPerStep: decision.maxCostPerStep,
    costGuardrailResult: decision.result,
    reason: decision.reason,
    timestamp: new Date().toISOString(),
  };
}
