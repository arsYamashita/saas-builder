import { createAdminClient } from "@/lib/db/supabase/admin";
import type { ImplementationRunType } from "@/types/implementation-run";

export async function getLatestImplementationRun(
  projectId: string,
  runType: ImplementationRunType
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("implementation_runs")
    .select("*")
    .eq("project_id", projectId)
    .eq("run_type", runType)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to fetch implementation run: ${error.message}`);
  }

  return data ?? null;
}
