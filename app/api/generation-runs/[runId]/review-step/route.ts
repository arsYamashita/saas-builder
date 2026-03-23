import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import type { GenerationStep, StepReviewStatus } from "@/types/generation-run";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { applyStepReview, computeRunReviewStatus } from "@/lib/db/step-review";
import type { GenerationRunReviewStatus } from "@/types/generation-run";

type Props = {
  params: Promise<{ runId: string }>;
};

const VALID_ACTIONS: StepReviewStatus[] = ["approved", "rejected"];

export async function POST(req: NextRequest, { params }: Props) {
  try {
    await requireCurrentUser();
    const { runId } = await params;
    const body = await req.json();
    const { stepKey, action, reason } = body as {
      stepKey?: string;
      action?: string;
      reason?: string;
    };

    if (!stepKey || !action || !VALID_ACTIONS.includes(action as StepReviewStatus)) {
      return NextResponse.json(
        { error: "stepKey and action (approved|rejected) are required" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: run, error: fetchErr } = await supabase
      .from("generation_runs")
      .select("id, status, review_status, steps_json")
      .eq("id", runId)
      .single();

    if (fetchErr || !run) {
      return NextResponse.json(
        { error: "Generation run not found" },
        { status: 404 }
      );
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Only completed runs can have steps reviewed" },
        { status: 400 }
      );
    }

    const steps = run.steps_json as GenerationStep[];
    const result = applyStepReview(steps, stepKey, action as StepReviewStatus, reason);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Check if run-level review_status should be auto-updated
    const runReview = computeRunReviewStatus(
      result.steps,
      run.review_status as GenerationRunReviewStatus
    );

    const updatePayload: Record<string, unknown> = {
      steps_json: result.steps,
    };

    if (runReview.shouldUpdate) {
      updatePayload.review_status = runReview.newStatus;
      updatePayload.reviewed_at = runReview.reviewedAt;
    }

    const { error: updateErr } = await supabase
      .from("generation_runs")
      .update(updatePayload)
      .eq("id", runId);

    if (updateErr) {
      return NextResponse.json(
        { error: "Failed to update step review", details: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      runId,
      stepKey,
      reviewStatus: action,
      runReviewChanged: runReview.shouldUpdate,
      previousRunReviewStatus: runReview.shouldUpdate ? run.review_status : undefined,
      runReviewStatus: runReview.shouldUpdate ? runReview.newStatus : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to review step", details: message },
      { status: 500 }
    );
  }
}
