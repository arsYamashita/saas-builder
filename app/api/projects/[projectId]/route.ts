import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    await requireCurrentUser();
    const { projectId } = await params;
    const supabase = createAdminClient();

    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Project not found", details: error.message },
        { status: 404 }
      );
    }

    const { data: blueprints } = await supabase
      .from("blueprints")
      .select("*")
      .eq("project_id", projectId)
      .order("version", { ascending: false });

    const { data: implementationRuns } = await supabase
      .from("implementation_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const { data: generatedFiles } = await supabase
      .from("generated_files")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    const { data: generationRuns } = await supabase
      .from("generation_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false });

    const { data: qualityRuns } = await supabase
      .from("quality_runs")
      .select("*")
      .eq("project_id", projectId)
      .order("started_at", { ascending: false });

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
    return NextResponse.json(
      { error: "Failed to fetch project", details: message },
      { status: 500 }
    );
  }
}
