/**
 * Self-Improving Factory v1
 *
 * Deterministic self-analysis layer that converts observed Factory outcomes
 * into explicit improvement proposals. Proposal-only — does NOT automatically
 * modify factory behavior.
 *
 * Analyzes:
 *   - provider routing metrics
 *   - provider learning outputs
 *   - cost guardrail decisions
 *   - regression summaries
 *   - template governance states
 *   - autopilot results
 *   - evolution proposals
 *
 * Improvement rules:
 *   A. Routing weight adjustment (degraded runs + recent outperforms base)
 *   B. Cost guardrail threshold review (repeated downgrades/blocks)
 *   C. Learning threshold adjustment (low confidence with enough data)
 *   D. Safe mode confidence review (suppressed provider later proves stable)
 *   E. Governance regression cadence (stuck at_risk/degraded)
 *   F. Autopilot confidence threshold (repeated quality/baseline failures)
 *
 * Pure logic layer — no DB changes, no config mutations.
 */

import type { TaskKind, ProviderId } from "../providers/provider-interface";
import type { ProviderTaskMetric } from "../providers/provider-scoreboard";
import type { CostGuardrailDecision } from "../providers/cost-guardrail";
import type { RegressionStatus } from "../regression/nightly-template-regression";
import type { TemplateHealthState, GovernanceDecision } from "./template-health-governance";
import type { AutopilotOutcome } from "./template-autopilot";
import type { FactoryIntelligenceMode } from "./factory-intelligence-control-plane";

// ── Subsystem Targets ───────────────────────────────────────

export type ImprovementSubsystem =
  | "provider_routing"
  | "provider_learning"
  | "cost_guardrail"
  | "control_plane"
  | "regression"
  | "governance"
  | "autopilot"
  | "evolution_engine";

export type ImprovementPriority = "critical" | "high" | "medium" | "low";

// ── Suggested Action ────────────────────────────────────────

export type SuggestedActionType =
  | "tune_weight"
  | "adjust_threshold"
  | "increase_frequency"
  | "review_config"
  | "tighten_criteria"
  | "expand_signal";

export interface SuggestedAction {
  type: SuggestedActionType;
  target: string;
  currentValue: number | string | null;
  suggestedValue: number | string | null;
}

// ── Improvement Proposal ────────────────────────────────────

export interface ImprovementProposal {
  id: string;
  subsystem: ImprovementSubsystem;
  priority: ImprovementPriority;
  confidence: number;
  title: string;
  description: string;
  reasons: string[];
  suggestedAction: SuggestedAction;
}

// ── Improvement Report ──────────────────────────────────────

export interface ImprovementReport {
  proposals: ImprovementProposal[];
  summary: {
    totalProposals: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    subsystemBreakdown: Partial<Record<ImprovementSubsystem, number>>;
  };
  evaluatedAt: string;
}

// ── Input Types ─────────────────────────────────────────────

export interface RoutingOutcome {
  taskKind: TaskKind;
  provider: ProviderId;
  baseScore: number;
  recentScore: number | null;
  status: "pass" | "fail" | "degraded";
  fallbackUsed: boolean;
}

export interface CostGuardrailOutcome {
  taskKind: TaskKind;
  decision: CostGuardrailDecision;
}

export interface LearningOutcome {
  taskKind: TaskKind;
  provider: ProviderId;
  confidence: number;
  totalSteps: number;
  preference: "preferred" | "neutral" | "avoided";
}

export interface GovernanceOutcome {
  templateKey: string;
  currentState: TemplateHealthState;
  decision: GovernanceDecision;
  consecutiveAtRiskOrDegraded: number;
}

export interface AutopilotOutcomeEntry {
  proposalId: string;
  domain: string;
  outcome: AutopilotOutcome;
  confidence: number;
}

export interface FactoryOutcomes {
  routingOutcomes: RoutingOutcome[];
  costGuardrailOutcomes: CostGuardrailOutcome[];
  learningOutcomes: LearningOutcome[];
  governanceOutcomes: GovernanceOutcome[];
  autopilotOutcomes: AutopilotOutcomeEntry[];
  currentMode: FactoryIntelligenceMode;
}

// ── Thresholds ──────────────────────────────────────────────

export const IMPROVEMENT_THRESHOLDS = {
  /** Min degraded/fail count in routing outcomes to trigger Rule A */
  routingDegradedMinCount: 3,
  /** Min score gap (recent - base) to suggest weight adjustment */
  routingScoreGapMinDelta: 0.05,

  /** Min downgrade/block count to trigger Rule B */
  costGuardrailMinBlockCount: 3,

  /** Max confidence considered "low" for Rule C */
  learningLowConfidenceMax: 0.4,
  /** Min total steps to consider learning data sufficient for Rule C */
  learningMinStepsForReview: 10,

  /** Min suppress-then-stable count for Rule D */
  safeModeSuppressionMinCount: 2,

  /** Min consecutive at_risk/degraded evaluations for Rule E */
  governanceStuckMinCount: 3,

  /** Min autopilot failure count per domain for Rule F */
  autopilotFailureMinCount: 2,
} as const;

// ── Rule A: Routing Weight Adjustment ───────────────────────

function detectRoutingImprovements(outcomes: RoutingOutcome[]): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];
  const byTaskKind = groupBy(outcomes, (o) => o.taskKind);

  for (const [taskKind, entries] of Object.entries(byTaskKind)) {
    const degradedOrFail = entries.filter((e) => e.status === "degraded" || e.status === "fail");

    if (degradedOrFail.length < IMPROVEMENT_THRESHOLDS.routingDegradedMinCount) continue;

    // Check if recent scores outperform base scores on average
    const withRecent = entries.filter((e) => e.recentScore != null);
    if (withRecent.length === 0) continue;

    const avgBase = avg(withRecent.map((e) => e.baseScore));
    const avgRecent = avg(withRecent.map((e) => e.recentScore!));
    const gap = avgRecent - avgBase;

    if (gap > IMPROVEMENT_THRESHOLDS.routingScoreGapMinDelta) {
      const confidence = clampConfidence(0.6 + gap * 2);
      proposals.push({
        id: `improve-routing-weight-${taskKind}`,
        subsystem: "provider_routing",
        priority: degradedOrFail.length >= 5 ? "high" : "medium",
        confidence,
        title: `Adjust ${taskKind} routing weight toward recent performance`,
        description: `Recent ${taskKind} runs show stronger correlation with recent metrics than base metrics. Consider increasing recent_score_weight.`,
        reasons: [
          `${taskKind} degraded/failed ${degradedOrFail.length} times in observed window`,
          `recent avg score (${avgRecent.toFixed(2)}) outperforms base avg score (${avgBase.toFixed(2)}) by ${gap.toFixed(2)}`,
          `fallback used in ${entries.filter((e) => e.fallbackUsed).length}/${entries.length} runs`,
        ],
        suggestedAction: {
          type: "tune_weight",
          target: "recent_score_weight",
          currentValue: 0.3,
          suggestedValue: Math.min(0.5, 0.3 + gap),
        },
      });
    }

    // Also check high fallback rate
    const fallbackRate = entries.filter((e) => e.fallbackUsed).length / entries.length;
    if (fallbackRate > 0.4 && degradedOrFail.length >= IMPROVEMENT_THRESHOLDS.routingDegradedMinCount) {
      proposals.push({
        id: `improve-routing-fallback-${taskKind}`,
        subsystem: "provider_routing",
        priority: fallbackRate > 0.6 ? "high" : "medium",
        confidence: clampConfidence(0.5 + fallbackRate * 0.3),
        title: `Review ${taskKind} primary provider selection`,
        description: `High fallback rate for ${taskKind} suggests the primary provider may not be the best choice.`,
        reasons: [
          `fallback used in ${(fallbackRate * 100).toFixed(0)}% of ${taskKind} runs`,
          `${degradedOrFail.length} degraded/failed runs observed`,
        ],
        suggestedAction: {
          type: "review_config",
          target: "primary_provider",
          currentValue: null,
          suggestedValue: null,
        },
      });
    }
  }

  return proposals;
}

// ── Rule B: Cost Guardrail Threshold Review ─────────────────

function detectCostGuardrailImprovements(outcomes: CostGuardrailOutcome[]): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];
  const byTaskKind = groupBy(outcomes, (o) => o.taskKind);

  for (const [taskKind, entries] of Object.entries(byTaskKind)) {
    const downgradedOrBlocked = entries.filter(
      (e) => e.decision.result === "downgraded" || e.decision.result === "blocked"
    );

    if (downgradedOrBlocked.length < IMPROVEMENT_THRESHOLDS.costGuardrailMinBlockCount) continue;

    const blockedCount = entries.filter((e) => e.decision.result === "blocked").length;
    const downgradedCount = entries.filter((e) => e.decision.result === "downgraded").length;

    const representativeDecision = downgradedOrBlocked[0].decision;
    const maxCostPerStep = representativeDecision.maxCostPerStep;

    const confidence = clampConfidence(
      0.5 + (downgradedOrBlocked.length / entries.length) * 0.4
    );

    proposals.push({
      id: `improve-cost-guardrail-${taskKind}`,
      subsystem: "cost_guardrail",
      priority: blockedCount >= 3 ? "high" : "medium",
      confidence,
      title: `Review ${taskKind} step budget threshold`,
      description: `Cost guardrail frequently ${blockedCount > 0 ? "blocks" : "downgrades"} ${taskKind} steps. Budget threshold may be too strict.`,
      reasons: [
        `${downgradedCount} downgrades and ${blockedCount} blocks observed for ${taskKind}`,
        `${downgradedOrBlocked.length}/${entries.length} decisions were constrained`,
        ...(maxCostPerStep != null ? [`current step limit: $${maxCostPerStep}`] : []),
      ],
      suggestedAction: {
        type: "adjust_threshold",
        target: "max_cost_per_step",
        currentValue: maxCostPerStep ?? null,
        suggestedValue: maxCostPerStep != null ? maxCostPerStep * 1.3 : null,
      },
    });
  }

  return proposals;
}

// ── Rule C: Learning Threshold Adjustment ───────────────────

function detectLearningImprovements(outcomes: LearningOutcome[]): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];
  const byTaskKind = groupBy(outcomes, (o) => o.taskKind);

  for (const [taskKind, entries] of Object.entries(byTaskKind)) {
    const lowConfidence = entries.filter(
      (e) =>
        e.confidence <= IMPROVEMENT_THRESHOLDS.learningLowConfidenceMax &&
        e.totalSteps >= IMPROVEMENT_THRESHOLDS.learningMinStepsForReview
    );

    if (lowConfidence.length === 0) continue;

    const avgConfidence = avg(lowConfidence.map((e) => e.confidence));
    const avgSteps = avg(lowConfidence.map((e) => e.totalSteps));

    proposals.push({
      id: `improve-learning-confidence-${taskKind}`,
      subsystem: "provider_learning",
      priority: avgSteps > 20 ? "high" : "medium",
      confidence: clampConfidence(0.55 + (1 - avgConfidence) * 0.3),
      title: `Review ${taskKind} learning confidence threshold`,
      description: `Learning confidence remains low for ${taskKind} despite sufficient observations. Consider expanding signal sources or adjusting thresholds.`,
      reasons: [
        `${lowConfidence.length} provider entries for ${taskKind} have low confidence`,
        `average confidence: ${avgConfidence.toFixed(2)} with avg ${avgSteps.toFixed(0)} steps`,
        `sufficient data available but preferences remain uncertain`,
      ],
      suggestedAction: {
        type: "expand_signal",
        target: "learning_confidence_threshold",
        currentValue: IMPROVEMENT_THRESHOLDS.learningLowConfidenceMax,
        suggestedValue: null,
      },
    });
  }

  return proposals;
}

// ── Rule D: Safe Mode Confidence Review ─────────────────────

function detectControlPlaneImprovements(
  outcomes: LearningOutcome[],
  currentMode: FactoryIntelligenceMode
): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];

  if (currentMode !== "safe") return proposals;

  // Find providers that are "avoided" with moderate confidence
  // but have decent step counts — they might be unnecessarily suppressed
  const avoidedWithData = outcomes.filter(
    (o) => o.preference === "avoided" && o.totalSteps >= 15 && o.confidence < 0.6
  );

  if (avoidedWithData.length < IMPROVEMENT_THRESHOLDS.safeModeSuppressionMinCount) return proposals;

  const byProvider = groupBy(avoidedWithData, (o) => o.provider);

  for (const [provider, entries] of Object.entries(byProvider)) {
    if (entries.length < IMPROVEMENT_THRESHOLDS.safeModeSuppressionMinCount) continue;

    const avgConf = avg(entries.map((e) => e.confidence));

    proposals.push({
      id: `improve-safe-mode-${provider}`,
      subsystem: "control_plane",
      priority: "medium",
      confidence: clampConfidence(0.5 + (1 - avgConf) * 0.25),
      title: `Review safe mode suppression of ${provider}`,
      description: `Safe mode avoids ${provider} for ${entries.length} task kinds, but avoidance confidence is moderate. Provider may be stable enough for safe mode.`,
      reasons: [
        `${provider} marked "avoided" for ${entries.map((e) => e.taskKind).join(", ")}`,
        `average avoidance confidence: ${avgConf.toFixed(2)} (below strong signal threshold)`,
        `sufficient data (${entries[0].totalSteps}+ steps) suggests signal is stable`,
      ],
      suggestedAction: {
        type: "adjust_threshold",
        target: "min_confidence_for_learning_boost",
        currentValue: 0.7,
        suggestedValue: 0.6,
      },
    });
  }

  return proposals;
}

// ── Rule E: Governance Regression Cadence ───────────────────

function detectGovernanceImprovements(outcomes: GovernanceOutcome[]): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];

  for (const outcome of outcomes) {
    if (outcome.consecutiveAtRiskOrDegraded < IMPROVEMENT_THRESHOLDS.governanceStuckMinCount) {
      continue;
    }

    const isStillActive = outcome.currentState === "at_risk" || outcome.currentState === "degraded";
    if (!isStillActive) continue;

    const priority: ImprovementPriority =
      outcome.currentState === "degraded" ? "high" : "medium";

    proposals.push({
      id: `improve-governance-${outcome.templateKey}`,
      subsystem: "governance",
      priority,
      confidence: clampConfidence(
        0.6 + outcome.consecutiveAtRiskOrDegraded * 0.05
      ),
      title: `Increase regression frequency for ${outcome.templateKey}`,
      description: `${outcome.templateKey} has been ${outcome.currentState} for ${outcome.consecutiveAtRiskOrDegraded} consecutive evaluations. Consider tighter regression cadence or governance review.`,
      reasons: [
        `${outcome.templateKey} stuck in ${outcome.currentState} for ${outcome.consecutiveAtRiskOrDegraded} evaluations`,
        `current decision: ${outcome.decision}`,
        `persistent instability suggests current regression cadence is insufficient`,
      ],
      suggestedAction: {
        type: "increase_frequency",
        target: "regression_cadence",
        currentValue: null,
        suggestedValue: null,
      },
    });
  }

  return proposals;
}

// ── Rule F: Autopilot Confidence Threshold ──────────────────

function detectAutopilotImprovements(outcomes: AutopilotOutcomeEntry[]): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];
  const byDomain = groupBy(outcomes, (o) => o.domain);

  for (const [domain, entries] of Object.entries(byDomain)) {
    const failures = entries.filter(
      (e) =>
        e.outcome === "failed_quality" ||
        e.outcome === "failed_baseline" ||
        e.outcome === "failed_pipeline"
    );

    if (failures.length < IMPROVEMENT_THRESHOLDS.autopilotFailureMinCount) continue;

    const avgConfidence = avg(failures.map((e) => e.confidence));
    const failureRate = failures.length / entries.length;

    proposals.push({
      id: `improve-autopilot-${domain}`,
      subsystem: "autopilot",
      priority: failureRate > 0.7 ? "high" : "medium",
      confidence: clampConfidence(0.5 + failureRate * 0.35),
      title: `Review autopilot threshold for ${domain} domain`,
      description: `Autopilot proposals in ${domain} domain frequently fail validation. Consider raising confidence threshold or strengthening blueprint hints.`,
      reasons: [
        `${failures.length}/${entries.length} autopilot proposals in ${domain} failed`,
        `failure types: ${Array.from(new Set(failures.map((f) => f.outcome))).join(", ")}`,
        `average proposal confidence: ${avgConfidence.toFixed(2)}`,
      ],
      suggestedAction: {
        type: "tighten_criteria",
        target: "autopilot_confidence_threshold",
        currentValue: 0.7,
        suggestedValue: Math.min(0.9, 0.7 + failureRate * 0.15),
      },
    });
  }

  return proposals;
}

// ── Priority Ranking ────────────────────────────────────────

const PRIORITY_ORDER: Record<ImprovementPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function compareProposals(a: ImprovementProposal, b: ImprovementProposal): number {
  // 1. Priority (lower order = higher priority)
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  // 2. Confidence (higher = better)
  const confDiff = b.confidence - a.confidence;
  if (Math.abs(confDiff) > 0.001) return confDiff;

  // 3. Stable tie-break by id
  return a.id.localeCompare(b.id);
}

// ── Utility ─────────────────────────────────────────────────

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ── Public API ──────────────────────────────────────────────

/**
 * Analyzes factory outcomes and returns categorized signals.
 * Step 1 of the self-improvement pipeline.
 */
export function analyzeFactoryOutcomes(outcomes: FactoryOutcomes): {
  routingIssueCount: number;
  costConstraintCount: number;
  learningWeakCount: number;
  governanceStuckCount: number;
  autopilotFailureCount: number;
} {
  const routingIssueCount = outcomes.routingOutcomes.filter(
    (o) => o.status === "degraded" || o.status === "fail"
  ).length;

  const costConstraintCount = outcomes.costGuardrailOutcomes.filter(
    (o) => o.decision.result === "downgraded" || o.decision.result === "blocked"
  ).length;

  const learningWeakCount = outcomes.learningOutcomes.filter(
    (o) =>
      o.confidence <= IMPROVEMENT_THRESHOLDS.learningLowConfidenceMax &&
      o.totalSteps >= IMPROVEMENT_THRESHOLDS.learningMinStepsForReview
  ).length;

  const governanceStuckCount = outcomes.governanceOutcomes.filter(
    (o) =>
      o.consecutiveAtRiskOrDegraded >= IMPROVEMENT_THRESHOLDS.governanceStuckMinCount &&
      (o.currentState === "at_risk" || o.currentState === "degraded")
  ).length;

  const autopilotFailureCount = outcomes.autopilotOutcomes.filter(
    (o) =>
      o.outcome === "failed_quality" ||
      o.outcome === "failed_baseline" ||
      o.outcome === "failed_pipeline"
  ).length;

  return {
    routingIssueCount,
    costConstraintCount,
    learningWeakCount,
    governanceStuckCount,
    autopilotFailureCount,
  };
}

/**
 * Detects improvement opportunities from factory outcomes.
 * Step 2 — generates all candidate proposals (unranked).
 */
export function detectImprovementOpportunities(
  outcomes: FactoryOutcomes
): ImprovementProposal[] {
  const proposals: ImprovementProposal[] = [];

  proposals.push(...detectRoutingImprovements(outcomes.routingOutcomes));
  proposals.push(...detectCostGuardrailImprovements(outcomes.costGuardrailOutcomes));
  proposals.push(...detectLearningImprovements(outcomes.learningOutcomes));
  proposals.push(
    ...detectControlPlaneImprovements(outcomes.learningOutcomes, outcomes.currentMode)
  );
  proposals.push(...detectGovernanceImprovements(outcomes.governanceOutcomes));
  proposals.push(...detectAutopilotImprovements(outcomes.autopilotOutcomes));

  return proposals;
}

/**
 * Alias for detectImprovementOpportunities.
 * Generates all candidate proposals from outcomes.
 */
export function generateImprovementProposals(
  outcomes: FactoryOutcomes
): ImprovementProposal[] {
  return detectImprovementOpportunities(outcomes);
}

/**
 * Ranks proposals by priority then confidence (deterministic).
 * Step 3 — produces the final ordered list.
 */
export function rankImprovementProposals(
  proposals: ImprovementProposal[]
): ImprovementProposal[] {
  return [...proposals].sort(compareProposals);
}

/**
 * Full self-improvement pipeline: analyze → detect → rank → report.
 */
export function buildSelfImprovementReport(
  outcomes: FactoryOutcomes
): ImprovementReport {
  const raw = detectImprovementOpportunities(outcomes);
  const ranked = rankImprovementProposals(raw);

  const subsystemBreakdown: Partial<Record<ImprovementSubsystem, number>> = {};
  for (const p of ranked) {
    subsystemBreakdown[p.subsystem] = (subsystemBreakdown[p.subsystem] ?? 0) + 1;
  }

  return {
    proposals: ranked,
    summary: {
      totalProposals: ranked.length,
      criticalCount: ranked.filter((p) => p.priority === "critical").length,
      highCount: ranked.filter((p) => p.priority === "high").length,
      mediumCount: ranked.filter((p) => p.priority === "medium").length,
      lowCount: ranked.filter((p) => p.priority === "low").length,
      subsystemBreakdown,
    },
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Formatting ──────────────────────────────────────────────

/**
 * Formats a single proposal for console output.
 */
export function formatProposal(p: ImprovementProposal): string {
  const lines: string[] = [];
  lines.push(`[${p.priority.toUpperCase()}] ${p.title}`);
  lines.push(`  ID:         ${p.id}`);
  lines.push(`  Subsystem:  ${p.subsystem}`);
  lines.push(`  Confidence: ${(p.confidence * 100).toFixed(0)}%`);
  lines.push(`  ${p.description}`);
  lines.push(`  Reasons:`);
  for (const r of p.reasons) {
    lines.push(`    - ${r}`);
  }
  lines.push(`  Action: ${p.suggestedAction.type} → ${p.suggestedAction.target}`);
  if (p.suggestedAction.currentValue != null) {
    lines.push(`    current: ${p.suggestedAction.currentValue}`);
  }
  if (p.suggestedAction.suggestedValue != null) {
    lines.push(`    suggested: ${p.suggestedAction.suggestedValue}`);
  }
  return lines.join("\n");
}

/**
 * Formats the full improvement report for console output.
 */
export function formatImprovementReport(report: ImprovementReport): string {
  const lines: string[] = [];
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("  Self-Improving Factory — Improvement Report");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push(`  Evaluated at: ${report.evaluatedAt}`);
  lines.push(`  Total proposals: ${report.summary.totalProposals}`);
  lines.push(
    `  Critical: ${report.summary.criticalCount}  High: ${report.summary.highCount}  Medium: ${report.summary.mediumCount}  Low: ${report.summary.lowCount}`
  );
  lines.push("");

  if (report.proposals.length === 0) {
    lines.push("  No improvement proposals generated.");
    lines.push("  Factory operating within expected parameters.");
  } else {
    for (let i = 0; i < report.proposals.length; i++) {
      lines.push(`── Proposal #${i + 1} ──────────────────────────────────`);
      lines.push(formatProposal(report.proposals[i]));
      lines.push("");
    }
  }

  lines.push("═══════════════════════════════════════════════════════════");
  return lines.join("\n");
}
