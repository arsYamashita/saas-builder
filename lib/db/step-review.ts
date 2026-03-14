/**
 * Step Review — Pure helpers for step-level review and rerun operations.
 *
 * These functions operate on steps_json arrays without DB access,
 * making them easy to test and reuse across route handlers.
 */

import type { GenerationStep, GenerationRunReviewStatus, StepReviewStatus } from "@/types/generation-run";

// ── Step Review ──────────────────────────────────────────────

export type ApplyStepReviewResult =
  | { ok: true; steps: GenerationStep[] }
  | { ok: false; error: string };

export function applyStepReview(
  steps: GenerationStep[],
  stepKey: string,
  action: StepReviewStatus,
  reason?: string
): ApplyStepReviewResult {
  const step = steps.find((s) => s.key === stepKey);

  if (!step) {
    return { ok: false, error: `Step "${stepKey}" not found` };
  }

  if (step.status !== "completed") {
    return {
      ok: false,
      error: `Step "${stepKey}" is not completed (status: ${step.status})`,
    };
  }

  const updatedSteps = steps.map((s) => {
    if (s.key !== stepKey) return s;
    return {
      ...s,
      meta: {
        ...(s.meta ?? {}),
        reviewStatus: action,
        reviewedAt: new Date().toISOString(),
        rejectReason: action === "rejected" ? (reason || s.meta?.rejectReason) : undefined,
      },
    };
  });

  return { ok: true, steps: updatedSteps };
}

// ── Step Rerun ───────────────────────────────────────────────

/**
 * stepKey → taskKind / route path mapping.
 * Used by rerun-step to resolve which route to call.
 */
export type StepRouteInfo = {
  taskKind: string;
  routePath: string;
  rerunnable: true;
} | {
  taskKind: null;
  routePath: null;
  rerunnable: false;
  reason: string;
};

const STEP_ROUTE_MAP: Record<string, StepRouteInfo> = {
  blueprint: {
    taskKind: null,
    routePath: null,
    rerunnable: false,
    reason: "blueprint is a 2-step composite (intake+blueprint) — rerun via full regeneration",
  },
  implementation: {
    taskKind: "implementation",
    routePath: "generate-implementation",
    rerunnable: true,
  },
  schema: {
    taskKind: "schema",
    routePath: "generate-schema",
    rerunnable: true,
  },
  api_design: {
    taskKind: "api_design",
    routePath: "generate-api-design",
    rerunnable: true,
  },
  split_files: {
    taskKind: "file_split",
    routePath: "split-run-to-files",
    rerunnable: true,
  },
  export_files: {
    taskKind: null,
    routePath: null,
    rerunnable: false,
    reason: "export_files has no AI step — re-export via Export button",
  },
};

export function getStepRouteInfo(stepKey: string): StepRouteInfo {
  return STEP_ROUTE_MAP[stepKey] ?? {
    taskKind: null,
    routePath: null,
    rerunnable: false,
    reason: `Unknown step key: ${stepKey}`,
  };
}

export function getRerunableStepKeys(): string[] {
  return Object.entries(STEP_ROUTE_MAP)
    .filter(([, info]) => info.rerunnable)
    .map(([key]) => key);
}

// ── Step Dependencies ────────────────────────────────────────

/**
 * Directed dependency graph: stepKey → direct downstream stepKeys.
 *
 * If step A is rerun, all transitive downstream steps must be invalidated.
 *
 * Graph:
 *   blueprint ──→ implementation ──→ split_files
 *       │                              ↑
 *       ├──→ schema ──→ api_design ────┘
 *       │        └──→ split_files
 *       └──→ api_design
 *       └──→ split_files
 *
 * export_files is excluded — it has no AI and is not invalidated.
 */
const STEP_DIRECT_DEPS: Record<string, string[]> = {
  blueprint: ["implementation", "schema", "api_design", "split_files"],
  implementation: ["split_files"],
  schema: ["api_design", "split_files"],
  api_design: ["split_files"],
  split_files: [],
  export_files: [],
};

/**
 * Returns all transitive downstream step keys for a given step.
 */
export function getDownstreamStepKeys(stepKey: string): string[] {
  const visited = new Set<string>();
  const queue = STEP_DIRECT_DEPS[stepKey] ?? [];

  for (const key of queue) {
    if (visited.has(key)) continue;
    visited.add(key);
    const children = STEP_DIRECT_DEPS[key] ?? [];
    for (const child of children) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return Array.from(visited);
}

/**
 * Invalidates downstream steps after a rerun:
 * - Resets reviewStatus to pending
 * - Clears reviewedAt
 * - Sets invalidatedAt + invalidatedByStep
 *
 * Only affects steps that are completed and have a reviewStatus !== pending.
 * Does not change step.status or result data — only review metadata.
 */
export function invalidateDownstreamSteps(
  steps: GenerationStep[],
  changedStepKey: string
): GenerationStep[] {
  const downstreamKeys = new Set(getDownstreamStepKeys(changedStepKey));
  if (downstreamKeys.size === 0) return steps;

  const now = new Date().toISOString();

  return steps.map((s) => {
    if (!downstreamKeys.has(s.key)) return s;
    if (s.status !== "completed") return s;

    const currentReview = s.meta?.reviewStatus;
    // Only invalidate if there's something to invalidate
    if (!currentReview || currentReview === "pending") {
      // Still mark as stale if it was previously clean
      if (!s.meta?.invalidatedAt) return s;
      return s;
    }

    return {
      ...s,
      meta: {
        ...(s.meta ?? {}),
        reviewStatus: "pending" as StepReviewStatus,
        reviewedAt: undefined,
        invalidatedAt: now,
        invalidatedByStep: changedStepKey,
      },
    };
  });
}

/**
 * Check if all completed steps are approved.
 */
export function areAllStepsApproved(steps: GenerationStep[]): boolean {
  const completedSteps = steps.filter((s) => s.status === "completed");
  if (completedSteps.length === 0) return false;
  return completedSteps.every((s) => s.meta?.reviewStatus === "approved");
}

// ── Promotion Eligibility ─────────────────────────────────────

export type PromotionEligibility =
  | { eligible: true }
  | { eligible: false; reasons: string[] };

/**
 * Checks if a generation run is eligible for baseline promotion.
 * Requires:
 *   1. Generation run review_status = approved (all steps approved)
 *   2. Blueprint review_status = approved
 *   3. Quality gate status = passed (all checks: lint + typecheck + playwright)
 */
export function checkPromotionEligibility(
  runReviewStatus: string,
  blueprintReviewStatus: string | null | undefined,
  qualityStatus?: string | null
): PromotionEligibility {
  const reasons: string[] = [];

  if (runReviewStatus !== "approved") {
    reasons.push(`Generation run is not approved (status: ${runReviewStatus})`);
  }

  if (!blueprintReviewStatus || blueprintReviewStatus !== "approved") {
    reasons.push(`Blueprint is not approved (status: ${blueprintReviewStatus ?? "none"})`);
  }

  // qualityStatus is optional for backward compat — but required for promotion
  if (qualityStatus !== undefined && qualityStatus !== "passed") {
    reasons.push(`Quality gates not passed (status: ${qualityStatus ?? "none"})`);
  }

  if (reasons.length > 0) {
    return { eligible: false, reasons };
  }

  return { eligible: true };
}

// ── Run-Level Auto-Review ─────────────────────────────────────

export type RunReviewUpdate =
  | { shouldUpdate: true; newStatus: GenerationRunReviewStatus; reviewedAt: string }
  | { shouldUpdate: false };

/**
 * Determines whether run-level review_status should be auto-updated
 * based on step review states.
 *
 * Rules:
 * - All steps approved → run auto-approved (with reviewed_at)
 * - Run was approved but steps are no longer all approved
 *   (e.g. after rerun/invalidation) → revert to pending
 * - Otherwise: no change (no auto-reject)
 */
export function computeRunReviewStatus(
  steps: GenerationStep[],
  currentRunReviewStatus: GenerationRunReviewStatus
): RunReviewUpdate {
  const allApproved = areAllStepsApproved(steps);

  if (allApproved && currentRunReviewStatus !== "approved") {
    return {
      shouldUpdate: true,
      newStatus: "approved",
      reviewedAt: new Date().toISOString(),
    };
  }

  if (!allApproved && currentRunReviewStatus === "approved") {
    return {
      shouldUpdate: true,
      newStatus: "pending",
      reviewedAt: new Date().toISOString(),
    };
  }

  return { shouldUpdate: false };
}

// ── Step Rerun ───────────────────────────────────────────────

export type ApplyStepRerunResult =
  | { ok: true; steps: GenerationStep[] }
  | { ok: false; error: string };

/**
 * Applies a rerun result to steps_json:
 * - Updates the step's meta with new provider/model/duration data
 * - Resets reviewStatus to pending
 * - Marks rerunAt timestamp
 * - Invalidates downstream steps' review status
 */
export function applyStepRerunResult(
  steps: GenerationStep[],
  stepKey: string,
  meta: Record<string, unknown>
): ApplyStepRerunResult {
  const step = steps.find((s) => s.key === stepKey);

  if (!step) {
    return { ok: false, error: `Step "${stepKey}" not found` };
  }

  // 1. Update the rerun step itself
  let updatedSteps = steps.map((s) => {
    if (s.key !== stepKey) return s;
    return {
      ...s,
      status: "completed" as const,
      meta: {
        ...(s.meta ?? {}),
        ...meta,
        reviewStatus: "pending" as StepReviewStatus,
        reviewedAt: undefined,
        rerunAt: new Date().toISOString(),
        invalidatedAt: undefined,
        invalidatedByStep: undefined,
      },
    };
  });

  // 2. Invalidate downstream steps
  updatedSteps = invalidateDownstreamSteps(updatedSteps, stepKey);

  return { ok: true, steps: updatedSteps };
}
