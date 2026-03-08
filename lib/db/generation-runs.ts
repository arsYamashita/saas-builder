import { createAdminClient } from "@/lib/db/supabase/admin";
import { GenerationStep } from "@/types/generation-run";

export async function createGenerationRun(
  projectId: string,
  templateKey: string
) {
  const supabase = createAdminClient();

  const defaultSteps: GenerationStep[] = [
    { key: "blueprint", label: "Generate Blueprint", status: "pending" },
    {
      key: "implementation",
      label: "Generate Implementation",
      status: "pending",
    },
    { key: "schema", label: "Generate Schema", status: "pending" },
    { key: "api_design", label: "Generate API Design", status: "pending" },
    { key: "split_files", label: "Split To Files", status: "pending" },
    { key: "export_files", label: "Export Files", status: "pending" },
  ];

  const { data, error } = await supabase
    .from("generation_runs")
    .insert({
      project_id: projectId,
      template_key: templateKey,
      status: "running",
      current_step: "blueprint",
      steps_json: defaultSteps,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create generation run: ${error.message}`);
  }

  return data;
}

export async function updateGenerationStep(
  generationRunId: string,
  stepKey: GenerationStep["key"],
  status: GenerationStep["status"]
) {
  const supabase = createAdminClient();

  const { data: run, error: fetchError } = await supabase
    .from("generation_runs")
    .select("*")
    .eq("id", generationRunId)
    .single();

  if (fetchError) {
    throw new Error(
      `Failed to fetch generation run: ${fetchError.message}`
    );
  }

  const steps = (run.steps_json as GenerationStep[]).map((step) =>
    step.key === stepKey ? { ...step, status } : step
  );

  const { error: updateError } = await supabase
    .from("generation_runs")
    .update({
      steps_json: steps,
      current_step: stepKey,
    })
    .eq("id", generationRunId);

  if (updateError) {
    throw new Error(
      `Failed to update generation step: ${updateError.message}`
    );
  }
}

export async function completeGenerationRun(generationRunId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("generation_runs")
    .update({
      status: "completed",
      finished_at: new Date().toISOString(),
      current_step: null,
    })
    .eq("id", generationRunId);

  if (error) {
    throw new Error(
      `Failed to complete generation run: ${error.message}`
    );
  }
}

export async function failGenerationRun(
  generationRunId: string,
  errorMessage: string
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("generation_runs")
    .update({
      status: "failed",
      error_message: errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", generationRunId);

  if (error) {
    throw new Error(`Failed to fail generation run: ${error.message}`);
  }
}

export async function getLatestGenerationRun(projectId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("generation_runs")
    .select("*")
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to fetch latest generation run: ${error.message}`
    );
  }

  return data;
}
