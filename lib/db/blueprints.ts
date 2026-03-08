import { createAdminClient } from "@/lib/db/supabase/admin";

export async function getLatestBlueprintByProjectId(projectId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("blueprints")
    .select("*")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Failed to fetch blueprint: ${error.message}`);
  }

  return data;
}
