import { createAdminClient } from "@/lib/db/supabase/admin";
import { QualityCheck, QualityCheckKey } from "@/types/quality-run";

const DEFAULT_CHECKS: QualityCheck[] = [
  { key: "lint", label: "ESLint", status: "pending" },
  { key: "typecheck", label: "TypeScript Check", status: "pending" },
  { key: "playwright", label: "Playwright E2E", status: "pending" },
];

export async function createQualityRun(
  projectId: string,
  generationRunId?: string | null
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("quality_runs")
    .insert({
      project_id: projectId,
      generation_run_id: generationRunId ?? null,
      status: "running",
      checks_json: DEFAULT_CHECKS,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create quality run: ${error.message}`);
  }

  return data;
}

export async function updateQualityStep(
  qualityRunId: string,
  checkKey: QualityCheckKey,
  status: QualityCheck["status"],
  output?: string
) {
  const supabase = createAdminClient();

  const { data: run, error: fetchError } = await supabase
    .from("quality_runs")
    .select("*")
    .eq("id", qualityRunId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch quality run: ${fetchError.message}`);
  }

  const checks = (run.checks_json as QualityCheck[]).map((check) =>
    check.key === checkKey
      ? {
          ...check,
          status,
          ...(output !== undefined
            ? { stdout: output.slice(0, 50_000) }
            : {}),
        }
      : check
  );

  const { error: updateError } = await supabase
    .from("quality_runs")
    .update({ checks_json: checks })
    .eq("id", qualityRunId);

  if (updateError) {
    throw new Error(
      `Failed to update quality step: ${updateError.message}`
    );
  }
}

export async function finishQualityRun(
  qualityRunId: string,
  status: "passed" | "failed" | "error"
) {
  const supabase = createAdminClient();

  const { data: run } = await supabase
    .from("quality_runs")
    .select("checks_json")
    .eq("id", qualityRunId)
    .single();

  const checks = (run?.checks_json as QualityCheck[]) ?? [];
  const passedCount = checks.filter((c) => c.status === "passed").length;
  const failedCount = checks.filter((c) => c.status === "failed").length;
  const summary = `${passedCount} passed, ${failedCount} failed out of ${checks.length} checks`;

  const { error } = await supabase
    .from("quality_runs")
    .update({
      status,
      summary,
      finished_at: new Date().toISOString(),
    })
    .eq("id", qualityRunId);

  if (error) {
    throw new Error(
      `Failed to finish quality run: ${error.message}`
    );
  }
}
