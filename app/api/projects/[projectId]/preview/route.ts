import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  assemblePreview,
  assembleWireframePreview,
} from "@/lib/projects/preview-assembler";

type Props = {
  params: Promise<{ projectId: string }>;
};

/**
 * GET /api/projects/[projectId]/preview?route=/&darkMode=false&width=1280
 *
 * Returns assembled HTML for iframe preview.
 * If generated files exist → full React preview
 * If only blueprint exists → wireframe preview
 */
export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(req.url);

    const selectedRoute = searchParams.get("route") || undefined;
    const darkMode = searchParams.get("darkMode") === "true";
    const deviceWidth = parseInt(searchParams.get("width") || "1280", 10);

    const supabase = createAdminClient();

    // 1. Fetch generated files
    const { data: generatedFiles } = await supabase
      .from("generated_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const files = generatedFiles ?? [];

    // 2. If files exist, assemble full preview
    if (files.length > 0) {
      const bundle = assemblePreview(files, {
        selectedRoute,
        darkMode,
        deviceWidth,
      });

      return new NextResponse(bundle.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Preview-Routes": JSON.stringify(bundle.routes),
          "X-Preview-File-Count": String(bundle.fileCount),
          "Cache-Control": "no-store",
        },
      });
    }

    // 3. Fallback: wireframe from blueprint
    const { data: blueprints } = await supabase
      .from("blueprints")
      .select("*")
      .eq("project_id", projectId)
      .order("version", { ascending: false })
      .limit(1);

    if (blueprints && blueprints.length > 0) {
      const bp = blueprints[0];
      const bundle = assembleWireframePreview({
        screens_json: bp.screens_json,
        prd_json: bp.prd_json,
        entities_json: bp.entities_json,
      });

      return new NextResponse(bundle.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Preview-Routes": JSON.stringify(bundle.routes),
          "X-Preview-File-Count": "0",
          "X-Preview-Mode": "wireframe",
          "Cache-Control": "no-store",
        },
      });
    }

    // 4. No data at all
    const emptyHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8" /><title>Preview</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-gray-50 flex items-center justify-center min-h-screen">
  <div class="text-center text-gray-400">
    <p class="text-6xl mb-4">🚀</p>
    <p class="text-xl font-medium">まだ何もありません</p>
    <p class="text-sm mt-2">Blueprint を生成するとワイヤーフレームが表示されます</p>
  </div>
</body></html>`;

    return new NextResponse(emptyHtml, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Preview-Mode": "empty",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown preview error";
    return NextResponse.json(
      { error: "Failed to build preview", details: message },
      { status: 500 }
    );
  }
}
