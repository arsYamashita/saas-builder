import { NextRequest, NextResponse } from "next/server";
import {
  createGenerationRun,
  updateGenerationStep,
  completeGenerationRun,
  failGenerationRun,
} from "@/lib/db/generation-runs";
import { createAdminClient } from "@/lib/db/supabase/admin";

type Props = {
  params: Promise<{ projectId: string }>;
};

async function postInternal(path: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Internal request failed: ${path} ${res.status} ${text}`
    );
  }

  return res.json();
}

export async function POST(_req: NextRequest, { params }: Props) {
  const { projectId } = await params;
  let generationRunId: string | null = null;
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const supabase = createAdminClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found", details: projectError?.message },
        { status: 404 }
      );
    }

    const generationRun = await createGenerationRun(
      projectId,
      project.template_key
    );
    generationRunId = generationRun.id;

    await updateGenerationStep(generationRunId, "blueprint", "running");
    await postInternal(
      `/api/projects/${projectId}/generate-blueprint`
    );
    await updateGenerationStep(generationRunId, "blueprint", "completed");

    await updateGenerationStep(
      generationRunId,
      "implementation",
      "running"
    );
    await postInternal(
      `/api/projects/${projectId}/generate-implementation`
    );
    await updateGenerationStep(
      generationRunId,
      "implementation",
      "completed"
    );

    await updateGenerationStep(generationRunId, "schema", "running");
    await postInternal(`/api/projects/${projectId}/generate-schema`);
    await updateGenerationStep(generationRunId, "schema", "completed");

    await updateGenerationStep(generationRunId, "api_design", "running");
    await postInternal(
      `/api/projects/${projectId}/generate-api-design`
    );
    await updateGenerationStep(
      generationRunId,
      "api_design",
      "completed"
    );

    await updateGenerationStep(
      generationRunId,
      "split_files",
      "running"
    );
    await postInternal(
      `/api/projects/${projectId}/split-run-to-files`
    );
    await updateGenerationStep(
      generationRunId,
      "split_files",
      "completed"
    );

    await updateGenerationStep(
      generationRunId,
      "export_files",
      "running"
    );
    await postInternal(`/api/projects/${projectId}/export-files`);
    await updateGenerationStep(
      generationRunId,
      "export_files",
      "completed"
    );

    await completeGenerationRun(generationRunId);

    // Quality Gate を自動実行（失敗しても generate-template 自体は成功扱い）
    let qualityResult: { qualityRunId?: string; status?: string } = {};
    try {
      const qRes = await fetch(
        `${baseUrl}/api/projects/${projectId}/run-quality-gate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generationRunId }),
          cache: "no-store",
        }
      );
      if (qRes.ok) {
        qualityResult = await qRes.json();
      }
    } catch {
      // quality gate 失敗は無視
    }

    return NextResponse.json({
      ok: true,
      generationRunId,
      qualityRunId: qualityResult.qualityRunId ?? null,
      qualityStatus: qualityResult.status ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown generation error";

    if (generationRunId) {
      await failGenerationRun(generationRunId, message);
    }

    return NextResponse.json(
      { error: "Failed to generate full template", details: message },
      { status: 500 }
    );
  }
}
