import { NextRequest, NextResponse } from "next/server";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { requireCurrentUser } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

function buildMigrationFilePath(projectId: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);

  return `supabase/migrations/${timestamp}_${projectId.slice(0, 8)}_generated_schema.sql`;
}

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    await requireCurrentUser();
    const { projectId } = await params;

    const latestSchemaRun = await getLatestImplementationRun(
      projectId,
      "schema_sql"
    );
    const latestBlueprint = await getLatestBlueprintByProjectId(projectId);

    const saved = await saveGeneratedFile({
      projectId,
      blueprintId: latestBlueprint.id,
      sourceRunId: latestSchemaRun.id,
      fileCategory: "migration",
      filePath: buildMigrationFilePath(projectId),
      language: "sql",
      title: "Generated schema migration",
      description:
        "Auto-saved migration candidate from latest schema_sql run",
      contentText: latestSchemaRun.output_text,
      source: "claude",
    });

    return NextResponse.json({ file: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    return NextResponse.json(
      { error: "Failed to save schema migration", details: message },
      { status: 500 }
    );
  }
}
