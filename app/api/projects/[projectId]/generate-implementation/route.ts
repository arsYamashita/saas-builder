import { NextRequest, NextResponse } from "next/server";
import { buildPromptWithRules } from "@/lib/ai/build-prompt-with-rules";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveImplementationRun } from "@/lib/db/implementation-runs";
import { executeTask } from "@/lib/providers/task-router";
import { buildStepMeta } from "@/lib/providers/step-meta";
import { resolveTemplatePrefixPath } from "@/lib/ai/template-prompt-resolver";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { aiRatelimit, checkRateLimit, getIp, rateLimitResponse } from "@/lib/ratelimit";

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
    const ip = getIp(req)
    const rl = await checkRateLimit(aiRatelimit, ip)
    if (rl && !rl.success) {
      return rateLimitResponse(rl.limit, rl.remaining, rl.reset)
    }

    const { projectId } = await params;
    const { project } = await requireProjectAccess(projectId);
    const templateKey = project?.template_key ?? "membership_content_affiliate";

    const blueprint = await getLatestBlueprintByProjectId(projectId);
    const blueprintJson = buildBlueprintJsonForClaude(blueprint);
    const prefixPath = resolveTemplatePrefixPath(templateKey);
    const promptTemplate = await buildPromptWithRules(
      prefixPath,
      "04-claude-implementation.md",
      { blueprint_normalized_json: blueprintJson }
    );

    // The prompt template already has blueprint_normalized_json replaced.
    // For implementation, the full assembled prompt IS the prompt to send.
    const prompt = promptTemplate;

    const result = await executeTask("implementation", prompt);

    const outputText =
      result.normalized.format === "text"
        ? result.normalized.text
        : result.raw.text;

    const saved = await saveImplementationRun({
      projectId,
      blueprintId: blueprint.id,
      runType: "implementation_plan",
      promptText: prompt,
      outputText,
      source: result.raw.provider,
    });

    return NextResponse.json({
      implementationRun: saved,
      outputText,
      _meta: buildStepMeta("implementation", result),
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
    return NextResponse.json(
      { error: "Failed to generate implementation plan", details: message },
      { status: 500 }
    );
  }
}
