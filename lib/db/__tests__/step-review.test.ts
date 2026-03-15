import { describe, it, expect } from "vitest";
import {
  applyStepReview,
  getStepRouteInfo,
  getRerunableStepKeys,
  applyStepRerunResult,
  getDownstreamStepKeys,
  invalidateDownstreamSteps,
  areAllStepsApproved,
  computeRunReviewStatus,
  checkPromotionEligibility,
} from "../step-review";
import type { GenerationStep } from "@/types/generation-run";

function makeSteps(overrides?: Partial<GenerationStep>[]): GenerationStep[] {
  const defaults: GenerationStep[] = [
    { key: "blueprint", label: "Generate Blueprint", status: "completed", meta: { provider: "gemini", model: "gemini-2.0-flash", taskKind: "intake+blueprint" } },
    { key: "implementation", label: "Generate Implementation", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "implementation" } },
    { key: "schema", label: "Generate Schema", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "schema" } },
    { key: "api_design", label: "Generate API Design", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "api_design" } },
    { key: "split_files", label: "Split To Files", status: "completed", meta: { provider: "claude", model: "claude-sonnet-4-5", taskKind: "file_split" } },
    { key: "export_files", label: "Export Files", status: "completed" },
  ];
  if (overrides) {
    return defaults.map((s, i) => (overrides[i] ? { ...s, ...overrides[i] } : s));
  }
  return defaults;
}

/** Helper: approve all 6 steps */
function approveAll(steps: GenerationStep[]): GenerationStep[] {
  let current = steps;
  for (const s of current) {
    if (s.status !== "completed") continue;
    const r = applyStepReview(current, s.key, "approved");
    if (r.ok) current = r.steps;
  }
  return current;
}

// ── applyStepReview ──────────────────────────────────────────

describe("applyStepReview", () => {
  it("approves a completed step", () => {
    const result = applyStepReview(makeSteps(), "schema", "approved");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const schema = result.steps.find((s) => s.key === "schema")!;
    expect(schema.meta?.reviewStatus).toBe("approved");
    expect(schema.meta?.reviewedAt).toBeTruthy();
    expect(schema.meta?.provider).toBe("claude");
    expect(schema.meta?.taskKind).toBe("schema");
  });

  it("rejects a completed step", () => {
    const result = applyStepReview(makeSteps(), "implementation", "rejected");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const impl = result.steps.find((s) => s.key === "implementation")!;
    expect(impl.meta?.reviewStatus).toBe("rejected");
  });

  it("fails for non-existent step", () => {
    const result = applyStepReview(makeSteps(), "nonexistent", "approved");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not found");
  });

  it("fails for non-completed step", () => {
    const steps = makeSteps();
    steps[2] = { ...steps[2], status: "failed" };
    const result = applyStepReview(steps, "schema", "approved");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not completed");
  });

  it("does not modify other steps", () => {
    const result = applyStepReview(makeSteps(), "schema", "approved");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const impl = result.steps.find((s) => s.key === "implementation")!;
    expect(impl.meta?.reviewStatus).toBeUndefined();
  });

  it("works on step with no prior meta", () => {
    const result = applyStepReview(makeSteps(), "export_files", "approved");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ef = result.steps.find((s) => s.key === "export_files")!;
    expect(ef.meta?.reviewStatus).toBe("approved");
  });

  it("overwrites previous review status", () => {
    const r1 = applyStepReview(makeSteps(), "schema", "approved");
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = applyStepReview(r1.steps, "schema", "rejected");
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.steps.find((s) => s.key === "schema")!.meta?.reviewStatus).toBe("rejected");
  });

  it("stores reject reason when rejecting", () => {
    const result = applyStepReview(makeSteps(), "schema", "rejected", "JSON 形式が不正");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const schema = result.steps.find((s) => s.key === "schema")!;
    expect(schema.meta?.rejectReason).toBe("JSON 形式が不正");
  });

  it("clears reject reason when approving", () => {
    const r1 = applyStepReview(makeSteps(), "schema", "rejected", "理由あり");
    if (!r1.ok) return;
    const r2 = applyStepReview(r1.steps, "schema", "approved");
    if (!r2.ok) return;
    expect(r2.steps.find((s) => s.key === "schema")!.meta?.rejectReason).toBeUndefined();
  });

  it("preserves existing reject reason when rejecting without new reason", () => {
    const r1 = applyStepReview(makeSteps(), "schema", "rejected", "元の理由");
    if (!r1.ok) return;
    const r2 = applyStepReview(r1.steps, "schema", "rejected");
    if (!r2.ok) return;
    expect(r2.steps.find((s) => s.key === "schema")!.meta?.rejectReason).toBe("元の理由");
  });
});

// ── getStepRouteInfo ─────────────────────────────────────────

describe("getStepRouteInfo", () => {
  it("returns rerunnable info for implementation", () => {
    const info = getStepRouteInfo("implementation");
    expect(info.rerunnable).toBe(true);
    if (!info.rerunnable) return;
    expect(info.taskKind).toBe("implementation");
    expect(info.routePath).toBe("generate-implementation");
  });

  it("returns rerunnable for schema, api_design, split_files", () => {
    for (const key of ["schema", "api_design", "split_files"]) {
      expect(getStepRouteInfo(key).rerunnable).toBe(true);
    }
  });

  it("returns non-rerunnable for blueprint", () => {
    const info = getStepRouteInfo("blueprint");
    expect(info.rerunnable).toBe(false);
    if (info.rerunnable) return;
    expect(info.reason).toContain("composite");
  });

  it("returns non-rerunnable for export_files", () => {
    const info = getStepRouteInfo("export_files");
    expect(info.rerunnable).toBe(false);
  });

  it("returns non-rerunnable for unknown step", () => {
    expect(getStepRouteInfo("unknown").rerunnable).toBe(false);
  });
});

describe("getRerunableStepKeys", () => {
  it("returns exactly 4 rerunnable steps", () => {
    const keys = getRerunableStepKeys();
    expect(keys).toHaveLength(4);
    expect(keys).toContain("implementation");
    expect(keys).toContain("schema");
    expect(keys).toContain("api_design");
    expect(keys).toContain("split_files");
    expect(keys).not.toContain("blueprint");
    expect(keys).not.toContain("export_files");
  });
});

// ── getDownstreamStepKeys ────────────────────────────────────

describe("getDownstreamStepKeys", () => {
  it("blueprint depends on all AI steps", () => {
    const ds = getDownstreamStepKeys("blueprint");
    expect(ds).toContain("implementation");
    expect(ds).toContain("schema");
    expect(ds).toContain("api_design");
    expect(ds).toContain("split_files");
    expect(ds).not.toContain("export_files");
    expect(ds).not.toContain("blueprint");
  });

  it("schema -> api_design, split_files", () => {
    const ds = getDownstreamStepKeys("schema");
    expect(ds).toContain("api_design");
    expect(ds).toContain("split_files");
    expect(ds).not.toContain("implementation");
    expect(ds).not.toContain("blueprint");
  });

  it("implementation -> split_files only", () => {
    const ds = getDownstreamStepKeys("implementation");
    expect(ds).toEqual(["split_files"]);
  });

  it("api_design -> split_files only", () => {
    const ds = getDownstreamStepKeys("api_design");
    expect(ds).toEqual(["split_files"]);
  });

  it("split_files has no downstream", () => {
    expect(getDownstreamStepKeys("split_files")).toEqual([]);
  });

  it("export_files has no downstream", () => {
    expect(getDownstreamStepKeys("export_files")).toEqual([]);
  });

  it("unknown step has no downstream", () => {
    expect(getDownstreamStepKeys("unknown")).toEqual([]);
  });
});

// ── invalidateDownstreamSteps ────────────────────────────────

describe("invalidateDownstreamSteps", () => {
  it("resets approved downstream after schema rerun", () => {
    const steps = approveAll(makeSteps());
    // Verify all approved
    expect(steps.find((s) => s.key === "api_design")!.meta?.reviewStatus).toBe("approved");
    expect(steps.find((s) => s.key === "split_files")!.meta?.reviewStatus).toBe("approved");

    const result = invalidateDownstreamSteps(steps, "schema");
    const api = result.find((s) => s.key === "api_design")!;
    const split = result.find((s) => s.key === "split_files")!;

    // Downstream invalidated
    expect(api.meta?.reviewStatus).toBe("pending");
    expect(api.meta?.reviewedAt).toBeUndefined();
    expect(api.meta?.invalidatedAt).toBeTruthy();
    expect(api.meta?.invalidatedByStep).toBe("schema");

    expect(split.meta?.reviewStatus).toBe("pending");
    expect(split.meta?.invalidatedByStep).toBe("schema");

    // Non-downstream untouched
    const impl = result.find((s) => s.key === "implementation")!;
    expect(impl.meta?.reviewStatus).toBe("approved");
    expect(impl.meta?.invalidatedAt).toBeUndefined();

    const bp = result.find((s) => s.key === "blueprint")!;
    expect(bp.meta?.reviewStatus).toBe("approved");
  });

  it("does not invalidate pending downstream steps", () => {
    const steps = makeSteps(); // all pending (no reviewStatus)
    const result = invalidateDownstreamSteps(steps, "schema");

    const api = result.find((s) => s.key === "api_design")!;
    expect(api.meta?.invalidatedAt).toBeUndefined();
    expect(api.meta?.reviewStatus).toBeUndefined();
  });

  it("implementation rerun invalidates only split_files", () => {
    const steps = approveAll(makeSteps());
    const result = invalidateDownstreamSteps(steps, "implementation");

    expect(result.find((s) => s.key === "split_files")!.meta?.reviewStatus).toBe("pending");
    expect(result.find((s) => s.key === "split_files")!.meta?.invalidatedByStep).toBe("implementation");

    // api_design NOT invalidated (not downstream of implementation)
    expect(result.find((s) => s.key === "api_design")!.meta?.reviewStatus).toBe("approved");
  });

  it("split_files rerun invalidates nothing", () => {
    const steps = approveAll(makeSteps());
    const result = invalidateDownstreamSteps(steps, "split_files");

    // Everything stays approved
    for (const s of result) {
      if (s.status === "completed" && s.meta?.reviewStatus) {
        expect(s.meta.reviewStatus).toBe("approved");
      }
    }
  });

  it("preserves step status and result data", () => {
    const steps = approveAll(makeSteps());
    const result = invalidateDownstreamSteps(steps, "schema");

    const api = result.find((s) => s.key === "api_design")!;
    expect(api.status).toBe("completed");
    expect(api.meta?.provider).toBe("claude");
    expect(api.meta?.taskKind).toBe("api_design");
  });
});

// ── applyStepRerunResult (with invalidation) ─────────────────

describe("applyStepRerunResult", () => {
  it("updates meta with new data and resets review", () => {
    const reviewed = applyStepReview(makeSteps(), "schema", "rejected");
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) return;

    const newMeta = {
      taskKind: "schema",
      provider: "claude",
      model: "claude-sonnet-4-5",
      durationMs: 5000,
      warningCount: 0,
      errorCount: 0,
    };
    const result = applyStepRerunResult(reviewed.steps, "schema", newMeta);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const schema = result.steps.find((s) => s.key === "schema")!;
    expect(schema.status).toBe("completed");
    expect(schema.meta?.reviewStatus).toBe("pending");
    expect(schema.meta?.reviewedAt).toBeUndefined();
    expect(schema.meta?.rerunAt).toBeTruthy();
    expect(schema.meta?.durationMs).toBe(5000);
  });

  it("invalidates downstream steps on rerun", () => {
    // Approve all, then rerun schema
    const steps = approveAll(makeSteps());
    const result = applyStepRerunResult(steps, "schema", { durationMs: 3000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // schema itself: pending + rerunAt
    const schema = result.steps.find((s) => s.key === "schema")!;
    expect(schema.meta?.reviewStatus).toBe("pending");
    expect(schema.meta?.rerunAt).toBeTruthy();

    // api_design: invalidated
    const api = result.steps.find((s) => s.key === "api_design")!;
    expect(api.meta?.reviewStatus).toBe("pending");
    expect(api.meta?.invalidatedByStep).toBe("schema");

    // split_files: invalidated
    const split = result.steps.find((s) => s.key === "split_files")!;
    expect(split.meta?.reviewStatus).toBe("pending");
    expect(split.meta?.invalidatedByStep).toBe("schema");

    // implementation: NOT invalidated
    const impl = result.steps.find((s) => s.key === "implementation")!;
    expect(impl.meta?.reviewStatus).toBe("approved");
    expect(impl.meta?.invalidatedAt).toBeUndefined();
  });

  it("fails for non-existent step", () => {
    const result = applyStepRerunResult(makeSteps(), "nonexistent", {});
    expect(result.ok).toBe(false);
  });

  it("clears invalidatedAt on the rerun step itself", () => {
    // First invalidate schema via blueprint dependency simulation
    const steps = approveAll(makeSteps());
    const invalidated = invalidateDownstreamSteps(steps, "blueprint");
    const schema = invalidated.find((s) => s.key === "schema")!;
    expect(schema.meta?.invalidatedAt).toBeTruthy();

    // Rerun schema
    const result = applyStepRerunResult(invalidated, "schema", { durationMs: 2000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const updatedSchema = result.steps.find((s) => s.key === "schema")!;
    expect(updatedSchema.meta?.invalidatedAt).toBeUndefined();
    expect(updatedSchema.meta?.invalidatedByStep).toBeUndefined();
  });
});

// ── areAllStepsApproved ──────────────────────────────────────

describe("areAllStepsApproved", () => {
  it("returns true when all completed steps are approved", () => {
    expect(areAllStepsApproved(approveAll(makeSteps()))).toBe(true);
  });

  it("returns false when no steps are reviewed", () => {
    expect(areAllStepsApproved(makeSteps())).toBe(false);
  });

  it("returns false when one step is rejected", () => {
    const steps = approveAll(makeSteps());
    const r = applyStepReview(steps, "schema", "rejected");
    if (!r.ok) return;
    expect(areAllStepsApproved(r.steps)).toBe(false);
  });

  it("returns false when one step is pending", () => {
    const steps = approveAll(makeSteps());
    // Rerun invalidates downstream
    const r = applyStepRerunResult(steps, "schema", {});
    if (!r.ok) return;
    expect(areAllStepsApproved(r.steps)).toBe(false);
  });

  it("returns false for empty steps", () => {
    expect(areAllStepsApproved([])).toBe(false);
  });
});

// ── computeRunReviewStatus ───────────────────────────────────

describe("computeRunReviewStatus", () => {
  it("auto-approves run when all steps are approved", () => {
    const steps = approveAll(makeSteps());
    const result = computeRunReviewStatus(steps, "pending");
    expect(result.shouldUpdate).toBe(true);
    if (!result.shouldUpdate) return;
    expect(result.newStatus).toBe("approved");
    expect(result.reviewedAt).toBeTruthy();
  });

  it("does not update when already approved and all steps approved", () => {
    const steps = approveAll(makeSteps());
    const result = computeRunReviewStatus(steps, "approved");
    expect(result.shouldUpdate).toBe(false);
  });

  it("reverts approved run to pending when steps are invalidated", () => {
    // Approve all, then rerun schema → invalidates downstream
    const steps = approveAll(makeSteps());
    const rerun = applyStepRerunResult(steps, "schema", {});
    expect(rerun.ok).toBe(true);
    if (!rerun.ok) return;

    const result = computeRunReviewStatus(rerun.steps, "approved");
    expect(result.shouldUpdate).toBe(true);
    if (!result.shouldUpdate) return;
    expect(result.newStatus).toBe("pending");
  });

  it("does not auto-reject run when a step is rejected", () => {
    const steps = approveAll(makeSteps());
    const r = applyStepReview(steps, "schema", "rejected");
    if (!r.ok) return;

    // Run was approved; step rejected → should revert to pending (not rejected)
    const result = computeRunReviewStatus(r.steps, "approved");
    expect(result.shouldUpdate).toBe(true);
    if (!result.shouldUpdate) return;
    expect(result.newStatus).toBe("pending");
  });

  it("does not update pending run when steps are not all approved", () => {
    const result = computeRunReviewStatus(makeSteps(), "pending");
    expect(result.shouldUpdate).toBe(false);
  });

  it("does not update rejected run when steps are not all approved", () => {
    const result = computeRunReviewStatus(makeSteps(), "rejected");
    expect(result.shouldUpdate).toBe(false);
  });

  it("auto-approves run from rejected state when all steps approved", () => {
    const steps = approveAll(makeSteps());
    const result = computeRunReviewStatus(steps, "rejected");
    expect(result.shouldUpdate).toBe(true);
    if (!result.shouldUpdate) return;
    expect(result.newStatus).toBe("approved");
  });

  it("full cycle: approve all → auto-approve → rerun → auto-revert → re-approve all → auto-approve", () => {
    // 1. Approve all steps → run auto-approved
    const steps1 = approveAll(makeSteps());
    const r1 = computeRunReviewStatus(steps1, "pending");
    expect(r1.shouldUpdate).toBe(true);
    if (!r1.shouldUpdate) return;
    expect(r1.newStatus).toBe("approved");

    // 2. Rerun schema → downstream invalidated → run reverts
    const rerun = applyStepRerunResult(steps1, "schema", { durationMs: 3000 });
    expect(rerun.ok).toBe(true);
    if (!rerun.ok) return;
    const r2 = computeRunReviewStatus(rerun.steps, "approved");
    expect(r2.shouldUpdate).toBe(true);
    if (!r2.shouldUpdate) return;
    expect(r2.newStatus).toBe("pending");

    // 3. Re-approve all steps → run auto-approved again
    const steps3 = approveAll(rerun.steps);
    const r3 = computeRunReviewStatus(steps3, "pending");
    expect(r3.shouldUpdate).toBe(true);
    if (!r3.shouldUpdate) return;
    expect(r3.newStatus).toBe("approved");
  });
});

// ── checkPromotionEligibility ────────────────────────────────

describe("checkPromotionEligibility", () => {
  it("eligible when both run and blueprint are approved", () => {
    const result = checkPromotionEligibility("approved", "approved");
    expect(result.eligible).toBe(true);
  });

  it("ineligible when run is not approved", () => {
    const result = checkPromotionEligibility("pending", "approved");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("Generation run");
  });

  it("ineligible when blueprint is not approved", () => {
    const result = checkPromotionEligibility("approved", "pending");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("Blueprint");
  });

  it("ineligible when both are not approved", () => {
    const result = checkPromotionEligibility("pending", "pending");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(2);
  });

  it("ineligible when blueprint is null", () => {
    const result = checkPromotionEligibility("approved", null);
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons[0]).toContain("none");
  });

  it("ineligible when blueprint is undefined", () => {
    const result = checkPromotionEligibility("approved", undefined);
    expect(result.eligible).toBe(false);
  });

  it("ineligible when run is rejected", () => {
    const result = checkPromotionEligibility("rejected", "approved");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons[0]).toContain("rejected");
  });

  // quality gate tests (third arg)
  it("eligible when all three conditions met", () => {
    const result = checkPromotionEligibility("approved", "approved", "passed");
    expect(result.eligible).toBe(true);
  });

  it("ineligible when quality gates failed", () => {
    const result = checkPromotionEligibility("approved", "approved", "failed");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("Quality gates");
  });

  it("ineligible when quality gates not run (null)", () => {
    const result = checkPromotionEligibility("approved", "approved", null);
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons[0]).toContain("Quality gates");
  });

  it("backward compat: omitted quality arg does not block", () => {
    // Existing 2-arg calls should still work
    const result = checkPromotionEligibility("approved", "approved");
    expect(result.eligible).toBe(true);
  });

  it("accumulates all three reasons", () => {
    const result = checkPromotionEligibility("pending", null, "failed");
    expect(result.eligible).toBe(false);
    if (result.eligible) return;
    expect(result.reasons).toHaveLength(3);
  });
});
