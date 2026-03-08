import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveImplementationRun } from "@/lib/db/implementation-runs";
import { runClaudeSchema } from "@/lib/ai/claude-schema";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { resolveFinalPromptPath } from "@/lib/ai/template-prompt-resolver";

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

    const blueprint = await getLatestBlueprintByProjectId(projectId);
    const blueprintJson = buildBlueprintJsonForClaude(blueprint);
    const promptPath = resolveFinalPromptPath(templateKey, "schema");
    const promptTemplate = await readPrompt(promptPath);

    const result = await runClaudeSchema({
      blueprintJson,
      promptTemplate,
    });

    const saved = await saveImplementationRun({
      projectId,
      blueprintId: blueprint.id,
      runType: "schema_sql",
      promptText: result.rawPrompt,
      outputText: result.outputText,
    });

    return NextResponse.json({
      implementationRun: saved,
      outputText: result.outputText,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      { error: "Failed to generate schema", details: message },
      { status: 500 }
    );
  }
}
