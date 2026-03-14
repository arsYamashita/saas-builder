/**
 * Step Metadata Builder
 *
 * Builds a compact metadata object from a TaskResult for inclusion
 * in API route responses. The orchestrator captures this and stores
 * it in generation_run.steps_json.
 */

import type { TaskResult } from "./task-router";
import type { TaskKind } from "./provider-interface";
import { TASK_EXPECTED_FORMAT } from "./provider-interface";
import type { GenerationStepMeta } from "@/types/generation-run";
import { estimateCostUsd } from "./provider-pricing";
import type { RoutingDecision } from "./provider-router";
import type { CostGuardrailDecision } from "./cost-guardrail";
import type { LearnedProviderPreference } from "./provider-learning";

/**
 * Builds a JSON-serializable _meta object from a TaskResult.
 * Included in each AI route's response for the orchestrator to capture.
 */
export function buildStepMeta(
  taskKind: TaskKind,
  result: TaskResult,
  routingDecision?: RoutingDecision,
  costGuardrailDecision?: CostGuardrailDecision,
  learningContext?: {
    applied: boolean;
    confidence?: number;
    preferredProviders?: string[];
    avoidedProviders?: string[];
    reasonSummary?: string;
    baseOrder?: string[];
    finalOrder?: string[];
  }
): GenerationStepMeta {
  const meta: GenerationStepMeta = {
    taskKind,
    provider: result.raw.provider,
    model: result.raw.model,
    expectedFormat: TASK_EXPECTED_FORMAT[taskKind],
    durationMs: result.raw.durationMs,
    warningCount: result.warnings.length,
    errorCount: result.validationErrors.length,
    resultSummary: summarizeResult(result),
  };
  // Token usage
  if (result.raw.inputTokens != null) {
    meta.inputTokens = result.raw.inputTokens;
    meta.outputTokens = result.raw.outputTokens;
    meta.totalTokens = result.raw.totalTokens;

    // Cost estimation
    if (result.raw.outputTokens != null) {
      const cost = estimateCostUsd(
        result.raw.model,
        result.raw.inputTokens,
        result.raw.outputTokens
      );
      if (cost != null) meta.estimatedCostUsd = cost;
    }
  }

  // Routing Intelligence v1.1
  if (routingDecision) {
    meta.routingScore = routingDecision.score;
    meta.routingBaseScore = routingDecision.baseScore;
    meta.routingRecentScore = routingDecision.recentScore;
    meta.routingMetricsWindow = routingDecision.metricsWindow;
    meta.routingFallbacks = routingDecision.fallbacks;
  }

  // Cost Guardrail v1
  if (costGuardrailDecision) {
    meta.costGuardrailResult = costGuardrailDecision.result;
    if (costGuardrailDecision.rejectedProvidersDueToBudget.length > 0) {
      meta.budgetRejectedProviders = costGuardrailDecision.rejectedProvidersDueToBudget;
    }
    if (costGuardrailDecision.costDowngradedFromProvider) {
      meta.costDowngradedFromProvider = costGuardrailDecision.costDowngradedFromProvider;
      meta.costDowngradedToProvider = costGuardrailDecision.costDowngradedToProvider;
    }
    if (costGuardrailDecision.projectedStepCost != null) {
      meta.projectedStepCost = costGuardrailDecision.projectedStepCost;
    }
    meta.accumulatedEstimatedCost = costGuardrailDecision.accumulatedEstimatedCost;
  }

  // Provider Learning Loop v1
  if (learningContext?.applied) {
    meta.learningApplied = true;
    if (learningContext.confidence != null) {
      meta.learningConfidence = learningContext.confidence;
    }
    if (learningContext.preferredProviders && learningContext.preferredProviders.length > 0) {
      meta.learningPreferredProviders = learningContext.preferredProviders;
    }
    if (learningContext.avoidedProviders && learningContext.avoidedProviders.length > 0) {
      meta.learningAvoidedProviders = learningContext.avoidedProviders;
    }
    if (learningContext.reasonSummary) {
      meta.learningReasonSummary = learningContext.reasonSummary;
    }
    if (learningContext.baseOrder) {
      meta.routingBaseOrder = learningContext.baseOrder;
    }
    if (learningContext.finalOrder) {
      meta.routingFinalOrder = learningContext.finalOrder;
    }
  }

  // Fallback info
  if (result.raw.fallbackUsed) {
    meta.fallbackUsed = true;
    meta.fallbackFromProvider = result.raw.fallbackFromProvider;
    meta.fallbackReason = result.raw.fallbackReason;
  }
  return meta;
}

/**
 * Merges multiple step metas (e.g. intake + blueprint for generate-blueprint).
 */
export function mergeStepMetas(metas: GenerationStepMeta[]): GenerationStepMeta {
  if (metas.length === 0) return {};
  if (metas.length === 1) return metas[0];

  const totalDuration = metas.reduce((sum, m) => sum + (m.durationMs ?? 0), 0);
  const totalWarnings = metas.reduce((sum, m) => sum + (m.warningCount ?? 0), 0);
  const totalErrors = metas.reduce((sum, m) => sum + (m.errorCount ?? 0), 0);

  // Use the last step's provider/model as primary
  const last = metas[metas.length - 1];
  const providerSet = new Set(metas.map((m) => m.provider).filter(Boolean));
  const providers = Array.from(providerSet);

  return {
    taskKind: metas.map((m) => m.taskKind).filter(Boolean).join("+"),
    provider: providers.length === 1 ? providers[0] : providers.join("+"),
    model: last.model,
    expectedFormat: last.expectedFormat,
    durationMs: totalDuration,
    warningCount: totalWarnings,
    errorCount: totalErrors,
    resultSummary: metas.map((m) => m.resultSummary).filter(Boolean).join(" | "),
  };
}

function summarizeResult(result: TaskResult): string {
  const n = result.normalized;
  switch (n.format) {
    case "text": {
      const preview = n.text.slice(0, 200);
      const suffix = n.text.length > 200 ? "..." : "";
      return `text(${n.text.length} chars): ${preview}${suffix}`;
    }
    case "json": {
      if (n.data && typeof n.data === "object") {
        const keys = Object.keys(n.data as Record<string, unknown>);
        return `json(${keys.length} keys): [${keys.slice(0, 8).join(", ")}]`;
      }
      if (Array.isArray(n.data)) {
        return `json(array, ${(n.data as unknown[]).length} items)`;
      }
      return "json(value)";
    }
    case "files": {
      const count = n.files.length;
      const preview = n.files.slice(0, 3).map((f) => f.file_path).join(", ");
      const suffix = count > 3 ? `, ... +${count - 3} more` : "";
      return `files(${count}): ${preview}${suffix}`;
    }
  }
}
