import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { executeTask } from "@/lib/providers/task-router";
import { buildStepMeta } from "@/lib/providers/step-meta";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { resolveFinalPromptPath } from "@/lib/ai/template-prompt-resolver";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const supabase = createAdminClient();
    const { data: project } = await supabase
      .from("projects")
      .select("template_key")
      .eq("id", projectId)
      .single();
    const templateKey = project?.template_key ?? "membership_content_affiliate";

    const latestRun = await getLatestImplementationRun(
      projectId,
      "implementation_plan"
    );
    const latestBlueprint = await getLatestBlueprintByProjectId(projectId);
    const promptPath = resolveFinalPromptPath(templateKey, "file_split");
    const promptTemplate = await readPrompt(promptPath);

    const prompt = promptTemplate.replace(
      "{{implementation_output}}",
      latestRun.output_text
    );

    const result = await executeTask("file_split", prompt);

    // Extract files from normalized result
    let files: Array<{
      file_category: string;
      file_path: string;
      language: string;
      title?: string;
      description?: string;
      content_text: string;
    }>;

    if (result.normalized.format === "files") {
      files = result.normalized.files;
    } else {
      // Fallback: try to parse raw text as JSON array
      try {
        const parsed = JSON.parse(result.raw.text.replace(/^```json\s*/i, "").replace(/\s*```$/i, ""));
        files = Array.isArray(parsed) ? parsed : [];
      } catch {
        throw new Error("Failed to parse file splitter output as files");
      }
    }

    const savedFiles = [];

    for (const file of files) {
      if (!file.file_path || !file.content_text || !file.file_category) {
        continue;
      }

      const saved = await saveGeneratedFile({
        projectId,
        blueprintId: latestBlueprint.id,
        sourceRunId: latestRun.id,
        fileCategory: file.file_category as import("@/types/generated-file").GeneratedFileCategory,
        filePath: file.file_path,
        language: file.language || "text",
        title: file.title,
        description: file.description,
        contentText: file.content_text,
        source: result.raw.provider,
      });

      savedFiles.push(saved);
    }

    return NextResponse.json({
      run: latestRun,
      savedFiles,
      _meta: buildStepMeta("file_split", result),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      {
        error: "Failed to split implementation run into files",
        details: message,
      },
      { status: 500 }
    );
  }
}
