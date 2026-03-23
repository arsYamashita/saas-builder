import { NextRequest, NextResponse } from "next/server";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { requireCurrentUser } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    await requireCurrentUser();
    const { projectId } = await params;

    const latestApiRun = await getLatestImplementationRun(
      projectId,
      "api_design"
    );
    const latestBlueprint = await getLatestBlueprintByProjectId(projectId);

    const saved = await saveGeneratedFile({
      projectId,
      blueprintId: latestBlueprint.id,
      sourceRunId: latestApiRun.id,
      fileCategory: "api_schema",
      filePath: `docs/generated/${projectId.slice(0, 8)}_api_design.md`,
      language: "markdown",
      title: "Generated API design",
      description:
        "API route design generated from latest blueprint and schema",
      contentText: latestApiRun.output_text,
      source: "claude",
    });

    return NextResponse.json({ file: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      { error: "Failed to save API design file", details: message },
      { status: 500 }
    );
  }
}
