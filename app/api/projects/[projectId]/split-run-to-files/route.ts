import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { runClaudeFileSplitter } from "@/lib/ai/claude-file-splitter";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
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

    const splitResult = await runClaudeFileSplitter({
      implementationOutput: latestRun.output_text,
      promptTemplate,
    });

    const savedFiles = [];

    for (const file of splitResult.files) {
      if (!file.file_path || !file.content_text || !file.file_category) {
        continue;
      }

      const saved = await saveGeneratedFile({
        projectId,
        blueprintId: latestBlueprint.id,
        sourceRunId: latestRun.id,
        fileCategory: file.file_category as any,
        filePath: file.file_path,
        language: file.language || "text",
        title: file.title,
        description: file.description,
        contentText: file.content_text,
        source: "claude",
      });

      savedFiles.push(saved);
    }

    return NextResponse.json({
      run: latestRun,
      savedFiles,
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
