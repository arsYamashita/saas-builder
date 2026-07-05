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
import { rateLimit } from "@/lib/rate-limit";
import { serverErrorResponse } from "@/lib/api/errors";
import {
  INTERNAL_PIPELINE_HEADER,
  getInternalPipelineToken,
} from "@/lib/pipeline-internal";

type Props = {
  params: Promise<{ projectId: string }>;
};

async function postInternal(path: string): Promise<{
  data: Record<string, unknown>;
  meta: GenerationStepMeta | undefined;
}> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Mark this request as an internal pipeline step so the step endpoint
  // skips its per-user rate limit — one pipeline run must be atomic and
  // must not 429 halfway through. Auth is NOT bypassed by this header.
  // See lib/pipeline-internal.ts.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const internalToken = getInternalPipelineToken();
  if (internalToken) {
    headers[INTERNAL_PIPELINE_HEADER] = internalToken;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
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
  let currentUserId: string;
  try {
    const user = await requireCurrentUser();
    currentUserId = user.id;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // generate-template drives the full blueprint -> implementation -> schema
  // -> api-design chain (multiple paid LLM calls per invocation). It uses a
  // DEDICATED bucket (not the per-step `generate` bucket) so that a user who
  // consumed part of their per-step budget moments earlier can still start a
  // pipeline — and so a pipeline, once admitted here, runs to completion
  // without its internal steps hitting 429 (they bypass the per-step limit
  // via lib/pipeline-internal.ts). See [[saas_builder_ai_endpoint_no_rate_limit]].
  const allowed = await rateLimit(
    `generate-template:${currentUserId}`,
    2,
    60_000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "生成リクエストが多すぎます。しばらく待ってから再試行してください。" },
      { status: 429 }
    );
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
      // Never return the raw DB error message to the client — see
      // [[api_error_message_internal_leak]].
      if (projectError) {
        return serverErrorResponse("projects/generate-template", projectError, {
          status: 404,
          message: "Project not found",
        });
      }
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

    return serverErrorResponse("projects/generate-template", error, {
      message: "Failed to generate full template",
    });
  }
}
