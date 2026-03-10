/**
 * Helper for generation run progress display.
 */

export interface StepProgress {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface GenerationProgress {
  runId: string;
  overallStatus: string;
  currentStep: string | null;
  steps: StepProgress[];
  errorMessage: string | null;
  isActive: boolean;
  completedCount: number;
  totalCount: number;
}

const STEP_LABELS: Record<string, string> = {
  blueprint: "Blueprint",
  implementation: "Implementation",
  schema: "Schema",
  api_design: "API Design",
  split_files: "File Split",
  export_files: "Export",
};

export function toGenerationProgress(run: {
  id: string;
  status: string;
  current_step?: string | null;
  steps_json: Array<{ key: string; label: string; status: string }>;
  error_message?: string | null;
}): GenerationProgress {
  const steps: StepProgress[] = (run.steps_json ?? []).map((s) => ({
    key: s.key,
    label: STEP_LABELS[s.key] ?? s.label ?? s.key,
    status: normalizeStatus(s.status),
  }));

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const isActive = run.status === "running" || run.status === "pending";

  return {
    runId: run.id,
    overallStatus: run.status,
    currentStep: run.current_step ?? null,
    steps,
    errorMessage: run.error_message ?? null,
    isActive,
    completedCount,
    totalCount: steps.length,
  };
}

function normalizeStatus(
  s: string
): "pending" | "running" | "completed" | "failed" {
  if (s === "completed") return "completed";
  if (s === "running") return "running";
  if (s === "failed") return "failed";
  return "pending";
}
