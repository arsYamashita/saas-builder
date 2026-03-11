import { createAdminClient } from "@/lib/db/supabase/admin";
import { GeneratedFileCategory } from "@/types/generated-file";

type SaveGeneratedFileArgs = {
  projectId: string;
  blueprintId?: string | null;
  sourceRunId?: string | null;
  fileCategory: GeneratedFileCategory;
  filePath: string;
  language: string;
  title?: string;
  description?: string;
  contentText: string;
  contentJson?: unknown;
  source: string;
};

export async function saveGeneratedFile({
  projectId,
  blueprintId,
  sourceRunId,
  fileCategory,
  filePath,
  language,
  title,
  description,
  contentText,
  contentJson,
  source,
}: SaveGeneratedFileArgs) {
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("generated_files")
    .select("version")
    .eq("project_id", projectId)
    .eq("file_path", filePath)
    .order("version", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(
      `Failed to check existing generated files: ${existingError.message}`
    );
  }

  const nextVersion =
    existing && existing.length > 0 ? existing[0].version + 1 : 1;

  const { data, error } = await supabase
    .from("generated_files")
    .insert({
      project_id: projectId,
      blueprint_id: blueprintId ?? null,
      source_run_id: sourceRunId ?? null,
      file_category: fileCategory,
      file_path: filePath,
      language,
      status: "generated",
      title: title ?? null,
      description: description ?? null,
      content_text: contentText,
      content_json: contentJson ?? null,
      version: nextVersion,
      source,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save generated file: ${error.message}`);
  }

  return data;
}

export async function getGeneratedFilesByProject(projectId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("generated_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch generated files: ${error.message}`);
  }

  return data;
}
