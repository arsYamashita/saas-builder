import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveImplementationRun } from "@/lib/db/implementation-runs";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { executeTask } from "@/lib/providers/task-router";
import { buildStepMeta } from "@/lib/providers/step-meta";
import { resolveFinalPromptPath } from "@/lib/ai/template-prompt-resolver";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { serverErrorResponse } from "@/lib/api/errors";
import { rateLimit } from "@/lib/rate-limit";
import { isInternalPipelineRequest } from "@/lib/pipeline-internal";

type Props = {
  params: Promise<{ projectId: string }>;
};

function buildBlueprintJsonForClaude(blueprint: Record<string, unknown>) {
  return JSON.stringify(
    {
      product_summary: blueprint.prd_json,
      entities: blueprint.entities_json,
      screens: blueprint.screens_json,
      roles: blueprint.roles_json,
      permissions: blueprint.permissions_json,
      billing: blueprint.billing_json,
      affiliate: blueprint.affiliate_json,
    },
    null,
    2
  );
}

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const { user, project } = await requireProjectAccess(projectId);

    // Internal generate-template pipeline steps skip the per-step limit —
    // the pipeline is rate-limited once at its own entry point and must run
    // atomically without a mid-run 429. See lib/pipeline-internal.ts.
    if (!isInternalPipelineRequest(req)) {
      const allowed = await rateLimit(`generate:${user.id}`, 5, 60_000);
      if (!allowed) {
        return NextResponse.json(
          { error: "生成リクエストが多すぎます。しばらく待ってから再試行してください。" },
          { status: 429 }
        );
      }
    }

    const templateKey = project?.template_key ?? "membership_content_affiliate";

    const blueprint = await getLatestBlueprintByProjectId(projectId);

    // API Design depends on Schema run
    const schemaRun = await getLatestImplementationRun(
      projectId,
      "schema_sql"
    );

    if (!schemaRun) {
      return NextResponse.json(
        {
          error:
            "Schema run not found. Please generate schema first before API design.",
        },
        { status: 400 }
      );
    }

    const blueprintJson = buildBlueprintJsonForClaude(blueprint);
    const promptPath = resolveFinalPromptPath(templateKey, "api");
    const promptTemplate = await readPrompt(promptPath);

    const prompt = promptTemplate
      .replace("{{schema_sql}}", schemaRun.output_text)
      .replace("{{blueprint_json}}", blueprintJson);

    const result = await executeTask("api_design", prompt);

    const outputText =
      result.normalized.format === "text"
        ? result.normalized.text
        : result.raw.text;

    const saved = await saveImplementationRun({
      projectId,
      blueprintId: blueprint.id,
      runType: "api_design",
      promptText: prompt,
      outputText,
      source: result.raw.provider,
    });

    return NextResponse.json({
      implementationRun: saved,
      outputText,
      _meta: buildStepMeta("api_design", result),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return serverErrorResponse("projects/generate-api-design", error, {
      message: "Failed to generate API design",
    });
  }
}
