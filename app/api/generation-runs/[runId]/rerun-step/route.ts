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
import { acquireStepLock, releaseStepLock } from "@/lib/step-lock";
import { parseJsonBody, serverErrorResponse } from "@/lib/api/errors";

type Props = {
  params: Promise<{ runId: string }>;
};

export async function POST(req: NextRequest, { params }: Props) {
  try {
    const { runId } = await params;

    const parsedBody = await parseJsonBody<{ stepKey?: string }>(req);
    if (!parsedBody.ok) return parsedBody.response;
    const { stepKey } = parsedBody.data;

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

    // Guard against two concurrent reruns of the same step (double-click,
    // two browser tabs, etc.). TTL rationale is in lib/step-lock.ts —
    // see [[redis_nx_lock_ttl_too_short]].
    const lockKey = `rerun-step:${runId}:${stepKey}`;
    const lockToken = await acquireStepLock(lockKey);
    if (!lockToken) {
      return NextResponse.json(
        { error: `Step "${stepKey}" is already being rerun` },
        { status: 409 }
      );
    }

    try {
      // Mark step as running before calling the route. `startedAt` is a
      // heartbeat: resetStuckSteps() (lib/db/step-review.ts) uses it to
      // lazily detect + auto-reset a step that never reaches the
      // compensating catch below (e.g. the serverless function is killed
      // mid-flight rather than throwing). See
      // [[ai_generation_step_stuck_running]].
      const runningSteps = steps.map((s) => {
        if (s.key !== stepKey) return s;
        return {
          ...s,
          status: "running" as const,
          meta: { ...(s.meta ?? {}), startedAt: new Date().toISOString() },
        };
      });

      await supabase
        .from("generation_runs")
        .update({ steps_json: runningSteps, current_step: stepKey })
        .eq("id", runId);

      // Call the individual route via internal fetch
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const routePath = routeInfo.routePath;

      let routeJson: Record<string, unknown>;
      try {
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
          throw new Error(`HTTP ${routeRes.status}: ${text}`.trim());
        }

        routeJson = await routeRes.json();
      } catch (rerunError) {
        // Compensating transition: without this catch, a thrown fetch
        // (network error/timeout) or a non-JSON response would propagate
        // straight to the outer catch below, which never reverts
        // steps_json — leaving the step stuck at "running" forever. This
        // was the exact bug in [[ai_generation_step_stuck_running]].
        // Revert to "completed" (the step keeps its last-good result) and
        // record the failure so the rerun is visibly not silently lost.
        const message =
          rerunError instanceof Error ? rerunError.message : "Unknown error";

        const failedSteps = steps.map((s) => {
          if (s.key !== stepKey) return s;
          return {
            ...s,
            status: "completed" as const,
            meta: {
              ...(s.meta ?? {}),
              startedAt: undefined,
              rerunError: `Rerun failed: ${message}`,
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
    } finally {
      // Always release, whether the rerun succeeded, failed, or threw —
      // the TTL is the backstop if this never runs (process killed).
      await releaseStepLock(lockKey, lockToken);
    }
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
    return serverErrorResponse("generation-runs/rerun-step", error, {
      message: "Failed to rerun step",
    });
  }
}
