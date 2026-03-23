import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireProjectAccess } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { projectId } = await params;
    const { project } = await requireProjectAccess(projectId);
    const supabase = createAdminClient();

    const [
      { data: blueprints },
      { data: implementationRuns },
      { data: generatedFiles },
      { data: generationRuns },
      { data: qualityRuns },
    ] = await Promise.all([
      supabase
        .from("blueprints")
        .select("*")
        .eq("project_id", projectId)
        .order("version", { ascending: false }),
      supabase
        .from("implementation_runs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("generated_files")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("generation_runs")
        .select("*")
        .eq("project_id", projectId)
        .order("started_at", { ascending: false }),
      supabase
        .from("quality_runs")
        .select("*")
        .eq("project_id", projectId)
        .order("started_at", { ascending: false }),
    ]);

    return NextResponse.json({
      project,
      blueprints: blueprints ?? [],
      implementationRuns: implementationRuns ?? [],
      generatedFiles: generatedFiles ?? [],
      generationRuns: generationRuns ?? [],
      qualityRuns: qualityRuns ?? [],
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
    console.error("Fetch project unexpected error:", message);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}
