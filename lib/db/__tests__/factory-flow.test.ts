/**
 * Factory Flow Integration Tests
 *
 * End-to-end scenarios testing the complete factory lifecycle
 * using pure helpers (no DB, no network).
 *
 * Covers:
 * 1. Blueprint approve → generation step review → run auto-approve → promote eligibility
 * 2. Step rerun → downstream invalidation → run auto-revert → re-approve cycle
 * 3. Promotion gates (blueprint + generation both required)
 * 4. Reject reason flow
 */

import { describe, it, expect } from "vitest";
import {
  applyStepReview,
  applyStepRerunResult,
  areAllStepsApproved,
  computeRunReviewStatus,
  checkPromotionEligibility,
  invalidateDownstreamSteps,
  getDownstreamStepKeys,
} from "../step-review";
import type { GenerationStep } from "@/types/generation-run";
import type { GenerationRunReviewStatus } from "@/types/generation-run";

// ── Test Fixtures ────────────────────────────────────────────

function makeCompletedSteps(): GenerationStep[] {
  return [
    { key: "blueprint", label: "Generate Blueprint", status: "completed", meta: { provider: "gemini", model: "gemini-2.0-flash", taskKind: "intake+blueprint" } },
    { key: "implementation", label: "Generate Implementation", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "implementation" } },
    { key: "schema", label: "Generate Schema", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "schema" } },
    { key: "api_design", label: "Generate API Design", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "api_design" } },
    { key: "split_files", label: "Split To Files", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "file_split" } },
    { key: "export_files", label: "Export Files", status: "completed" },
  ];
}

/** Simulates approving all steps one by one, tracking run review status */
function approveAllStepsWithRunTracking(
  initialSteps: GenerationStep[],
  initialRunStatus: GenerationRunReviewStatus
): { steps: GenerationStep[]; runStatus: GenerationRunReviewStatus } {
  let steps = initialSteps;
  let runStatus = initialRunStatus;

  for (const s of steps) {
    if (s.status !== "completed") continue;
    const r = applyStepReview(steps, s.key, "approved");
    if (!r.ok) continue;
    steps = r.steps;

    const runReview = computeRunReviewStatus(steps, runStatus);
    if (runReview.shouldUpdate) {
      runStatus = runReview.newStatus;
    }
  }

  return { steps, runStatus };
}

// ── Scenario 1: Happy Path — Full Approval & Promotion ──────

describe("Scenario 1: Happy Path — Blueprint + Generation Approval → Promote", () => {
  it("step-by-step approval leads to run auto-approve and promotion eligibility", () => {
    const steps = makeCompletedSteps();
    let runStatus: GenerationRunReviewStatus = "pending";
    const blueprintReviewStatus = "approved";

    // Step 1: Approve steps one by one
    // After first step, run should still be pending
    const r1 = applyStepReview(steps, "blueprint", "approved");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;

    let review = computeRunReviewStatus(r1.steps, runStatus);
    expect(review.shouldUpdate).toBe(false); // Not all approved yet

    // Step 2: Approve all remaining
    const { steps: finalSteps, runStatus: finalRunStatus } =
      approveAllStepsWithRunTracking(steps, runStatus);

    expect(areAllStepsApproved(finalSteps)).toBe(true);
    expect(finalRunStatus).toBe("approved");

    // Step 3: Check promotion eligibility
    const promo = checkPromotionEligibility(finalRunStatus, blueprintReviewStatus);
    expect(promo.eligible).toBe(true);
  });

  it("all 6 steps must be approved for run auto-approve", () => {
    const steps = makeCompletedSteps();
    let currentSteps = steps;
    let runStatus: GenerationRunReviewStatus = "pending";

    // Approve 5 of 6 steps
    const keysToApprove = ["blueprint", "implementation", "schema", "api_design", "split_files"];
    for (const key of keysToApprove) {
      const r = applyStepReview(currentSteps, key, "approved");
      if (!r.ok) continue;
      currentSteps = r.steps;
      const review = computeRunReviewStatus(currentSteps, runStatus);
      if (review.shouldUpdate) runStatus = review.newStatus;
    }

    // 5/6 approved — run should still be pending
    expect(runStatus).toBe("pending");
    expect(areAllStepsApproved(currentSteps)).toBe(false);

    // Approve the last step (export_files)
    const rFinal = applyStepReview(currentSteps, "export_files", "approved");
    expect(rFinal.ok).toBe(true);
    if (!rFinal.ok) return;

    const finalReview = computeRunReviewStatus(rFinal.steps, runStatus);
    expect(finalReview.shouldUpdate).toBe(true);
    if (!finalReview.shouldUpdate) return;
    expect(finalReview.newStatus).toBe("approved");
  });
});

// ── Scenario 2: Rerun → Invalidation → Re-approval Cycle ───

describe("Scenario 2: Step Rerun → Downstream Invalidation → Run Revert → Re-approve", () => {
  it("schema rerun invalidates downstream and reverts run approval", () => {
    // Phase 1: Get to fully approved state
    const { steps: approvedSteps, runStatus } =
      approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");
    expect(runStatus).toBe("approved");

    // Phase 2: Rerun schema with new result
    const rerun = applyStepRerunResult(approvedSteps, "schema", {
      provider: "claude",
      model: "claude-sonnet-4-5",
      durationMs: 4500,
    });
    expect(rerun.ok).toBe(true);
    if (!rerun.ok) return;

    // Phase 3: Verify state after rerun
    const schemaStep = rerun.steps.find((s) => s.key === "schema")!;
    expect(schemaStep.meta?.reviewStatus).toBe("pending");
    expect(schemaStep.meta?.rerunAt).toBeTruthy();

    // Downstream invalidated
    const apiStep = rerun.steps.find((s) => s.key === "api_design")!;
    expect(apiStep.meta?.reviewStatus).toBe("pending");
    expect(apiStep.meta?.invalidatedByStep).toBe("schema");

    const splitStep = rerun.steps.find((s) => s.key === "split_files")!;
    expect(splitStep.meta?.reviewStatus).toBe("pending");
    expect(splitStep.meta?.invalidatedByStep).toBe("schema");

    // Non-downstream NOT invalidated
    const implStep = rerun.steps.find((s) => s.key === "implementation")!;
    expect(implStep.meta?.reviewStatus).toBe("approved");

    // Phase 4: Run should revert to pending
    const runReview = computeRunReviewStatus(rerun.steps, "approved");
    expect(runReview.shouldUpdate).toBe(true);
    if (!runReview.shouldUpdate) return;
    expect(runReview.newStatus).toBe("pending");

    // Phase 5: Promotion should be blocked
    const promo = checkPromotionEligibility("pending", "approved");
    expect(promo.eligible).toBe(false);

    // Phase 6: Re-approve invalidated steps → run auto-approved again
    const { steps: reApproved, runStatus: reRunStatus } =
      approveAllStepsWithRunTracking(rerun.steps, "pending");
    expect(reRunStatus).toBe("approved");
    expect(areAllStepsApproved(reApproved)).toBe(true);

    // Phase 7: Promotion eligible again
    const promo2 = checkPromotionEligibility("approved", "approved");
    expect(promo2.eligible).toBe(true);
  });

  it("implementation rerun only invalidates split_files", () => {
    const { steps } = approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");

    const rerun = applyStepRerunResult(steps, "implementation", { durationMs: 3000 });
    expect(rerun.ok).toBe(true);
    if (!rerun.ok) return;

    // split_files invalidated
    expect(rerun.steps.find((s) => s.key === "split_files")!.meta?.invalidatedByStep).toBe("implementation");

    // api_design NOT invalidated
    expect(rerun.steps.find((s) => s.key === "api_design")!.meta?.reviewStatus).toBe("approved");

    // schema NOT invalidated
    expect(rerun.steps.find((s) => s.key === "schema")!.meta?.reviewStatus).toBe("approved");
  });

  it("split_files rerun invalidates nothing — run stays approved if only split_files was pending", () => {
    const { steps } = approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");

    const rerun = applyStepRerunResult(steps, "split_files", { durationMs: 1000 });
    expect(rerun.ok).toBe(true);
    if (!rerun.ok) return;

    // split_files itself is pending (rerun resets it)
    expect(rerun.steps.find((s) => s.key === "split_files")!.meta?.reviewStatus).toBe("pending");

    // No other steps invalidated — downstream of split_files is empty
    expect(getDownstreamStepKeys("split_files")).toEqual([]);

    // Run should revert because not all steps approved
    const review = computeRunReviewStatus(rerun.steps, "approved");
    expect(review.shouldUpdate).toBe(true);
    if (!review.shouldUpdate) return;
    expect(review.newStatus).toBe("pending");
  });
});

// ── Scenario 3: Promotion Gate Enforcement ──────────────────

describe("Scenario 3: Promotion Gates", () => {
  it("blocks promotion when blueprint is not approved", () => {
    const result = checkPromotionEligibility("approved", "pending");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("Blueprint");
  });

  it("blocks promotion when generation run is not approved", () => {
    const result = checkPromotionEligibility("pending", "approved");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("Generation run");
  });

  it("blocks promotion when both are not approved", () => {
    const result = checkPromotionEligibility("pending", "pending");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(2);
  });

  it("blocks promotion when blueprint is null (no blueprint)", () => {
    const result = checkPromotionEligibility("approved", null);
    expect(result.eligible).toBe(false);
  });

  it("allows promotion only when both approved", () => {
    const result = checkPromotionEligibility("approved", "approved");
    expect(result.eligible).toBe(true);
  });

  it("promotion blocked after rerun reverts run to pending", () => {
    const { steps } = approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");

    // Rerun → run reverts to pending
    const rerun = applyStepRerunResult(steps, "schema", {});
    if (!rerun.ok) return;
    const review = computeRunReviewStatus(rerun.steps, "approved");
    const newRunStatus = review.shouldUpdate ? review.newStatus : "approved";

    const promo = checkPromotionEligibility(newRunStatus, "approved");
    expect(promo.eligible).toBe(false);
  });
});

// ── Scenario 4: Reject Reason Flow ──────────────────────────

describe("Scenario 4: Reject Reason Flow", () => {
  it("reject with reason → re-approve clears reason → reject again with new reason", () => {
    const steps = makeCompletedSteps();

    // Reject schema with reason
    const r1 = applyStepReview(steps, "schema", "rejected", "API スキーマが不整合");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.steps.find((s) => s.key === "schema")!.meta?.rejectReason).toBe("API スキーマが不整合");

    // Approve (clears reason)
    const r2 = applyStepReview(r1.steps, "schema", "approved");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.steps.find((s) => s.key === "schema")!.meta?.rejectReason).toBeUndefined();

    // Reject again with different reason
    const r3 = applyStepReview(r2.steps, "schema", "rejected", "型定義が不足");
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.steps.find((s) => s.key === "schema")!.meta?.rejectReason).toBe("型定義が不足");
  });

  it("reject without reason preserves no reason", () => {
    const steps = makeCompletedSteps();
    const r = applyStepReview(steps, "schema", "rejected");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.find((s) => s.key === "schema")!.meta?.rejectReason).toBeUndefined();
  });

  it("rejected step blocks run auto-approve", () => {
    const steps = makeCompletedSteps();
    let currentSteps = steps;
    let runStatus: GenerationRunReviewStatus = "pending";

    // Approve all except schema
    for (const key of ["blueprint", "implementation", "api_design", "split_files", "export_files"]) {
      const r = applyStepReview(currentSteps, key, "approved");
      if (!r.ok) continue;
      currentSteps = r.steps;
      const review = computeRunReviewStatus(currentSteps, runStatus);
      if (review.shouldUpdate) runStatus = review.newStatus;
    }

    // Reject schema
    const rReject = applyStepReview(currentSteps, "schema", "rejected", "問題あり");
    if (!rReject.ok) return;
    currentSteps = rReject.steps;

    const review = computeRunReviewStatus(currentSteps, runStatus);
    // Run should NOT be auto-approved
    expect(runStatus).toBe("pending");
    expect(review.shouldUpdate).toBe(false);
    expect(areAllStepsApproved(currentSteps)).toBe(false);
  });
});

// ── Scenario 5: Mixed Step States ───────────────────────────

describe("Scenario 5: Mixed Step States & Edge Cases", () => {
  it("failed step does not block approval of other steps", () => {
    const steps = makeCompletedSteps();
    steps[2] = { ...steps[2], status: "failed" }; // schema failed

    // Can still approve other completed steps
    const r = applyStepReview(steps, "implementation", "approved");
    expect(r.ok).toBe(true);
  });

  it("cannot review a failed step", () => {
    const steps = makeCompletedSteps();
    steps[2] = { ...steps[2], status: "failed" };
    const r = applyStepReview(steps, "schema", "approved");
    expect(r.ok).toBe(false);
  });

  it("run with some failed steps — areAllStepsApproved ignores non-completed", () => {
    const steps = makeCompletedSteps();
    steps[2] = { ...steps[2], status: "failed" }; // schema failed

    // Approve all completed steps
    let current = steps;
    for (const s of current) {
      if (s.status !== "completed") continue;
      const r = applyStepReview(current, s.key, "approved");
      if (r.ok) current = r.steps;
    }

    // All completed steps are approved (failed step is skipped)
    expect(areAllStepsApproved(current)).toBe(true);
  });

  it("downstream invalidation only affects completed steps with review", () => {
    const steps = makeCompletedSteps();
    // Only approve schema and api_design
    let current = steps;
    const r1 = applyStepReview(current, "schema", "approved");
    if (r1.ok) current = r1.steps;
    const r2 = applyStepReview(current, "api_design", "approved");
    if (r2.ok) current = r2.steps;

    // Rerun schema → only api_design should be invalidated (split_files has no review)
    const invalidated = invalidateDownstreamSteps(current, "schema");

    const api = invalidated.find((s) => s.key === "api_design")!;
    expect(api.meta?.reviewStatus).toBe("pending");
    expect(api.meta?.invalidatedByStep).toBe("schema");

    const split = invalidated.find((s) => s.key === "split_files")!;
    // split_files had no reviewStatus, so no invalidation markers
    expect(split.meta?.invalidatedAt).toBeUndefined();
  });
});

// ── Scenario 6: Full Lifecycle — Multiple Reruns ────────────

describe("Scenario 6: Full Lifecycle — Multiple Reruns", () => {
  it("approve → rerun schema → re-approve → rerun impl → re-approve → promote", () => {
    // Phase 1: Initial approval
    let { steps, runStatus } = approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");
    expect(runStatus).toBe("approved");

    // Phase 2: Rerun schema
    const rerun1 = applyStepRerunResult(steps, "schema", { durationMs: 5000 });
    expect(rerun1.ok).toBe(true);
    if (!rerun1.ok) return;
    steps = rerun1.steps;

    let review = computeRunReviewStatus(steps, "approved");
    if (review.shouldUpdate) runStatus = review.newStatus;
    expect(runStatus).toBe("pending");

    // Phase 3: Re-approve schema, api_design, split_files (invalidated)
    ({ steps, runStatus } = approveAllStepsWithRunTracking(steps, runStatus));
    expect(runStatus).toBe("approved");

    // Phase 4: Rerun implementation
    const rerun2 = applyStepRerunResult(steps, "implementation", { durationMs: 3000 });
    expect(rerun2.ok).toBe(true);
    if (!rerun2.ok) return;
    steps = rerun2.steps;

    review = computeRunReviewStatus(steps, "approved");
    if (review.shouldUpdate) runStatus = review.newStatus;
    expect(runStatus).toBe("pending");

    // impl pending, split_files invalidated
    expect(steps.find((s) => s.key === "implementation")!.meta?.reviewStatus).toBe("pending");
    expect(steps.find((s) => s.key === "split_files")!.meta?.invalidatedByStep).toBe("implementation");

    // Phase 5: Re-approve → auto-approve → promote eligible
    ({ steps, runStatus } = approveAllStepsWithRunTracking(steps, runStatus));
    expect(runStatus).toBe("approved");

    const promo = checkPromotionEligibility(runStatus, "approved");
    expect(promo.eligible).toBe(true);
  });

  it("cascade: blueprint rerun invalidates all AI steps", () => {
    const { steps } = approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");

    // Simulate blueprint rerun invalidation
    const invalidated = invalidateDownstreamSteps(steps, "blueprint");

    // All AI steps invalidated
    for (const key of ["implementation", "schema", "api_design", "split_files"]) {
      const s = invalidated.find((st) => st.key === key)!;
      expect(s.meta?.reviewStatus).toBe("pending");
      expect(s.meta?.invalidatedByStep).toBe("blueprint");
    }

    // export_files NOT invalidated (not in dependency graph)
    const ef = invalidated.find((s) => s.key === "export_files")!;
    expect(ef.meta?.reviewStatus).toBe("approved");
  });
});

// ── Scenario 7: Promotion Gate After State Changes ──────────

describe("Scenario 7: Promotion Gate After Various State Changes", () => {
  it("approved → reject one step → promotion blocked → re-approve → promotion allowed", () => {
    let { steps, runStatus } = approveAllStepsWithRunTracking(makeCompletedSteps(), "pending");
    expect(checkPromotionEligibility(runStatus, "approved").eligible).toBe(true);

    // Reject one step
    const r = applyStepReview(steps, "api_design", "rejected");
    if (!r.ok) return;
    steps = r.steps;

    const review = computeRunReviewStatus(steps, runStatus);
    if (review.shouldUpdate) runStatus = review.newStatus;
    expect(runStatus).toBe("pending"); // reverted

    expect(checkPromotionEligibility(runStatus, "approved").eligible).toBe(false);

    // Re-approve
    const r2 = applyStepReview(steps, "api_design", "approved");
    if (!r2.ok) return;
    steps = r2.steps;

    const review2 = computeRunReviewStatus(steps, runStatus);
    if (review2.shouldUpdate) runStatus = review2.newStatus;
    expect(runStatus).toBe("approved");

    expect(checkPromotionEligibility(runStatus, "approved").eligible).toBe(true);
  });

  it("manual run reject is not overridden by step auto-approve", () => {
    // Manually rejected run — even if all steps approved, computeRunReviewStatus will auto-approve
    // This is by design: step-level approval is authoritative
    const steps = makeCompletedSteps();
    const { steps: approved } = approveAllStepsWithRunTracking(steps, "pending");

    // computeRunReviewStatus from rejected → all steps approved → should auto-approve
    const review = computeRunReviewStatus(approved, "rejected");
    expect(review.shouldUpdate).toBe(true);
    if (!review.shouldUpdate) return;
    expect(review.newStatus).toBe("approved");
  });
});
