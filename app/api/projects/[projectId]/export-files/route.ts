import { NextRequest, NextResponse } from "next/server";
import { getGeneratedFilesByProject } from "@/lib/db/generated-files";
import { isSafeRelativePath, normalizeExportPath } from "@/lib/utils/safe-path";
import { writeTextFile } from "@/lib/utils/write-file";
import { getProjectExportPath } from "@/lib/utils/project-export-path";
import { writeExportScaffold } from "@/lib/quality/write-export-scaffold";
import { requireProjectAccess } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

const EXPORTABLE_CATEGORIES = new Set([
  "migration",
  "api_route",
  "api_schema",
  "page",
  "component",
  "layout",
  "type",
  "test",
  "config",
  "schema",
]);

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(projectId);
    const files = await getGeneratedFilesByProject(projectId);

    const latestByPath = new Map<string, any>();

    for (const file of files) {
      if (!EXPORTABLE_CATEGORIES.has(file.file_category)) continue;
      if (!isSafeRelativePath(file.file_path)) continue;

      const existing = latestByPath.get(file.file_path);
      if (!existing || existing.version < file.version) {
        latestByPath.set(file.file_path, file);
      }
    }

    const projectDir = getProjectExportPath(projectId);

    await writeExportScaffold(projectDir, projectId);

    const written: Array<{ filePath: string }> = [];

    for (const [, file] of Array.from(latestByPath.entries())) {
      const fullPath = normalizeExportPath(projectId, file.file_path);
      await writeTextFile(fullPath, file.content_text);
      written.push({ filePath: file.file_path });
    }

    return NextResponse.json({
      projectId,
      exportedCount: written.length,
      files: written,
      exportRoot: `exports/projects/${projectId}`,
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
      {
        error: "Failed to export files",
        details: message,
      },
      { status: 500 }
    );
  }
}
