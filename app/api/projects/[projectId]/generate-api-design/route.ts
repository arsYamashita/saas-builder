import { NextRequest, NextResponse } from "next/server";
import { readPrompt } from "@/lib/utils/read-prompt";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveImplementationRun } from "@/lib/db/implementation-runs";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { runClaudeApi } from "@/lib/ai/claude-api";

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
    const promptTemplate = await readPrompt("final/03-api-final.md");

    const result = await runClaudeApi({
      schemaSql: schemaRun.output_text,
      blueprintJson,
      promptTemplate,
    });

    const saved = await saveImplementationRun({
      projectId,
      blueprintId: blueprint.id,
      runType: "api_design",
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
      { error: "Failed to generate API design", details: message },
      { status: 500 }
    );
  }
}
