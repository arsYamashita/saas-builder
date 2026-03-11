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

/**
 * Builds a JSON-serializable _meta object from a TaskResult.
 * Included in each AI route's response for the orchestrator to capture.
 */
export function buildStepMeta(
  taskKind: TaskKind,
  result: TaskResult
): GenerationStepMeta {
  return {
    taskKind,
    provider: result.raw.provider,
    model: result.raw.model,
    expectedFormat: TASK_EXPECTED_FORMAT[taskKind],
    durationMs: result.raw.durationMs,
    warningCount: result.warnings.length,
    errorCount: result.validationErrors.length,
    resultSummary: summarizeResult(result),
  };
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
