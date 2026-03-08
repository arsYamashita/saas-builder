import { createAdminClient } from "@/lib/db/supabase/admin";
import type { ImplementationRunType } from "@/types/implementation-run";

type SaveImplementationRunInput = {
  projectId: string;
  blueprintId: string;
  runType: ImplementationRunType;
  promptText: string;
  outputText: string;
  outputJson?: unknown;
};

export async function saveImplementationRun({
  projectId,
  blueprintId,
  runType,
  promptText,
  outputText,
  outputJson,
}: SaveImplementationRunInput) {
  const supabase = createAdminClient();

  // Get current max version for this project + runType
  const { data: existing } = await supabase
    .from("implementation_runs")
    .select("version")
    .eq("project_id", projectId)
    .eq("run_type", runType)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = existing ? existing.version + 1 : 1;

  const { data, error } = await supabase
    .from("implementation_runs")
    .insert({
      project_id: projectId,
      blueprint_id: blueprintId,
      run_type: runType,
      version: nextVersion,
      status: "completed",
      prompt_text: promptText,
      output_text: outputText,
      output_json: outputJson ?? null,
      source: "claude",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save implementation run: ${error.message}`);
  }

  return data;
}
