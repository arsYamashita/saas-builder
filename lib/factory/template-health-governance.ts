/**
 * Template Health / Promotion Governance v1
 *
 * Deterministic lifecycle governance for Factory templates.
 * Evaluates template health from existing evidence (regression summaries,
 * quality gates, baseline compares) and derives governance decisions.
 *
 * Pure logic layer — no DB changes, no quality gate changes.
 *
 * Health states:
 *   candidate  — not yet GREEN
 *   green      — stable, all criteria satisfied
 *   at_risk    — passing but warning signals detected
 *   degraded   — no longer behaving like stable GREEN
 *   demoted    — explicitly no longer considered GREEN
 *
 * Decision rules:
 *   A. candidate + all GREEN criteria → promote_to_green
 *   B. green + warning signals → mark_at_risk
 *   C. green/at_risk + fail/degradation worsens → mark_degraded
 *   D. degraded + persistent failures → demote
 *   E. degraded/demoted + recovery → eligible_for_repromotion
 *   F. insufficient evidence → conservative hold
 */

import type { RegressionStatus, TemplateRegressionSummary } from "../regression/nightly-template-regression";

// ── Health States ────────────────────────────────────────────

export type TemplateHealthState =
  | "candidate"
  | "green"
  | "at_risk"
  | "degraded"
  | "demoted";

// ── Governance Decisions ─────────────────────────────────────

export type GovernanceDecision =
  | "promote_to_green"
  | "remain_green"
  | "hold_candidate"
  | "mark_at_risk"
  | "mark_degraded"
  | "demote"
  | "eligible_for_repromotion"
  | "blocked_from_promotion";

// ── Thresholds ───────────────────────────────────────────────

export const GOVERNANCE_THRESHOLDS = {
  /** Number of recent runs to evaluate */
  recentWindow: 5,

  /** Degraded runs in window to trigger at_risk */
  atRiskDegradedCount: 2,

  /** Fail runs in window to trigger mark_degraded */
  degradedFailCount: 2,

  /** Fail runs in window to trigger demote */
  demoteFailCount: 3,

  /** Consecutive fail runs to trigger demote */
  demoteConsecutiveFailCount: 2,

  /** Consecutive pass runs required for re-promotion eligibility */
  repromotionConsecutivePassCount: 2,
} as const;

// ── GREEN Criteria ───────────────────────────────────────────

export interface GreenCriteria {
  /** Generation pipeline completed successfully */
  pipelineComplete: boolean;
  /** All quality gates pass (lint, typecheck, playwright, role_consistency, unit_tests) */
  qualityGatesPass: boolean;
  /** Baseline compare pass */
  baselinePass: boolean;
  /** Tenant isolation verified */
  tenantIsolationVerified: boolean;
  /** RBAC verified */
  rbacVerified: boolean;
  /** Runtime verification done */
  runtimeVerificationDone: boolean;
}

/**
 * Checks whether all GREEN criteria are satisfied.
 * Does NOT weaken any condition.
 */
export function checkGreenEligibility(criteria: GreenCriteria): {
  eligible: boolean;
  failedCriteria: string[];
} {
  const failedCriteria: string[] = [];

  if (!criteria.pipelineComplete) failedCriteria.push("pipeline_incomplete");
  if (!criteria.qualityGatesPass) failedCriteria.push("quality_gates_fail");
  if (!criteria.baselinePass) failedCriteria.push("baseline_fail");
  if (!criteria.tenantIsolationVerified) failedCriteria.push("tenant_isolation_unverified");
  if (!criteria.rbacVerified) failedCriteria.push("rbac_unverified");
  if (!criteria.runtimeVerificationDone) failedCriteria.push("runtime_verification_missing");

  return {
    eligible: failedCriteria.length === 0,
    failedCriteria,
  };
}

// ── Health Signals ───────────────────────────────────────────

export interface TemplateHealthSignals {
  /** Current health state (input) */
  currentState: TemplateHealthState;
  /** Latest GREEN criteria evaluation */
  greenCriteria: GreenCriteria;
  /** Recent regression run statuses (most recent first, up to recentWindow) */
  recentRegressionStatuses: RegressionStatus[];
  /** Latest regression status (convenience, same as recentRegressionStatuses[0]) */
  latestRegressionStatus?: RegressionStatus;
  /** Whether latest baseline comparison passed */
  latestBaselinePassed: boolean;
  /** Whether latest quality gates passed */
  latestQualityGatesPassed: boolean;
  /** Cost delta percentage from latest regression comparison */
  latestCostDeltaPct?: number | null;
  /** Duration delta percentage from latest regression comparison */
  latestDurationDeltaPct?: number | null;
  /** Latest fallback count */
  latestFallbackCount?: number;
}

/**
 * Summarizes regression run history into signal counts.
 */
export function summarizeTemplateHealthSignals(signals: TemplateHealthSignals): {
  recentPassCount: number;
  recentDegradedCount: number;
  recentFailCount: number;
  consecutivePassCount: number;
  consecutiveFailCount: number;
  greenCriteriaEligible: boolean;
  greenCriteriaFailedCount: number;
} {
  const window = signals.recentRegressionStatuses.slice(0, GOVERNANCE_THRESHOLDS.recentWindow);

  const recentPassCount = window.filter((s) => s === "pass").length;
  const recentDegradedCount = window.filter((s) => s === "degraded").length;
  const recentFailCount = window.filter((s) => s === "fail").length;

  // Consecutive pass from most recent
  let consecutivePassCount = 0;
  for (const s of window) {
    if (s === "pass") consecutivePassCount++;
    else break;
  }

  // Consecutive fail from most recent
  let consecutiveFailCount = 0;
  for (const s of window) {
    if (s === "fail") consecutiveFailCount++;
    else break;
  }

  const greenCheck = checkGreenEligibility(signals.greenCriteria);

  return {
    recentPassCount,
    recentDegradedCount,
    recentFailCount,
    consecutivePassCount,
    consecutiveFailCount,
    greenCriteriaEligible: greenCheck.eligible,
    greenCriteriaFailedCount: greenCheck.failedCriteria.length,
  };
}

// ── Governance Decision Types ────────────────────────────────

export interface TemplateGovernanceResult {
  templateKey: string;
  currentState: TemplateHealthState;
  nextState: TemplateHealthState;
  decision: GovernanceDecision;
  reasons: string[];
  signals: {
    recentPassCount: number;
    recentDegradedCount: number;
    recentFailCount: number;
    consecutivePassCount: number;
    consecutiveFailCount: number;
    latestRegressionStatus?: RegressionStatus;
    latestBaselinePassed: boolean;
    latestQualityGatesPassed: boolean;
    greenCriteriaEligible: boolean;
  };
  evaluatedAt: string;
}

// ── Core Governance Logic ────────────────────────────────────

/**
 * Evaluates template health and derives a governance decision.
 *
 * Decision priority (evaluated in order):
 * 1. Demotion checks (most severe)
 * 2. Degradation checks
 * 3. At-risk checks
 * 4. Promotion / re-promotion eligibility
 * 5. Conservative hold
 */
export function evaluateTemplateHealth(
  templateKey: string,
  signals: TemplateHealthSignals
): TemplateGovernanceResult {
  const summary = summarizeTemplateHealthSignals(signals);
  const t = GOVERNANCE_THRESHOLDS;
  const reasons: string[] = [];

  const latestRegression = signals.latestRegressionStatus ??
    signals.recentRegressionStatuses[0];

  const baseResult = {
    templateKey,
    currentState: signals.currentState,
    signals: {
      recentPassCount: summary.recentPassCount,
      recentDegradedCount: summary.recentDegradedCount,
      recentFailCount: summary.recentFailCount,
      consecutivePassCount: summary.consecutivePassCount,
      consecutiveFailCount: summary.consecutiveFailCount,
      latestRegressionStatus: latestRegression,
      latestBaselinePassed: signals.latestBaselinePassed,
      latestQualityGatesPassed: signals.latestQualityGatesPassed,
      greenCriteriaEligible: summary.greenCriteriaEligible,
    },
    evaluatedAt: new Date().toISOString(),
  };

  // ── CANDIDATE state ────────────────────────────────────────
  if (signals.currentState === "candidate") {
    return evaluateCandidateState(baseResult, summary, signals, reasons);
  }

  // ── DEMOTED state ──────────────────────────────────────────
  if (signals.currentState === "demoted") {
    return evaluateDemotedState(baseResult, summary, signals, reasons);
  }

  // ── GREEN / AT_RISK / DEGRADED states ──────────────────────
  return evaluateActiveState(baseResult, summary, signals, reasons, t);
}

function evaluateCandidateState(
  base: Omit<TemplateGovernanceResult, "nextState" | "decision" | "reasons">,
  summary: ReturnType<typeof summarizeTemplateHealthSignals>,
  signals: TemplateHealthSignals,
  reasons: string[]
): TemplateGovernanceResult {
  // Rule A: candidate + all GREEN criteria → promote
  if (summary.greenCriteriaEligible) {
    // Also require no unresolved fail in latest evaluation
    const latestRegression = signals.recentRegressionStatuses[0];
    if (latestRegression === "fail") {
      reasons.push("latest regression run failed");
      return { ...base, nextState: "candidate", decision: "blocked_from_promotion", reasons };
    }
    reasons.push("all GREEN criteria satisfied");
    if (latestRegression === "pass") {
      reasons.push("latest regression run passed");
    }
    return { ...base, nextState: "green", decision: "promote_to_green", reasons };
  }

  // Rule F: insufficient / criteria not met → hold
  const greenCheck = checkGreenEligibility(signals.greenCriteria);
  reasons.push(`GREEN criteria not met: ${greenCheck.failedCriteria.join(", ")}`);
  return { ...base, nextState: "candidate", decision: "hold_candidate", reasons };
}

function evaluateDemotedState(
  base: Omit<TemplateGovernanceResult, "nextState" | "decision" | "reasons">,
  summary: ReturnType<typeof summarizeTemplateHealthSignals>,
  signals: TemplateHealthSignals,
  reasons: string[]
): TemplateGovernanceResult {
  const t = GOVERNANCE_THRESHOLDS;

  // Rule E: check re-promotion eligibility
  if (
    summary.greenCriteriaEligible &&
    summary.consecutivePassCount >= t.repromotionConsecutivePassCount
  ) {
    reasons.push(`${summary.consecutivePassCount} consecutive pass runs`);
    reasons.push("GREEN criteria satisfied again");
    return { ...base, nextState: "demoted", decision: "eligible_for_repromotion", reasons };
  }

  // Still demoted
  if (!summary.greenCriteriaEligible) {
    const greenCheck = checkGreenEligibility(signals.greenCriteria);
    reasons.push(`GREEN criteria not met: ${greenCheck.failedCriteria.join(", ")}`);
  }
  if (summary.consecutivePassCount < t.repromotionConsecutivePassCount) {
    reasons.push(
      `only ${summary.consecutivePassCount} consecutive pass runs (need ${t.repromotionConsecutivePassCount})`
    );
  }
  return { ...base, nextState: "demoted", decision: "blocked_from_promotion", reasons };
}

function evaluateActiveState(
  base: Omit<TemplateGovernanceResult, "nextState" | "decision" | "reasons">,
  summary: ReturnType<typeof summarizeTemplateHealthSignals>,
  signals: TemplateHealthSignals,
  reasons: string[],
  t: typeof GOVERNANCE_THRESHOLDS
): TemplateGovernanceResult {
  const latestRegression = signals.recentRegressionStatuses[0];

  // ── Rule D: DEMOTE checks (most severe) ────────────────────

  // Core GREEN criteria fail → demote
  if (!summary.greenCriteriaEligible) {
    const greenCheck = checkGreenEligibility(signals.greenCriteria);
    reasons.push(`core GREEN criteria failed: ${greenCheck.failedCriteria.join(", ")}`);
    return { ...base, nextState: "demoted", decision: "demote", reasons };
  }

  // fail_count >= demoteFailCount in window
  if (summary.recentFailCount >= t.demoteFailCount) {
    reasons.push(`${summary.recentFailCount} fail runs in last ${t.recentWindow} (threshold: ${t.demoteFailCount})`);
    return { ...base, nextState: "demoted", decision: "demote", reasons };
  }

  // Consecutive fails >= demoteConsecutiveFailCount
  if (summary.consecutiveFailCount >= t.demoteConsecutiveFailCount) {
    reasons.push(`${summary.consecutiveFailCount} consecutive fail runs (threshold: ${t.demoteConsecutiveFailCount})`);
    return { ...base, nextState: "demoted", decision: "demote", reasons };
  }

  // ── Rule C: DEGRADED checks ────────────────────────────────

  // Degraded state: check for re-promotion eligibility
  if (signals.currentState === "degraded") {
    if (
      summary.greenCriteriaEligible &&
      summary.consecutivePassCount >= t.repromotionConsecutivePassCount
    ) {
      reasons.push(`${summary.consecutivePassCount} consecutive pass runs`);
      reasons.push("GREEN criteria satisfied");
      return { ...base, nextState: "degraded", decision: "eligible_for_repromotion", reasons };
    }
  }

  // Latest regression = fail → mark_degraded
  if (latestRegression === "fail") {
    reasons.push("latest regression run failed");
    return { ...base, nextState: "degraded", decision: "mark_degraded", reasons };
  }

  // fail_count >= degradedFailCount in window
  if (summary.recentFailCount >= t.degradedFailCount) {
    reasons.push(`${summary.recentFailCount} fail runs in last ${t.recentWindow} (threshold: ${t.degradedFailCount})`);
    return { ...base, nextState: "degraded", decision: "mark_degraded", reasons };
  }

  // ── Rule B: AT_RISK checks ─────────────────────────────────

  // Latest regression = degraded → at_risk
  if (latestRegression === "degraded") {
    reasons.push("latest regression run degraded");
    return { ...base, nextState: "at_risk", decision: "mark_at_risk", reasons };
  }

  // degraded_count >= atRiskDegradedCount in window
  if (summary.recentDegradedCount >= t.atRiskDegradedCount) {
    reasons.push(`${summary.recentDegradedCount} degraded runs in last ${t.recentWindow} (threshold: ${t.atRiskDegradedCount})`);
    return { ...base, nextState: "at_risk", decision: "mark_at_risk", reasons };
  }

  // ── STABLE: remain_green ───────────────────────────────────
  reasons.push("all signals stable");
  return { ...base, nextState: "green", decision: "remain_green", reasons };
}

// ── Re-promotion Eligibility (standalone) ────────────────────

/**
 * Evaluates whether a degraded/demoted template is eligible for re-promotion.
 * This is a convenience wrapper for explicit re-promotion checks.
 */
export function evaluateRepromotionEligibility(
  templateKey: string,
  signals: TemplateHealthSignals
): {
  eligible: boolean;
  reasons: string[];
} {
  if (signals.currentState !== "degraded" && signals.currentState !== "demoted") {
    return { eligible: false, reasons: ["template is not degraded or demoted"] };
  }

  const summary = summarizeTemplateHealthSignals(signals);
  const t = GOVERNANCE_THRESHOLDS;
  const reasons: string[] = [];

  if (!summary.greenCriteriaEligible) {
    const greenCheck = checkGreenEligibility(signals.greenCriteria);
    reasons.push(`GREEN criteria not met: ${greenCheck.failedCriteria.join(", ")}`);
    return { eligible: false, reasons };
  }

  if (summary.consecutivePassCount < t.repromotionConsecutivePassCount) {
    reasons.push(
      `only ${summary.consecutivePassCount} consecutive pass runs (need ${t.repromotionConsecutivePassCount})`
    );
    return { eligible: false, reasons };
  }

  reasons.push(`${summary.consecutivePassCount} consecutive pass runs`);
  reasons.push("GREEN criteria satisfied");
  return { eligible: true, reasons };
}

// ── Batch Evaluation ─────────────────────────────────────────

/**
 * Evaluates all templates and produces a governance summary.
 */
export function evaluateAllTemplateHealth(
  templates: Array<{
    templateKey: string;
    signals: TemplateHealthSignals;
  }>
): TemplateGovernanceBatchResult {
  const results = templates.map((t) =>
    evaluateTemplateHealth(t.templateKey, t.signals)
  );

  return {
    results,
    summary: buildGovernanceSummaryRollup(results),
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Summary / Reporting ──────────────────────────────────────

export interface GovernanceSummaryRollup {
  candidateCount: number;
  greenCount: number;
  atRiskCount: number;
  degradedCount: number;
  demotedCount: number;
  promoteToGreenCount: number;
  demoteCount: number;
  eligibleForRepromotionCount: number;
}

export interface TemplateGovernanceBatchResult {
  results: TemplateGovernanceResult[];
  summary: GovernanceSummaryRollup;
  evaluatedAt: string;
}

export function buildGovernanceSummaryRollup(
  results: TemplateGovernanceResult[]
): GovernanceSummaryRollup {
  return {
    candidateCount: results.filter((r) => r.nextState === "candidate").length,
    greenCount: results.filter((r) => r.nextState === "green").length,
    atRiskCount: results.filter((r) => r.nextState === "at_risk").length,
    degradedCount: results.filter((r) => r.nextState === "degraded").length,
    demotedCount: results.filter((r) => r.nextState === "demoted").length,
    promoteToGreenCount: results.filter((r) => r.decision === "promote_to_green").length,
    demoteCount: results.filter((r) => r.decision === "demote").length,
    eligibleForRepromotionCount: results.filter((r) => r.decision === "eligible_for_repromotion").length,
  };
}

// ── Logging ──────────────────────────────────────────────────

export interface TemplateGovernanceLog {
  templateKey: string;
  currentState: TemplateHealthState;
  nextState: TemplateHealthState;
  decision: GovernanceDecision;
  reasons: string[];
  signalsSummary: {
    recentPassCount: number;
    recentDegradedCount: number;
    recentFailCount: number;
    greenCriteriaEligible: boolean;
  };
  timestamp: string;
}

export function buildTemplateGovernanceLog(
  result: TemplateGovernanceResult
): TemplateGovernanceLog {
  return {
    templateKey: result.templateKey,
    currentState: result.currentState,
    nextState: result.nextState,
    decision: result.decision,
    reasons: result.reasons,
    signalsSummary: {
      recentPassCount: result.signals.recentPassCount,
      recentDegradedCount: result.signals.recentDegradedCount,
      recentFailCount: result.signals.recentFailCount,
      greenCriteriaEligible: result.signals.greenCriteriaEligible,
    },
    timestamp: result.evaluatedAt,
  };
}

// ── Console Report Formatting ────────────────────────────────

const STATE_LABELS: Record<TemplateHealthState, string> = {
  candidate: "CANDIDATE",
  green: "GREEN",
  at_risk: "AT_RISK",
  degraded: "DEGRADED",
  demoted: "DEMOTED",
};

const DECISION_LABELS: Record<GovernanceDecision, string> = {
  promote_to_green: "PROMOTE → GREEN",
  remain_green: "REMAIN GREEN",
  hold_candidate: "HOLD CANDIDATE",
  mark_at_risk: "MARK AT_RISK",
  mark_degraded: "MARK DEGRADED",
  demote: "DEMOTE",
  eligible_for_repromotion: "ELIGIBLE FOR RE-PROMOTION",
  blocked_from_promotion: "BLOCKED FROM PROMOTION",
};

export function formatGovernanceResult(result: TemplateGovernanceResult): string {
  const lines: string[] = [];
  lines.push(`--- ${result.templateKey} ---`);
  lines.push(`  State:      ${STATE_LABELS[result.currentState]} → ${STATE_LABELS[result.nextState]}`);
  lines.push(`  Decision:   ${DECISION_LABELS[result.decision]}`);
  lines.push(`  Regression: pass=${result.signals.recentPassCount} degraded=${result.signals.recentDegradedCount} fail=${result.signals.recentFailCount}`);
  lines.push(`  Latest:     ${result.signals.latestRegressionStatus ?? "N/A"}`);
  lines.push(`  Baseline:   ${result.signals.latestBaselinePassed ? "PASS" : "FAIL"}`);
  lines.push(`  Quality:    ${result.signals.latestQualityGatesPassed ? "PASS" : "FAIL"}`);
  lines.push(`  GREEN ok:   ${result.signals.greenCriteriaEligible ? "YES" : "NO"}`);
  lines.push(`  Reasons:    ${result.reasons.join("; ")}`);
  return lines.join("\n");
}

export function formatGovernanceBatchReport(batch: TemplateGovernanceBatchResult): string {
  const lines: string[] = [];
  lines.push("=== TEMPLATE HEALTH GOVERNANCE ===");
  lines.push("");

  for (const result of batch.results) {
    lines.push(formatGovernanceResult(result));
    lines.push("");
  }

  lines.push("=== SUMMARY ===");
  const s = batch.summary;
  lines.push(`Candidate:               ${s.candidateCount}`);
  lines.push(`Green:                   ${s.greenCount}`);
  lines.push(`At Risk:                 ${s.atRiskCount}`);
  lines.push(`Degraded:                ${s.degradedCount}`);
  lines.push(`Demoted:                 ${s.demotedCount}`);
  lines.push(`Promote to Green:        ${s.promoteToGreenCount}`);
  lines.push(`Demote:                  ${s.demoteCount}`);
  lines.push(`Eligible Re-promotion:   ${s.eligibleForRepromotionCount}`);

  return lines.join("\n");
}

// ── Helpers: Build signals from regression summaries ─────────

/**
 * Builds TemplateHealthSignals from regression summaries and current state.
 * Convenience bridge between nightly regression artifacts and governance input.
 */
export function buildSignalsFromRegressionHistory(opts: {
  currentState: TemplateHealthState;
  greenCriteria: GreenCriteria;
  /** Most recent regression summaries (most recent first) */
  recentRegressions: TemplateRegressionSummary[];
}): TemplateHealthSignals {
  const latest = opts.recentRegressions[0];

  return {
    currentState: opts.currentState,
    greenCriteria: opts.greenCriteria,
    recentRegressionStatuses: opts.recentRegressions.map((r) => r.regressionStatus),
    latestRegressionStatus: latest?.regressionStatus,
    latestBaselinePassed: latest?.baselinePassed ?? false,
    latestQualityGatesPassed: latest?.qualityGatesPassed ?? false,
    latestCostDeltaPct: latest?.comparison?.costDeltaPct,
    latestDurationDeltaPct: latest?.comparison?.durationDeltaPct,
    latestFallbackCount: latest?.fallbackCount,
  };
}
