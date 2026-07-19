import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { executeTask } from "@/lib/providers/task-router";
import { buildStepMeta } from "@/lib/providers/step-meta";
import { resolveFinalPromptPath } from "@/lib/ai/template-prompt-resolver";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { isInternalPipelineRequest } from "@/lib/pipeline-internal";
import { MAX_LLM_INPUT_CHARS } from "@/lib/validation/llm-input-limits";

type Props = {
  params: Promise<{ projectId: string }>;
};

/**
 * Defense-in-depth cap on the prior implementation run's output_text
 * before it's interpolated into the file-split prompt. This route takes
 * no request body of its own (its "input" is a previously-saved LLM
 * output, already bounded by that step's own `max_tokens`, e.g. 32768 in
 * lib/providers/claude.ts) — so this isn't closing a distinct
 * attacker-controlled surface the way lib/validation/document-analysis.ts's
 * diffRequestSchema caps do. It exists so a future change to how
 * output_text is produced (or a corrupted/oversized DB row) can't silently
 * balloon this step's own LLM cost. See [[llm_api_unbounded_text_input]].
 */
function truncateForFileSplitPrompt(text: string, maxChars = MAX_LLM_INPUT_CHARS): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + `\n\n... (truncated, ${text.length} chars total, showing first ${maxChars})`;
}

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const { user, project } = await requireProjectAccess(projectId);
    const templateKey = project.template_key ?? "membership_content_affiliate";

    // This route is one step of the generate-template pipeline (see
    // app/api/projects/[projectId]/generate-template/route.ts's "Step 5:
    // Split Files") and calls executeTask() -> Claude directly, same as
    // its sibling pipeline-step routes (generate-schema,
    // generate-blueprint, generate-api-design, generate-implementation) —
    // it had NO rate-limit wiring at all until this fix. Internal
    // pipeline calls skip the per-step limit (the pipeline is
    // rate-limited once at its own entry point and must run atomically
    // without a mid-run 429); everything else goes through the shared
    // `generate` bucket. See lib/pipeline-internal.ts,
    // [[saas_builder_ai_endpoint_no_rate_limit]], SECURITY_CHECKLIST.md
    // item 3.
    if (!isInternalPipelineRequest(req)) {
      const allowed = await rateLimit(`generate:${user.id}`, 5, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: "生成リクエストが多すぎます。しばらく待ってから再試行してください。" },
          { status: 429 }
        );
      }
    }

    const latestRun = await getLatestImplementationRun(
      projectId,
      "implementation_plan"
    );
    const latestBlueprint = await getLatestBlueprintByProjectId(projectId);
    const promptPath = resolveFinalPromptPath(templateKey, "file_split");
    const promptTemplate = await readPrompt(promptPath);

    const prompt = promptTemplate.replace(
      "{{implementation_output}}",
      truncateForFileSplitPrompt(latestRun.output_text)
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
    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (message === "Not found") return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(
      { error: "Failed to split implementation run into files" },
      { status: 500 }
    );
  }
}
