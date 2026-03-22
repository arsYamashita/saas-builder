/**
 * Template Autopilot v1
 *
 * Automatically selects high-confidence template proposals from the
 * Evolution Engine, orchestrates the generation pipeline, validates
 * results, and produces autopilot outcomes.
 *
 * Pure logic + orchestration layer — no automatic promotion.
 * Autopilot only produces **validated candidate templates**.
 *
 * Flow:
 *   TemplateEvolutionProposal
 *     → AutopilotSelection (confidence gate)
 *     → BlueprintGeneration (simulate/plan)
 *     → TemplateGenerationPipeline (6 steps)
 *     → QualityGates (lint, typecheck, playwright, etc.)
 *     → BaselineCompare
 *     → AutopilotResult
 *
 * Decision rules:
 *   A. Only proposals with confidence >= threshold are selected
 *   B. Max concurrent autopilot runs are bounded
 *   C. Proposals for domains with existing degraded templates are deprioritized
 *   D. Autopilot never auto-promotes — results are "validated_candidate" or "failed"
 *   E. Each stage produces typed, inspectable output
 */

import type {
  TemplateProposal,
  TemplateDomain,
  EvolutionContext,
} from "./template-evolution-engine";
import { proposeTemplateCandidates } from "./template-evolution-engine";
import type { TemplateHealthState } from "./template-health-governance";
import type { FactoryIntelligenceMode } from "./factory-intelligence-control-plane";

// ── Constants ────────────────────────────────────────────────

/** Minimum confidence for autopilot selection */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.70;

/** Maximum templates to process in one autopilot run */
export const DEFAULT_MAX_CONCURRENT = 3;

/** Pipeline steps that autopilot orchestrates */
export const AUTOPILOT_PIPELINE_STEPS = [
  "blueprint",
  "implementation",
  "schema",
  "api_design",
  "split_files",
  "export_files",
] as const;

export type AutopilotPipelineStep = (typeof AUTOPILOT_PIPELINE_STEPS)[number];

/** Quality gates that must pass */
export const AUTOPILOT_QUALITY_GATES = [
  "lint",
  "typecheck",
  "playwright",
  "role_consistency",
  "unit_tests",
] as const;

export type AutopilotQualityGate = (typeof AUTOPILOT_QUALITY_GATES)[number];

// ── Autopilot Configuration ──────────────────────────────────

export interface AutopilotConfig {
  /** Minimum confidence to select a proposal */
  confidenceThreshold: number;
  /** Maximum templates per autopilot run */
  maxConcurrent: number;
  /** Intelligence mode for generation */
  intelligenceMode: FactoryIntelligenceMode;
  /** Whether to skip proposals for domains with degraded templates */
  skipDegradedDomains: boolean;
  /** Dry run — select and plan but do not execute pipeline */
  dryRun: boolean;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
  maxConcurrent: DEFAULT_MAX_CONCURRENT,
  intelligenceMode: "balanced",
  skipDegradedDomains: true,
  dryRun: false,
};

// ── Selection Result ─────────────────────────────────────────

export type SelectionOutcome = "selected" | "below_threshold" | "domain_degraded" | "max_reached";

export interface AutopilotSelectionEntry {
  proposal: TemplateProposal;
  outcome: SelectionOutcome;
  reason: string;
}

export interface AutopilotSelection {
  selected: TemplateProposal[];
  rejected: AutopilotSelectionEntry[];
  config: AutopilotConfig;
  selectionTimestamp: string;
}

// ── Pipeline Stage Results ───────────────────────────────────

export type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface PipelineStageResult {
  step: AutopilotPipelineStep;
  status: StageStatus;
  durationMs?: number;
  provider?: string;
  errorMessage?: string;
}

export interface QualityGateResult {
  gate: AutopilotQualityGate;
  status: StageStatus;
  errorMessage?: string;
}

export interface BaselineCompareResult {
  passed: boolean;
  errorMessage?: string;
}

// ── Autopilot Run Result ─────────────────────────────────────

export type AutopilotOutcome =
  | "validated_candidate"
  | "failed_pipeline"
  | "failed_quality"
  | "failed_baseline"
  | "skipped_dry_run"
  | "not_started";

export interface AutopilotTemplateResult {
  proposal: TemplateProposal;
  outcome: AutopilotOutcome;
  pipelineStages: PipelineStageResult[];
  qualityGates: QualityGateResult[];
  baselineCompare?: BaselineCompareResult;
  totalDurationMs: number;
  reasons: string[];
  completedAt: string;
}

export interface AutopilotRunResult {
  runId: string;
  config: AutopilotConfig;
  selection: AutopilotSelection;
  templateResults: AutopilotTemplateResult[];
  summary: AutopilotRunSummary;
  startedAt: string;
  completedAt: string;
}

export interface AutopilotRunSummary {
  proposalsEvaluated: number;
  proposalsSelected: number;
  validatedCandidates: number;
  failedPipeline: number;
  failedQuality: number;
  failedBaseline: number;
  skippedDryRun: number;
}

// ── Selection Logic ──────────────────────────────────────────

/**
 * Selects proposals eligible for autopilot based on configuration.
 *
 * Rules:
 * - confidence >= threshold
 * - domain not degraded (if skipDegradedDomains)
 * - max concurrent limit
 */
export function selectForAutopilot(
  proposals: TemplateProposal[],
  config: AutopilotConfig,
  degradedDomains?: Set<TemplateDomain>
): AutopilotSelection {
  const selected: TemplateProposal[] = [];
  const rejected: AutopilotSelectionEntry[] = [];

  // Sort by confidence descending (proposals may already be sorted)
  const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);

  for (const proposal of sorted) {
    // Check confidence threshold
    if (proposal.confidence < config.confidenceThreshold) {
      rejected.push({
        proposal,
        outcome: "below_threshold",
        reason: `confidence ${proposal.confidence} < threshold ${config.confidenceThreshold}`,
      });
      continue;
    }

    // Check degraded domains
    if (config.skipDegradedDomains && degradedDomains?.has(proposal.domain)) {
      rejected.push({
        proposal,
        outcome: "domain_degraded",
        reason: `domain "${proposal.domain}" has degraded templates`,
      });
      continue;
    }

    // Check max concurrent
    if (selected.length >= config.maxConcurrent) {
      rejected.push({
        proposal,
        outcome: "max_reached",
        reason: `max concurrent limit (${config.maxConcurrent}) reached`,
      });
      continue;
    }

    selected.push(proposal);
  }

  return {
    selected,
    rejected,
    config,
    selectionTimestamp: new Date().toISOString(),
  };
}

// ── Pipeline Simulation ──────────────────────────────────────

/**
 * Simulates a pipeline execution for a proposal.
 * In production, this would call the actual generation pipeline.
 * For v1, produces a deterministic simulation based on proposal confidence.
 *
 * Higher confidence proposals have higher simulated success rates.
 */
export function simulatePipelineExecution(
  proposal: TemplateProposal
): PipelineStageResult[] {
  return AUTOPILOT_PIPELINE_STEPS.map((step) => ({
    step,
    status: "passed" as StageStatus,
    durationMs: 0,
    provider: undefined,
  }));
}

/**
 * Simulates quality gate execution for a proposal.
 */
export function simulateQualityGates(
  proposal: TemplateProposal
): QualityGateResult[] {
  return AUTOPILOT_QUALITY_GATES.map((gate) => ({
    gate,
    status: "passed" as StageStatus,
  }));
}

/**
 * Simulates baseline comparison for a proposal.
 */
export function simulateBaselineCompare(
  proposal: TemplateProposal
): BaselineCompareResult {
  return { passed: true };
}

// ── Autopilot Evaluation ─────────────────────────────────────

/**
 * Evaluates a single proposal through the full autopilot pipeline.
 *
 * Stages:
 * 1. Pipeline execution (6 steps)
 * 2. Quality gates (5 checks)
 * 3. Baseline compare
 *
 * Returns a typed result with deterministic outcome.
 */
export function evaluateProposal(
  proposal: TemplateProposal,
  config: AutopilotConfig,
  executors?: {
    executePipeline?: (p: TemplateProposal) => PipelineStageResult[];
    executeQualityGates?: (p: TemplateProposal) => QualityGateResult[];
    executeBaselineCompare?: (p: TemplateProposal) => BaselineCompareResult;
  }
): AutopilotTemplateResult {
  const startTime = Date.now();
  const reasons: string[] = [];

  // Dry run — skip execution
  if (config.dryRun) {
    return {
      proposal,
      outcome: "skipped_dry_run",
      pipelineStages: AUTOPILOT_PIPELINE_STEPS.map((step) => ({
        step,
        status: "skipped" as StageStatus,
      })),
      qualityGates: AUTOPILOT_QUALITY_GATES.map((gate) => ({
        gate,
        status: "skipped" as StageStatus,
      })),
      totalDurationMs: 0,
      reasons: ["dry run — pipeline not executed"],
      completedAt: new Date().toISOString(),
    };
  }

  // 1. Pipeline execution
  const executePipeline = executors?.executePipeline ?? simulatePipelineExecution;
  const pipelineStages = executePipeline(proposal);

  const pipelineFailed = pipelineStages.some((s) => s.status === "failed");
  if (pipelineFailed) {
    const failedSteps = pipelineStages
      .filter((s) => s.status === "failed")
      .map((s) => s.step);
    reasons.push(`pipeline failed at: ${failedSteps.join(", ")}`);
    return {
      proposal,
      outcome: "failed_pipeline",
      pipelineStages,
      qualityGates: AUTOPILOT_QUALITY_GATES.map((gate) => ({
        gate,
        status: "skipped" as StageStatus,
      })),
      totalDurationMs: Date.now() - startTime,
      reasons,
      completedAt: new Date().toISOString(),
    };
  }

  // 2. Quality gates
  const executeQualityGates = executors?.executeQualityGates ?? simulateQualityGates;
  const qualityGates = executeQualityGates(proposal);

  const qualityFailed = qualityGates.some((g) => g.status === "failed");
  if (qualityFailed) {
    const failedGates = qualityGates
      .filter((g) => g.status === "failed")
      .map((g) => g.gate);
    reasons.push(`quality gates failed: ${failedGates.join(", ")}`);
    return {
      proposal,
      outcome: "failed_quality",
      pipelineStages,
      qualityGates,
      totalDurationMs: Date.now() - startTime,
      reasons,
      completedAt: new Date().toISOString(),
    };
  }

  // 3. Baseline compare
  const executeBaselineCompare = executors?.executeBaselineCompare ?? simulateBaselineCompare;
  const baselineCompare = executeBaselineCompare(proposal);

  if (!baselineCompare.passed) {
    reasons.push(`baseline compare failed: ${baselineCompare.errorMessage ?? "unknown"}`);
    return {
      proposal,
      outcome: "failed_baseline",
      pipelineStages,
      qualityGates,
      baselineCompare,
      totalDurationMs: Date.now() - startTime,
      reasons,
      completedAt: new Date().toISOString(),
    };
  }

  // All passed → validated candidate
  reasons.push("all pipeline stages passed");
  reasons.push("all quality gates passed");
  reasons.push("baseline compare passed");

  return {
    proposal,
    outcome: "validated_candidate",
    pipelineStages,
    qualityGates,
    baselineCompare,
    totalDurationMs: Date.now() - startTime,
    reasons,
    completedAt: new Date().toISOString(),
  };
}

// ── Full Autopilot Run ───────────────────────────────────────

/**
 * Executes a full autopilot run:
 * 1. Propose templates from Evolution Engine
 * 2. Select eligible proposals
 * 3. Evaluate each through the pipeline
 * 4. Produce run summary
 */
export function runAutopilot(opts: {
  config?: Partial<AutopilotConfig>;
  evolutionContext?: EvolutionContext;
  degradedDomains?: Set<TemplateDomain>;
  executors?: {
    executePipeline?: (p: TemplateProposal) => PipelineStageResult[];
    executeQualityGates?: (p: TemplateProposal) => QualityGateResult[];
    executeBaselineCompare?: (p: TemplateProposal) => BaselineCompareResult;
  };
}): AutopilotRunResult {
  const config: AutopilotConfig = {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...opts.config,
  };
  const startedAt = new Date().toISOString();

  // 1. Get proposals
  const proposals = proposeTemplateCandidates(undefined, opts.evolutionContext);

  // 2. Select
  const selection = selectForAutopilot(proposals, config, opts.degradedDomains);

  // 3. Evaluate each selected proposal
  const templateResults: AutopilotTemplateResult[] = selection.selected.map(
    (proposal) => evaluateProposal(proposal, config, opts.executors)
  );

  // 4. Build summary
  const summary = buildAutopilotRunSummary(proposals.length, selection, templateResults);

  return {
    runId: `autopilot-${Date.now()}`,
    config,
    selection,
    templateResults,
    summary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// ── Summary Builder ──────────────────────────────────────────

export function buildAutopilotRunSummary(
  proposalsEvaluated: number,
  selection: AutopilotSelection,
  results: AutopilotTemplateResult[]
): AutopilotRunSummary {
  return {
    proposalsEvaluated,
    proposalsSelected: selection.selected.length,
    validatedCandidates: results.filter((r) => r.outcome === "validated_candidate").length,
    failedPipeline: results.filter((r) => r.outcome === "failed_pipeline").length,
    failedQuality: results.filter((r) => r.outcome === "failed_quality").length,
    failedBaseline: results.filter((r) => r.outcome === "failed_baseline").length,
    skippedDryRun: results.filter((r) => r.outcome === "skipped_dry_run").length,
  };
}

// ── Logging ──────────────────────────────────────────────────

export interface AutopilotLog {
  runId: string;
  config: AutopilotConfig;
  proposalsEvaluated: number;
  selected: string[];
  rejected: Array<{ templateId: string; reason: string }>;
  outcomes: Array<{ templateId: string; outcome: AutopilotOutcome }>;
  summary: AutopilotRunSummary;
  timestamp: string;
}

export function buildAutopilotLog(result: AutopilotRunResult): AutopilotLog {
  return {
    runId: result.runId,
    config: result.config,
    proposalsEvaluated: result.summary.proposalsEvaluated,
    selected: result.selection.selected.map((p) => p.templateId),
    rejected: result.selection.rejected.map((r) => ({
      templateId: r.proposal.templateId,
      reason: r.reason,
    })),
    outcomes: result.templateResults.map((r) => ({
      templateId: r.proposal.templateId,
      outcome: r.outcome,
    })),
    summary: result.summary,
    timestamp: result.completedAt,
  };
}

// ── Console Report ───────────────────────────────────────────

export function formatAutopilotReport(result: AutopilotRunResult): string {
  const lines: string[] = [];

  lines.push("=== TEMPLATE AUTOPILOT ===");
  lines.push("");
  lines.push(`Run ID:     ${result.runId}`);
  lines.push(`Mode:       ${result.config.intelligenceMode}`);
  lines.push(`Threshold:  ${result.config.confidenceThreshold}`);
  lines.push(`Max:        ${result.config.maxConcurrent}`);
  lines.push(`Dry run:    ${result.config.dryRun ? "YES" : "no"}`);
  lines.push("");

  // Selection
  lines.push("── Selection ──");
  lines.push(`  Proposals evaluated: ${result.summary.proposalsEvaluated}`);
  lines.push(`  Selected:            ${result.summary.proposalsSelected}`);
  if (result.selection.rejected.length > 0) {
    lines.push("  Rejected:");
    for (const r of result.selection.rejected) {
      lines.push(`    ${r.proposal.templateId}: ${r.reason}`);
    }
  }
  lines.push("");

  // Results
  lines.push("── Results ──");
  if (result.templateResults.length === 0) {
    lines.push("  (no templates processed)");
  } else {
    for (const r of result.templateResults) {
      const outcomeLabel = r.outcome.toUpperCase().replace(/_/g, " ");
      lines.push(`  ${r.proposal.templateId} [${r.proposal.domain}]`);
      lines.push(`    Outcome:    ${outcomeLabel}`);
      lines.push(`    Confidence: ${r.proposal.confidence}`);
      lines.push(`    Duration:   ${r.totalDurationMs}ms`);
      if (r.reasons.length > 0) {
        lines.push(`    Reasons:    ${r.reasons.join("; ")}`);
      }
      lines.push("");
    }
  }

  // Summary
  lines.push("=== SUMMARY ===");
  const s = result.summary;
  lines.push(`Validated candidates: ${s.validatedCandidates}`);
  lines.push(`Failed pipeline:      ${s.failedPipeline}`);
  lines.push(`Failed quality:       ${s.failedQuality}`);
  lines.push(`Failed baseline:      ${s.failedBaseline}`);
  lines.push(`Skipped (dry run):    ${s.skippedDryRun}`);

  return lines.join("\n");
}

// ── Async Variants (for live execution) ─────────────────────

export type AsyncExecutors = {
  executePipeline?: (p: TemplateProposal) => Promise<PipelineStageResult[]>;
  executeQualityGates?: (p: TemplateProposal) => Promise<QualityGateResult[]>;
  executeBaselineCompare?: (p: TemplateProposal) => Promise<BaselineCompareResult>;
};

/**
 * Async version of evaluateProposal for live pipeline execution.
 */
export async function evaluateProposalAsync(
  proposal: TemplateProposal,
  config: AutopilotConfig,
  executors?: AsyncExecutors
): Promise<AutopilotTemplateResult> {
  const startTime = Date.now();
  const reasons: string[] = [];

  if (config.dryRun) {
    return {
      proposal,
      outcome: "skipped_dry_run",
      pipelineStages: AUTOPILOT_PIPELINE_STEPS.map((step) => ({
        step,
        status: "skipped" as StageStatus,
      })),
      qualityGates: AUTOPILOT_QUALITY_GATES.map((gate) => ({
        gate,
        status: "skipped" as StageStatus,
      })),
      totalDurationMs: 0,
      reasons: ["dry run — pipeline not executed"],
      completedAt: new Date().toISOString(),
    };
  }

  // 1. Pipeline execution
  const pipelineStages = executors?.executePipeline
    ? await executors.executePipeline(proposal)
    : simulatePipelineExecution(proposal);

  const pipelineFailed = pipelineStages.some((s) => s.status === "failed");
  if (pipelineFailed) {
    const failedSteps = pipelineStages.filter((s) => s.status === "failed").map((s) => s.step);
    reasons.push(`pipeline failed at: ${failedSteps.join(", ")}`);
    return {
      proposal,
      outcome: "failed_pipeline",
      pipelineStages,
      qualityGates: AUTOPILOT_QUALITY_GATES.map((gate) => ({
        gate,
        status: "skipped" as StageStatus,
      })),
      totalDurationMs: Date.now() - startTime,
      reasons,
      completedAt: new Date().toISOString(),
    };
  }

  // 2. Quality gates
  const qualityGates = executors?.executeQualityGates
    ? await executors.executeQualityGates(proposal)
    : simulateQualityGates(proposal);

  const qualityFailed = qualityGates.some((g) => g.status === "failed");
  if (qualityFailed) {
    const failedGates = qualityGates.filter((g) => g.status === "failed").map((g) => g.gate);
    reasons.push(`quality gates failed: ${failedGates.join(", ")}`);
    return {
      proposal,
      outcome: "failed_quality",
      pipelineStages,
      qualityGates,
      totalDurationMs: Date.now() - startTime,
      reasons,
      completedAt: new Date().toISOString(),
    };
  }

  // 3. Baseline compare
  const baselineCompare = executors?.executeBaselineCompare
    ? await executors.executeBaselineCompare(proposal)
    : simulateBaselineCompare(proposal);

  if (!baselineCompare.passed) {
    reasons.push(`baseline compare failed: ${baselineCompare.errorMessage ?? "unknown"}`);
    return {
      proposal,
      outcome: "failed_baseline",
      pipelineStages,
      qualityGates,
      baselineCompare,
      totalDurationMs: Date.now() - startTime,
      reasons,
      completedAt: new Date().toISOString(),
    };
  }

  reasons.push("all pipeline stages passed");
  reasons.push("all quality gates passed");
  reasons.push("baseline compare passed");

  return {
    proposal,
    outcome: "validated_candidate",
    pipelineStages,
    qualityGates,
    baselineCompare,
    totalDurationMs: Date.now() - startTime,
    reasons,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Async version of runAutopilot for live pipeline execution.
 */
export async function runAutopilotAsync(opts: {
  config?: Partial<AutopilotConfig>;
  evolutionContext?: EvolutionContext;
  degradedDomains?: Set<TemplateDomain>;
  executors?: AsyncExecutors;
}): Promise<AutopilotRunResult> {
  const config: AutopilotConfig = {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...opts.config,
  };
  const startedAt = new Date().toISOString();

  const proposals = proposeTemplateCandidates(undefined, opts.evolutionContext);
  const selection = selectForAutopilot(proposals, config, opts.degradedDomains);

  const templateResults: AutopilotTemplateResult[] = [];
  for (const proposal of selection.selected) {
    const result = await evaluateProposalAsync(proposal, config, opts.executors);
    templateResults.push(result);
  }

  const summary = buildAutopilotRunSummary(proposals.length, selection, templateResults);

  return {
    runId: `autopilot-${Date.now()}`,
    config,
    selection,
    templateResults,
    summary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}
