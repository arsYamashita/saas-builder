import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import type { GenerationStep } from "@/types/generation-run";
import type { GenerationStepMeta } from "@/types/generation-run";
import { requireRunAccess } from "@/lib/auth/current-user";
import {
  getStepRouteInfo,
  applyStepRerunResult,
  computeRunReviewStatus,
} from "@/lib/db/step-review";
import type { GenerationRunReviewStatus } from "@/types/generation-run";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;
    const body = await req.json();
    const { stepKey } = body as { stepKey?: string };

    if (!stepKey) {
      return NextResponse.json(
        { error: "stepKey is required" },
        { status: 400 }
      );
    }

    // Check if step is rerunnable
    const routeInfo = getStepRouteInfo(stepKey);
    if (!routeInfo.rerunnable) {
      return NextResponse.json(
        { error: `Step "${stepKey}" is not rerunnable: ${routeInfo.reason}` },
        { status: 400 }
      );
    }

    const { run } = await requireRunAccess(runId);
    const supabase = createAdminClient();

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Only completed runs can have steps rerun" },
        { status: 400 }
      );
    }

    const steps = run.steps_json as GenerationStep[];
    const step = steps.find((s) => s.key === stepKey);

    if (!step) {
      return NextResponse.json(
        { error: `Step "${stepKey}" not found in this run` },
        { status: 400 }
      );
    }

    if (step.status !== "completed") {
      return NextResponse.json(
        { error: `Step "${stepKey}" is not completed (status: ${step.status})` },
        { status: 400 }
      );
    }

    // Mark step as running before calling the route
    const runningSteps = steps.map((s) => {
      if (s.key !== stepKey) return s;
      return { ...s, status: "running" as const };
    });

    await supabase
      .from("generation_runs")
      .update({ steps_json: runningSteps, current_step: stepKey })
      .eq("id", runId);

    // Call the individual route via internal fetch
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const routePath = routeInfo.routePath;

    const routeRes = await fetch(
      `${baseUrl}/api/projects/${run.project_id}/${routePath}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      }
    );

    if (!routeRes.ok) {
      const text = await routeRes.text();

      // Revert step to completed (failed rerun)
      const failedSteps = steps.map((s) => {
        if (s.key !== stepKey) return s;
        return {
          ...s,
          status: "completed" as const,
          meta: {
            ...(s.meta ?? {}),
            rerunError: `Rerun failed: ${routeRes.status}`,
          },
        };
      });

      await supabase
        .from("generation_runs")
        .update({ steps_json: failedSteps, current_step: null })
        .eq("id", runId);

      return NextResponse.json(
        { error: "Step rerun failed" },
        { status: 500 }
      );
    }

    const routeJson = await routeRes.json();
    const meta = routeJson._meta as GenerationStepMeta | undefined;

    // Apply rerun result
    const rerunResult = applyStepRerunResult(
      steps,
      stepKey,
      (meta ?? {}) as Record<string, unknown>
    );

    if (!rerunResult.ok) {
      return NextResponse.json(
        { error: rerunResult.error },
        { status: 500 }
      );
    }

    // Check if run-level review_status should revert (e.g. approved → pending)
    const runReview = computeRunReviewStatus(
      rerunResult.steps,
      run.review_status as GenerationRunReviewStatus
    );

    const updatePayload: Record<string, unknown> = {
      steps_json: rerunResult.steps,
      current_step: null,
    };

    if (runReview.shouldUpdate) {
      updatePayload.review_status = runReview.newStatus;
      updatePayload.reviewed_at = runReview.reviewedAt;
    }

    await supabase
      .from("generation_runs")
      .update(updatePayload)
      .eq("id", runId);

    return NextResponse.json({
      ok: true,
      runId,
      stepKey,
      meta: meta ?? null,
      runReviewChanged: runReview.shouldUpdate,
      previousRunReviewStatus: runReview.shouldUpdate ? run.review_status : undefined,
      runReviewStatus: runReview.shouldUpdate ? runReview.newStatus : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (message === "Not found") {
      return NextResponse.json(
        { error: "Generation run not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: "Failed to rerun step" },
      { status: 500 }
    );
  }
}
