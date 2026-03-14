/**
 * Task Router
 *
 * Resolves which provider to use for each taskKind.
 * Static routing with fallback support.
 */

import type {
  TaskKind,
  ProviderId,
  ProviderAdapter,
  ExpectedFormat,
  TASK_EXPECTED_FORMAT,
  ProviderRawResult,
} from "./provider-interface";
import { TASK_EXPECTED_FORMAT as FORMAT_MAP } from "./provider-interface";
import { GeminiAdapter } from "./gemini";
import { ClaudeAdapter } from "./claude";
import { OpenAIAdapter } from "./openai";
import {
  normalizeResult,
  validateNormalizedResult,
  type NormalizedResult,
} from "./result-normalizer";
import {
  selectProvider,
  buildRoutingLog,
  type RoutingContext,
  type RoutingDecision,
} from "./provider-router";
import {
  chooseBudgetAwareProvider,
  buildCostGuardrailLog,
  type BudgetContext,
  type CostGuardrailDecision,
} from "./cost-guardrail";
import {
  applyLearnedPreferenceAdjustment,
  getLearnedPreferences,
  getPreferencesByCategory,
  buildProviderLearningLog,
  type LearnedPreferences,
} from "./provider-learning";

// ── Static Route Table ──────────────────────────────────────

export interface TaskRoute {
  primary: ProviderId;
  fallback: ProviderId | null;
  system?: string;
}

/**
 * Maps each taskKind to its primary and fallback provider.
 * This mirrors the current codebase behavior:
 * - blueprint / brief_rewrite: Gemini primary, Claude fallback
 * - implementation / schema / api_design / file_split: Claude primary, no fallback
 * - ui_generation / quality_fix / regression_repair: Claude primary (future)
 */
const ROUTE_TABLE: Record<TaskKind, TaskRoute> = {
  intake: {
    primary: "gemini",
    fallback: "claude",
  },
  blueprint: {
    primary: "gemini",
    fallback: "claude",
  },
  brief_rewrite: {
    primary: "gemini",
    fallback: "claude",
  },
  implementation: {
    primary: "claude",
    fallback: null,
    system: "You are a senior SaaS architect and tech lead. Return structured implementation guidance.",
  },
  schema: {
    primary: "claude",
    fallback: null,
    system: "You are a PostgreSQL and SaaS schema expert. Return production-grade schema output.",
  },
  api_design: {
    primary: "claude",
    fallback: null,
    system: "You are a Next.js API route and SaaS backend expert. Return production-grade API design.",
  },
  file_split: {
    primary: "claude",
    fallback: null,
    system: "You convert SaaS implementation outputs into saveable file objects. Return JSON only.",
  },
  ui_generation: {
    primary: "claude",
    fallback: null,
  },
  quality_fix: {
    primary: "claude",
    fallback: null,
  },
  regression_repair: {
    primary: "claude",
    fallback: null,
  },
};

// ── Adapter Registry ────────────────────────────────────────

const adapters: Record<ProviderId, ProviderAdapter> = {
  gemini: new GeminiAdapter(),
  claude: new ClaudeAdapter(),
  openai: new OpenAIAdapter(),
};

// ── Router ──────────────────────────────────────────────────

export function getRouteForTask(taskKind: TaskKind): TaskRoute {
  return ROUTE_TABLE[taskKind];
}

export function getExpectedFormat(taskKind: TaskKind): ExpectedFormat {
  return FORMAT_MAP[taskKind];
}

export function getAdapter(providerId: ProviderId): ProviderAdapter {
  return adapters[providerId];
}

export interface TaskResult {
  raw: ProviderRawResult;
  normalized: NormalizedResult;
  warnings: string[];
  validationErrors: Array<{ field: string; message: string }>;
  /** Routing Intelligence v1: decision metadata (when routing context provided) */
  routingDecision?: RoutingDecision;
  /** Cost Guardrail v1: budget decision metadata */
  costGuardrailDecision?: CostGuardrailDecision;
  /** Provider Learning Loop v1: learning metadata for step-meta */
  learningMeta?: {
    applied: boolean;
    confidence?: number;
    preferredProviders?: string[];
    avoidedProviders?: string[];
    reasonSummary?: string;
    baseOrder?: string[];
    finalOrder?: string[];
  };
}

/**
 * Executes a task through the adapter layer.
 *
 * 1. Resolves provider from route table
 * 2. Falls back if primary is unavailable
 * 3. Calls provider adapter
 * 4. Normalizes result
 * 5. Validates normalized result
 */
export async function executeTask(
  taskKind: TaskKind,
  prompt: string,
  options?: {
    system?: string;
    maxTokens?: number;
    forceProvider?: ProviderId;
    /** Routing Intelligence v1: provide scoreboard metrics for data-driven selection */
    routingContext?: RoutingContext;
    /** Cost Guardrail v1: budget constraints for the run */
    budgetContext?: BudgetContext;
    /** Cost Guardrail v1: accumulated cost from previous steps */
    accumulatedCost?: number;
    /** Provider Learning Loop v1: learned preferences for routing adjustment */
    learnedPreferences?: LearnedPreferences;
  }
): Promise<TaskResult> {
  const route = ROUTE_TABLE[taskKind];
  const expectedFormat = FORMAT_MAP[taskKind];

  // Resolve provider
  let providerId: ProviderId;
  let routingDecision: RoutingDecision | undefined;
  let costGuardrailDecision: CostGuardrailDecision | undefined;

  // Provider Learning Loop v1: metadata for step-meta
  let learningMeta: {
    applied: boolean;
    confidence?: number;
    preferredProviders?: string[];
    avoidedProviders?: string[];
    reasonSummary?: string;
    baseOrder?: string[];
    finalOrder?: string[];
  } | undefined;

  if (options?.forceProvider) {
    providerId = options.forceProvider;
  } else if (options?.routingContext) {
    // Routing Intelligence v1: data-driven provider selection
    routingDecision = selectProvider(taskKind, options.routingContext);

    // Provider Learning Loop v1: apply learned preference adjustments
    if (options.learnedPreferences) {
      const baseOrder = [routingDecision.provider, ...routingDecision.fallbacks];
      const baseScores = routingDecision.providerScores;

      const adjusted = applyLearnedPreferenceAdjustment(
        baseScores,
        taskKind,
        options.learnedPreferences
      );

      // Re-sort by adjusted score
      adjusted.sort((a, b) => b.score - a.score);

      const taskPrefs = getLearnedPreferences(options.learnedPreferences, taskKind);
      const { preferredProviders, avoidedProviders } = getPreferencesByCategory(
        options.learnedPreferences,
        taskKind
      );

      const hasAdjustment = adjusted.some((a) => a.adjustment !== 0);

      if (hasAdjustment) {
        // Update routing decision with learning-adjusted scores
        routingDecision = {
          ...routingDecision,
          provider: adjusted[0].provider,
          score: adjusted[0].score,
          fallbacks: adjusted.slice(1).map((a) => a.provider),
          providerScores: adjusted.map((a) => ({ provider: a.provider, score: a.score })),
        };

        const learningLog = buildProviderLearningLog(
          taskKind,
          taskPrefs,
          adjusted,
          baseScores
        );
        console.log(`[provider-learning] ${JSON.stringify(learningLog)}`);
      }

      // Build max confidence from task preferences
      const maxConfidence = taskPrefs.length > 0
        ? Math.max(...taskPrefs.map((p) => p.confidence))
        : 0;

      learningMeta = {
        applied: hasAdjustment,
        confidence: maxConfidence,
        preferredProviders,
        avoidedProviders,
        reasonSummary: taskPrefs.map((p) => p.reasonSummary).join(" | "),
        baseOrder,
        finalOrder: adjusted.map((a) => a.provider),
      };
    }

    // Cost Guardrail v1: budget-aware filtering (if budget context provided)
    if (options.budgetContext && (options.budgetContext.maxCostPerRun != null || options.budgetContext.maxCostPerStep?.[taskKind] != null)) {
      const allRanked = [routingDecision.provider, ...routingDecision.fallbacks];
      costGuardrailDecision = chooseBudgetAwareProvider({
        taskKind,
        rankedProviders: allRanked,
        metrics: options.routingContext.metrics,
        accumulatedCost: options.accumulatedCost ?? 0,
        budget: options.budgetContext,
      });

      const guardrailLog = buildCostGuardrailLog(taskKind, allRanked, costGuardrailDecision);
      console.log(`[cost-guardrail] ${JSON.stringify(guardrailLog)}`);

      if (costGuardrailDecision.result === "blocked") {
        throw new Error(
          `[cost-guardrail] Step blocked: ${costGuardrailDecision.reason}`
        );
      }

      // Use the guardrail-approved provider
      providerId = costGuardrailDecision.selectedProvider!;
    } else {
      // No budget constraints — use routing decision directly
      const candidate = adapters[routingDecision.provider];
      if (candidate.isAvailable()) {
        providerId = routingDecision.provider;
      } else {
        const available = routingDecision.fallbacks.find(
          (fb) => adapters[fb].isAvailable()
        );
        if (available) {
          console.log(
            `[task-router] Routed provider ${routingDecision.provider} unavailable for ${taskKind}, using fallback ${available}`
          );
          providerId = available;
        } else {
          throw new Error(
            `No available provider for taskKind=${taskKind} (routed=${routingDecision.provider}, fallbacks=${routingDecision.fallbacks.join(",")})`
          );
        }
      }
    }

    const log = buildRoutingLog(taskKind, routingDecision);
    console.log(`[routing-intelligence] ${JSON.stringify(log)}`);
  } else {
    // Static routing (original behavior)
    const primary = adapters[route.primary];
    if (primary.isAvailable()) {
      providerId = route.primary;
    } else if (route.fallback && adapters[route.fallback].isAvailable()) {
      console.log(
        `[task-router] ${route.primary} unavailable for ${taskKind}, falling back to ${route.fallback}`
      );
      providerId = route.fallback;
    } else {
      throw new Error(
        `No available provider for taskKind=${taskKind} (primary=${route.primary}, fallback=${route.fallback})`
      );
    }
  }

  let adapter = adapters[providerId];
  const system = options?.system ?? route.system;

  // Execute with fallback on retryable errors (429, 503)
  let raw: ProviderRawResult;
  let fallbackUsed = false;
  let fallbackFromProvider: ProviderId | undefined;
  try {
    raw = await adapter.generate({
      prompt,
      system,
      taskKind,
      maxTokens: options?.maxTokens,
    });
  } catch (err) {
    const isRetryable =
      err instanceof Error && /\b(429|503|RESOURCE_EXHAUSTED|quota)\b/i.test(err.message);
    const fallbackId = route.fallback;

    if (isRetryable && fallbackId && !options?.forceProvider && adapters[fallbackId].isAvailable()) {
      console.log(
        `[task-router] ${providerId} returned retryable error for ${taskKind}, falling back to ${fallbackId}`
      );
      fallbackFromProvider = providerId;
      providerId = fallbackId;
      adapter = adapters[fallbackId];
      fallbackUsed = true;
      raw = await adapter.generate({
        prompt,
        system,
        taskKind,
        maxTokens: options?.maxTokens,
      });
    } else {
      throw err;
    }
  }

  // Tag the result with fallback metadata
  if (fallbackUsed) {
    raw.fallbackUsed = true;
    raw.fallbackFromProvider = fallbackFromProvider;
  }

  // Normalize
  const normalized = normalizeResult(raw, expectedFormat);

  // Validate
  const validationErrors = validateNormalizedResult(normalized, expectedFormat);

  return {
    raw,
    normalized,
    warnings: normalized.warnings,
    validationErrors,
    routingDecision,
    costGuardrailDecision,
    learningMeta,
  };
}

// ── Introspection ───────────────────────────────────────────

export function listRoutes(): Array<{
  taskKind: TaskKind;
  primary: ProviderId;
  fallback: ProviderId | null;
  expectedFormat: ExpectedFormat;
}> {
  return (Object.keys(ROUTE_TABLE) as TaskKind[]).map((taskKind) => ({
    taskKind,
    primary: ROUTE_TABLE[taskKind].primary,
    fallback: ROUTE_TABLE[taskKind].fallback,
    expectedFormat: FORMAT_MAP[taskKind],
  }));
}
