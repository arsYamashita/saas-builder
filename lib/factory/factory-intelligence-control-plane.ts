/**
 * Factory Intelligence Control Plane v1
 *
 * Centralizes run-time intelligence policy for the SaaS Builder Factory.
 * Orchestrates routing, learning, cost guardrail, and regression signals
 * into a single deterministic execution strategy per run.
 *
 * Pure logic layer — no DB changes, no quality gate changes.
 *
 * Policy modes:
 *   baseline   — minimal intelligence, static behavior
 *   balanced   — recommended default, all subsystems enabled
 *   aggressive — strongest optimization, higher learning influence
 *   safe       — conservative, proven providers, reduced risk
 *
 * Decision rules:
 *   A. baseline  → disable learning, minimal orchestration
 *   B. balanced  → adaptive routing + learning + guardrail (standard bounds)
 *   C. aggressive → stronger recent weighting + higher learning influence
 *   D. safe      → weaker learning, penalize low-confidence/degraded providers
 *   E. no mode   → default to balanced
 *   F. control plane only activates/deactivates/bounds existing behaviors
 */

import type { ProviderId, TaskKind } from "../providers/provider-interface";
import type { ProviderTaskMetric } from "../providers/provider-scoreboard";
import type { RoutingContext, RoutingDecision } from "../providers/provider-router";
import { selectProvider, STEP_CANDIDATE_PROVIDERS } from "../providers/provider-router";
import type { BudgetContext, CostGuardrailDecision } from "../providers/cost-guardrail";
import { chooseBudgetAwareProvider, buildCostGuardrailLog } from "../providers/cost-guardrail";
import type { LearnedPreferences } from "../providers/provider-learning";
import {
  applyLearnedPreferenceAdjustment,
  getLearnedPreferences,
  getPreferencesByCategory,
  buildProviderLearningLog,
  MAX_ADJUSTMENT,
} from "../providers/provider-learning";
import type { RegressionStatus } from "../regression/nightly-template-regression";

// ── Policy Modes ─────────────────────────────────────────────

export type FactoryIntelligenceMode = "baseline" | "balanced" | "aggressive" | "safe";

export const DEFAULT_MODE: FactoryIntelligenceMode = "balanced";

// ── Fallback Strictness & Risk Tolerance ─────────────────────

export type FallbackStrictness = "relaxed" | "normal" | "strict";
export type RiskTolerance = "high" | "medium" | "low";

// ── Strategy Constants per Mode ──────────────────────────────

export interface ModeConstants {
  routingEnabled: boolean;
  adaptiveRoutingEnabled: boolean;
  learningEnabled: boolean;
  learningMaxInfluence: number;
  costGuardrailAlwaysEnabled: boolean;
  fallbackStrictness: FallbackStrictness;
  riskTolerance: RiskTolerance;
  minConfidenceForLearningBoost: number;
  /** Multiplier for regression degradation penalty (0 = ignore) */
  regressionDegradationPenalty: number;
}

export const MODE_CONSTANTS: Record<FactoryIntelligenceMode, ModeConstants> = {
  baseline: {
    routingEnabled: true,
    adaptiveRoutingEnabled: false,
    learningEnabled: false,
    learningMaxInfluence: 0,
    costGuardrailAlwaysEnabled: false,
    fallbackStrictness: "relaxed",
    riskTolerance: "high",
    minConfidenceForLearningBoost: 1.0,
    regressionDegradationPenalty: 0,
  },
  balanced: {
    routingEnabled: true,
    adaptiveRoutingEnabled: true,
    learningEnabled: true,
    learningMaxInfluence: MAX_ADJUSTMENT, // 0.08
    costGuardrailAlwaysEnabled: false,
    fallbackStrictness: "normal",
    riskTolerance: "medium",
    minConfidenceForLearningBoost: 0.5,
    regressionDegradationPenalty: 0.02,
  },
  aggressive: {
    routingEnabled: true,
    adaptiveRoutingEnabled: true,
    learningEnabled: true,
    learningMaxInfluence: 0.12, // higher than balanced, still bounded
    costGuardrailAlwaysEnabled: false,
    fallbackStrictness: "relaxed",
    riskTolerance: "high",
    minConfidenceForLearningBoost: 0.3,
    regressionDegradationPenalty: 0.01,
  },
  safe: {
    routingEnabled: true,
    adaptiveRoutingEnabled: true,
    learningEnabled: true,
    learningMaxInfluence: 0.04, // half of balanced
    costGuardrailAlwaysEnabled: true,
    fallbackStrictness: "strict",
    riskTolerance: "low",
    minConfidenceForLearningBoost: 0.7,
    regressionDegradationPenalty: 0.04,
  },
} as const;

// ── Strategy Types ───────────────────────────────────────────

export interface FactoryExecutionStrategy {
  mode: FactoryIntelligenceMode;
  routingEnabled: boolean;
  adaptiveRoutingEnabled: boolean;
  learningEnabled: boolean;
  learningMaxInfluence: number;
  costGuardrailEnabled: boolean;
  fallbackStrictness: FallbackStrictness;
  riskTolerance: RiskTolerance;
  minConfidenceForLearningBoost: number;
  regressionDegradationPenalty: number;
  /** Whether budget context was provided */
  budgetProvided: boolean;
  /** Whether regression signals are available */
  regressionSignalsAvailable: boolean;
}

export interface FactoryIntelligenceInput {
  mode?: FactoryIntelligenceMode;
  budgetContext?: BudgetContext;
  routingContext?: RoutingContext;
  learnedPreferences?: LearnedPreferences;
  /** Per-provider regression status from nightly runs */
  regressionSignals?: ProviderRegressionSignal[];
}

export interface ProviderRegressionSignal {
  provider: ProviderId;
  taskKind: TaskKind;
  status: RegressionStatus;
  /** Number of consecutive degraded/failed runs */
  consecutiveIssues: number;
}

// ── Step-Level Decision ──────────────────────────────────────

export interface StepIntelligenceDecision {
  taskKind: TaskKind;
  selectedProvider: ProviderId;
  routingDecision?: RoutingDecision;
  costGuardrailDecision?: CostGuardrailDecision;
  learningApplied: boolean;
  learningConfidence?: number;
  preferredProviders: ProviderId[];
  avoidedProviders: ProviderId[];
  learningReasonSummary?: string;
  baseOrder: ProviderId[];
  finalOrder: ProviderId[];
  regressionPenaltyApplied: boolean;
  downgradedDueToBudget: boolean;
  blockedDueToBudget: boolean;
}

// ── Run-Level Summary ────────────────────────────────────────

export interface FactoryIntelligenceSummary {
  mode: FactoryIntelligenceMode;
  strategy: FactoryExecutionStrategy;
  stepDecisions: StepIntelligenceDecision[];
  learningAppliedStepCount: number;
  downgradedStepCount: number;
  blockedStepCount: number;
  fallbackStepCount: number;
  regressionPenaltyStepCount: number;
  providerSelections: Array<{ taskKind: TaskKind; provider: ProviderId }>;
  overallStatus: "nominal" | "degraded" | "constrained";
  timestamp: string;
}

// ── Logging ──────────────────────────────────────────────────

export interface FactoryIntelligenceLog {
  mode: FactoryIntelligenceMode;
  strategy: FactoryExecutionStrategy;
  summary?: {
    learningAppliedStepCount: number;
    downgradedStepCount: number;
    blockedStepCount: number;
    fallbackStepCount: number;
    regressionPenaltyStepCount: number;
    overallStatus: string;
  };
  timestamp: string;
}

// ── Strategy Resolution ──────────────────────────────────────

/**
 * Resolves the execution strategy for a run based on mode and context.
 *
 * Rule E: defaults to balanced if no mode is provided.
 * Rule F: only activates/deactivates/bounds existing behaviors.
 */
export function resolveFactoryStrategy(
  input: FactoryIntelligenceInput
): FactoryExecutionStrategy {
  const mode = input.mode ?? DEFAULT_MODE;
  const constants = MODE_CONSTANTS[mode];
  const budgetProvided = input.budgetContext != null && (
    input.budgetContext.maxCostPerRun != null ||
    (input.budgetContext.maxCostPerStep != null &&
      Object.keys(input.budgetContext.maxCostPerStep).length > 0)
  );
  const regressionSignalsAvailable =
    (input.regressionSignals ?? []).length > 0;

  // Cost guardrail: enabled if mode forces it OR budget is provided
  const costGuardrailEnabled =
    constants.costGuardrailAlwaysEnabled || budgetProvided;

  return {
    mode,
    routingEnabled: constants.routingEnabled,
    adaptiveRoutingEnabled: constants.adaptiveRoutingEnabled,
    learningEnabled: constants.learningEnabled,
    learningMaxInfluence: constants.learningMaxInfluence,
    costGuardrailEnabled,
    fallbackStrictness: constants.fallbackStrictness,
    riskTolerance: constants.riskTolerance,
    minConfidenceForLearningBoost: constants.minConfidenceForLearningBoost,
    regressionDegradationPenalty: constants.regressionDegradationPenalty,
    budgetProvided,
    regressionSignalsAvailable,
  };
}

// ── Per-Step Intelligence Context ────────────────────────────

/**
 * Builds the intelligence context for a single pipeline step.
 *
 * Orchestrates:
 * 1. Provider ranking via routing
 * 2. Learning adjustment (bounded by strategy)
 * 3. Regression penalty (if signals available)
 * 4. Cost feasibility filtering
 *
 * Returns a single decision object for the step.
 */
export function applyFactoryIntelligencePolicy(
  taskKind: TaskKind,
  strategy: FactoryExecutionStrategy,
  input: FactoryIntelligenceInput,
  accumulatedCost?: number
): StepIntelligenceDecision {
  const routingContext = input.routingContext;
  const learnedPreferences = input.learnedPreferences;
  const regressionSignals = input.regressionSignals ?? [];

  // ── 1. Provider Ranking ────────────────────────────────────
  let routingDecision: RoutingDecision | undefined;
  let providerScores: Array<{ provider: ProviderId; score: number }>;

  if (strategy.routingEnabled && routingContext) {
    // Build routing context respecting adaptive flag
    const effectiveContext: RoutingContext = strategy.adaptiveRoutingEnabled
      ? routingContext
      : { metrics: routingContext.metrics }; // strip recentMetrics

    routingDecision = selectProvider(taskKind, effectiveContext);
    providerScores = routingDecision.providerScores;
  } else {
    // No routing context — use static candidates
    const candidates: ProviderId[] = STEP_CANDIDATE_PROVIDERS[taskKind] ?? [];
    providerScores = candidates.map((p: ProviderId) => ({ provider: p, score: 0 }));
  }

  const baseOrder = providerScores.map((ps) => ps.provider);

  // ── 2. Learning Adjustment ─────────────────────────────────
  let learningApplied = false;
  let learningConfidence: number | undefined;
  let preferredProviders: ProviderId[] = [];
  let avoidedProviders: ProviderId[] = [];
  let learningReasonSummary: string | undefined;

  if (strategy.learningEnabled && learnedPreferences) {
    const taskPrefs = getLearnedPreferences(learnedPreferences, taskKind);
    const categories = getPreferencesByCategory(learnedPreferences, taskKind);
    preferredProviders = categories.preferredProviders;
    avoidedProviders = categories.avoidedProviders;

    if (taskPrefs.length > 0) {
      const maxConfidence = Math.max(...taskPrefs.map((p) => p.confidence));
      learningConfidence = maxConfidence;

      // Apply learning only if confidence meets threshold
      if (maxConfidence >= strategy.minConfidenceForLearningBoost) {
        // Cap influence to strategy-defined max
        const cappedPrefs = capLearningInfluence(learnedPreferences, taskKind, strategy.learningMaxInfluence);
        const adjusted = applyLearnedPreferenceAdjustment(
          providerScores,
          taskKind,
          cappedPrefs
        );

        const hasAdjustment = adjusted.some((a) => a.adjustment !== 0);
        if (hasAdjustment) {
          learningApplied = true;
          adjusted.sort((a, b) => b.score - a.score);
          providerScores = adjusted.map((a) => ({ provider: a.provider, score: a.score }));

          const log = buildProviderLearningLog(taskKind, taskPrefs, adjusted, baseOrder.map((p) => {
            const orig = routingDecision?.providerScores.find((ps) => ps.provider === p);
            return { provider: p, score: orig?.score ?? 0 };
          }));
          console.log(`[factory-intelligence] learning: ${JSON.stringify(log)}`);
        }
      }

      learningReasonSummary = taskPrefs.map((p) => p.reasonSummary).join(" | ");
    }
  }

  // ── 3. Regression Penalty ──────────────────────────────────
  let regressionPenaltyApplied = false;

  if (strategy.regressionDegradationPenalty > 0 && regressionSignals.length > 0) {
    const taskSignals = regressionSignals.filter((s) => s.taskKind === taskKind);
    if (taskSignals.length > 0) {
      const penalized = providerScores.map((ps) => {
        const signal = taskSignals.find((s) => s.provider === ps.provider);
        if (!signal) return ps;

        let penalty = 0;
        if (signal.status === "degraded") {
          penalty = strategy.regressionDegradationPenalty * signal.consecutiveIssues;
        } else if (signal.status === "fail") {
          penalty = strategy.regressionDegradationPenalty * signal.consecutiveIssues * 2;
        }

        if (penalty > 0) {
          regressionPenaltyApplied = true;
          return { provider: ps.provider, score: Math.round((ps.score - penalty) * 100) / 100 };
        }
        return ps;
      });

      if (regressionPenaltyApplied) {
        penalized.sort((a, b) => b.score - a.score);
        providerScores = penalized;
      }
    }
  }

  const finalOrder = providerScores.map((ps) => ps.provider);

  // ── 4. Cost Feasibility Filtering ──────────────────────────
  let costGuardrailDecision: CostGuardrailDecision | undefined;
  let downgradedDueToBudget = false;
  let blockedDueToBudget = false;

  if (strategy.costGuardrailEnabled && input.budgetContext && routingContext) {
    costGuardrailDecision = chooseBudgetAwareProvider({
      taskKind,
      rankedProviders: finalOrder,
      metrics: routingContext.metrics,
      accumulatedCost: accumulatedCost ?? 0,
      budget: input.budgetContext,
    });

    const guardrailLog = buildCostGuardrailLog(taskKind, finalOrder, costGuardrailDecision);
    console.log(`[factory-intelligence] guardrail: ${JSON.stringify(guardrailLog)}`);

    if (costGuardrailDecision.result === "downgraded") {
      downgradedDueToBudget = true;
    }
    if (costGuardrailDecision.result === "blocked") {
      blockedDueToBudget = true;
    }
  }

  // ── 5. Final Provider Selection ────────────────────────────
  let selectedProvider: ProviderId;

  if (costGuardrailDecision) {
    if (costGuardrailDecision.result === "blocked") {
      selectedProvider = finalOrder[0]; // will be blocked by caller
    } else {
      selectedProvider = costGuardrailDecision.selectedProvider!;
    }
  } else {
    selectedProvider = finalOrder[0];
  }

  return {
    taskKind,
    selectedProvider,
    routingDecision,
    costGuardrailDecision,
    learningApplied,
    learningConfidence,
    preferredProviders,
    avoidedProviders,
    learningReasonSummary,
    baseOrder,
    finalOrder,
    regressionPenaltyApplied,
    downgradedDueToBudget,
    blockedDueToBudget,
  };
}

// ── Run-Level Summary Builder ────────────────────────────────

/**
 * Aggregates step decisions into a run-level intelligence summary.
 */
export function buildFactoryIntelligenceSummary(
  strategy: FactoryExecutionStrategy,
  stepDecisions: StepIntelligenceDecision[]
): FactoryIntelligenceSummary {
  const learningAppliedStepCount = stepDecisions.filter((d) => d.learningApplied).length;
  const downgradedStepCount = stepDecisions.filter((d) => d.downgradedDueToBudget).length;
  const blockedStepCount = stepDecisions.filter((d) => d.blockedDueToBudget).length;
  const fallbackStepCount = stepDecisions.filter((d) =>
    d.routingDecision && d.selectedProvider !== d.routingDecision.provider
  ).length;
  const regressionPenaltyStepCount = stepDecisions.filter((d) => d.regressionPenaltyApplied).length;

  const providerSelections = stepDecisions.map((d) => ({
    taskKind: d.taskKind,
    provider: d.selectedProvider,
  }));

  // Determine overall status
  let overallStatus: FactoryIntelligenceSummary["overallStatus"] = "nominal";
  if (blockedStepCount > 0) {
    overallStatus = "constrained";
  } else if (downgradedStepCount > 0 || fallbackStepCount > 0) {
    overallStatus = "degraded";
  }

  return {
    mode: strategy.mode,
    strategy,
    stepDecisions,
    learningAppliedStepCount,
    downgradedStepCount,
    blockedStepCount,
    fallbackStepCount,
    regressionPenaltyStepCount,
    providerSelections,
    overallStatus,
    timestamp: new Date().toISOString(),
  };
}

// ── Logging ──────────────────────────────────────────────────

/**
 * Builds a structured run-level intelligence log entry.
 */
export function buildFactoryIntelligenceLog(
  strategy: FactoryExecutionStrategy,
  summary?: FactoryIntelligenceSummary
): FactoryIntelligenceLog {
  return {
    mode: strategy.mode,
    strategy,
    summary: summary
      ? {
          learningAppliedStepCount: summary.learningAppliedStepCount,
          downgradedStepCount: summary.downgradedStepCount,
          blockedStepCount: summary.blockedStepCount,
          fallbackStepCount: summary.fallbackStepCount,
          regressionPenaltyStepCount: summary.regressionPenaltyStepCount,
          overallStatus: summary.overallStatus,
        }
      : undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Logs the resolved strategy at run start.
 */
export function logFactoryStrategy(strategy: FactoryExecutionStrategy): void {
  const log = buildFactoryIntelligenceLog(strategy);
  console.log(`[factory-intelligence] strategy: ${JSON.stringify(log)}`);
}

/**
 * Logs the run-level summary at run end.
 */
export function logFactoryRunSummary(
  strategy: FactoryExecutionStrategy,
  summary: FactoryIntelligenceSummary
): void {
  const log = buildFactoryIntelligenceLog(strategy, summary);
  console.log(`[factory-intelligence] run-summary: ${JSON.stringify(log)}`);
}

// ── Learning Influence Capping ───────────────────────────────

/**
 * Creates a capped copy of learned preferences where adjustments
 * are bounded to the strategy's learningMaxInfluence.
 *
 * This allows aggressive mode to allow higher influence (0.12)
 * and safe mode to cap lower (0.04) without modifying the
 * underlying learning module.
 */
function capLearningInfluence(
  prefs: LearnedPreferences,
  taskKind: TaskKind,
  maxInfluence: number
): LearnedPreferences {
  if (maxInfluence >= MAX_ADJUSTMENT) {
    // No capping needed if strategy max >= learning module max
    // But for aggressive (0.12 > 0.08), we need to scale up within the max
    if (maxInfluence <= MAX_ADJUSTMENT) return prefs;
  }

  const scaleFactor = maxInfluence / MAX_ADJUSTMENT;

  return {
    ...prefs,
    preferences: prefs.preferences.map((p) => {
      if (p.taskKind !== taskKind) return p;
      const cappedAdjustment = Math.round(p.adjustment * scaleFactor * 10000) / 10000;
      return { ...p, adjustment: cappedAdjustment };
    }),
  };
}

// ── Convenience: Full Pipeline Orchestration ─────────────────

/**
 * Orchestrates the full intelligence pipeline for a set of steps.
 *
 * This is the primary integration point for generation orchestrators.
 * Instead of manually wiring routing + learning + guardrail per step,
 * call this once with the full step list.
 */
export function orchestrateRunIntelligence(
  steps: TaskKind[],
  input: FactoryIntelligenceInput,
  accumulatedCostStart?: number
): {
  strategy: FactoryExecutionStrategy;
  decisions: StepIntelligenceDecision[];
  summary: FactoryIntelligenceSummary;
} {
  const strategy = resolveFactoryStrategy(input);
  logFactoryStrategy(strategy);

  const decisions: StepIntelligenceDecision[] = [];
  let accumulatedCost = accumulatedCostStart ?? 0;

  for (const taskKind of steps) {
    const decision = applyFactoryIntelligencePolicy(
      taskKind,
      strategy,
      input,
      accumulatedCost
    );
    decisions.push(decision);

    // Update accumulated cost from guardrail projection
    if (decision.costGuardrailDecision?.projectedStepCost != null) {
      accumulatedCost += decision.costGuardrailDecision.projectedStepCost;
    }
  }

  const summary = buildFactoryIntelligenceSummary(strategy, decisions);
  logFactoryRunSummary(strategy, summary);

  return { strategy, decisions, summary };
}
