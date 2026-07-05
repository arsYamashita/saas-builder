import { NextRequest, NextResponse } from "next/server";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { parseJsonBody } from "@/lib/api/errors";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(projectId);
    const parsedBody = await parseJsonBody<{
      filePath?: string;
      contentText?: string;
      fileCategory?: Parameters<typeof saveGeneratedFile>[0]["fileCategory"];
      language?: string;
      title?: string;
      description?: string;
    }>(req);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.data;

    const latestBlueprint = await getLatestBlueprintByProjectId(projectId);

    if (!body.filePath || !body.contentText || !body.fileCategory) {
      return NextResponse.json(
        { error: "filePath, contentText, fileCategory are required" },
        { status: 400 }
      );
    }

    const saved = await saveGeneratedFile({
      projectId,
      blueprintId: latestBlueprint.id,
      fileCategory: body.fileCategory,
      filePath: body.filePath,
      language: body.language || "tsx",
      title: body.title,
      description: body.description,
      contentText: body.contentText,
      source: "lovable",
    });

    return NextResponse.json({ file: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    if (message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (message === "Not found") return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json(
      { error: "Failed to save UI file" },
      { status: 500 }
    );
  }
}
