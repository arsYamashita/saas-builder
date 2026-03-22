import { NextRequest, NextResponse } from "next/server";
import {
  createGenerationRun,
  updateGenerationStep,
  completeGenerationRun,
  failGenerationRun,
} from "@/lib/db/generation-runs";
import { createAdminClient } from "@/lib/db/supabase/admin";
import type { GenerationStepMeta } from "@/types/generation-run";
import { requireCurrentUser } from "@/lib/auth/current-user";

type Props = {
  params: Promise<{ projectId: string }>;
};

async function postInternal(path: string): Promise<{
  data: Record<string, unknown>;
  meta: GenerationStepMeta | undefined;
}> {
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

  const json = await res.json();
  const meta = json._meta as GenerationStepMeta | undefined;

  return { data: json, meta };
}

export async function POST(_req: NextRequest, { params }: Props) {
  try {
    await requireCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;
  let generationRunId = "";
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

    // Step 1: Blueprint
    await updateGenerationStep(generationRunId, "blueprint", "running");
    const blueprintRes = await postInternal(
      `/api/projects/${projectId}/generate-blueprint`
    );
    await updateGenerationStep(generationRunId, "blueprint", "completed", blueprintRes.meta);

    // Step 2: Implementation
    await updateGenerationStep(generationRunId, "implementation", "running");
    const implRes = await postInternal(
      `/api/projects/${projectId}/generate-implementation`
    );
    await updateGenerationStep(generationRunId, "implementation", "completed", implRes.meta);

    // Step 3: Schema
    await updateGenerationStep(generationRunId, "schema", "running");
    const schemaRes = await postInternal(
      `/api/projects/${projectId}/generate-schema`
    );
    await updateGenerationStep(generationRunId, "schema", "completed", schemaRes.meta);

    // Step 4: API Design
    await updateGenerationStep(generationRunId, "api_design", "running");
    const apiRes = await postInternal(
      `/api/projects/${projectId}/generate-api-design`
    );
    await updateGenerationStep(generationRunId, "api_design", "completed", apiRes.meta);

    // Step 5: Split Files
    await updateGenerationStep(generationRunId, "split_files", "running");
    const splitRes = await postInternal(
      `/api/projects/${projectId}/split-run-to-files`
    );
    await updateGenerationStep(generationRunId, "split_files", "completed", splitRes.meta);

    // Step 6: Export Files (no AI — no _meta)
    await updateGenerationStep(generationRunId, "export_files", "running");
    await postInternal(`/api/projects/${projectId}/export-files`);
    await updateGenerationStep(generationRunId, "export_files", "completed");

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
