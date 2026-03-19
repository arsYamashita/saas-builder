import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  generateSetupGuide,
  generateEnvExample,
} from "@/lib/projects/setup-guide-template";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const supabase = createAdminClient();

    // Fetch project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, name, template_key")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    // Fetch generated files
    const { data: files, error: filesError } = await supabase
      .from("generated_files")
      .select("file_path, content_text")
      .eq("project_id", projectId)
      .eq("status", "generated")
      .order("file_path", { ascending: true });

    if (filesError) {
      return NextResponse.json(
        { error: "Failed to fetch generated files" },
        { status: 500 },
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No generated files found. Please run generation first." },
        { status: 404 },
      );
    }

    // Deduplicate: keep latest version per file_path
    const fileMap = new Map<string, string>();
    for (const f of files) {
      fileMap.set(f.file_path, f.content_text);
    }

    // Build ZIP using streaming approach (no JSZip dependency)
    // Use a simple tar-like concatenation approach with proper ZIP format
    const { buildZipBuffer } = await import("@/lib/projects/zip-builder");

    const entries: Array<{ path: string; content: string }> = [];

    // Add generated files
    for (const [path, content] of Array.from(fileMap.entries())) {
      entries.push({ path, content });
    }

    // Add setup guide
    entries.push({
      path: "SETUP_GUIDE.md",
      content: generateSetupGuide(project.name, project.template_key),
    });

    // Add .env.example
    entries.push({
      path: ".env.example",
      content: generateEnvExample(project.template_key),
    });

    const zipBuffer = buildZipBuffer(entries);
    const safeName = project.name
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"`,
        "Content-Length": String(zipBuffer.byteLength),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      { error: "Failed to create download", details: message },
      { status: 500 },
    );
  }
}
