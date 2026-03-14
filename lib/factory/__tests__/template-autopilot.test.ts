/**
 * Template Autopilot v1 — Unit Tests
 *
 * Covers:
 * - Selection logic (confidence gate, domain degradation, max limit)
 * - Pipeline evaluation (pass, fail at each stage)
 * - Dry run behavior
 * - Custom executors for pipeline/quality/baseline
 * - Full autopilot run
 * - Summary aggregation
 * - Deterministic output
 * - Report formatting
 */

import { describe, it, expect } from "vitest";
import type { TemplateProposal, TemplateDomain } from "../template-evolution-engine";
import {
  selectForAutopilot,
  evaluateProposal,
  runAutopilot,
  buildAutopilotRunSummary,
  buildAutopilotLog,
  formatAutopilotReport,
  DEFAULT_AUTOPILOT_CONFIG,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_CONCURRENT,
  AUTOPILOT_PIPELINE_STEPS,
  AUTOPILOT_QUALITY_GATES,
  type AutopilotConfig,
  type PipelineStageResult,
  type QualityGateResult,
  type BaselineCompareResult,
  type StageStatus,
} from "../template-autopilot";

// ── Helpers ──────────────────────────────────────────────────

function makeProposal(overrides: Partial<TemplateProposal> & {
  templateId: string;
  confidence: number;
}): TemplateProposal {
  return {
    domain: "support" as TemplateDomain,
    description: "test proposal",
    relatedTemplates: [],
    reasons: ["test reason"],
    suggestedPipelineConfig: {
      blueprintHints: [],
      schemaHints: [],
      apiHints: [],
    },
    ...overrides,
  };
}

function defaultConfig(overrides?: Partial<AutopilotConfig>): AutopilotConfig {
  return { ...DEFAULT_AUTOPILOT_CONFIG, ...overrides };
}

// ── Selection Logic ──────────────────────────────────────────

describe("selectForAutopilot", () => {
  it("selects proposals above confidence threshold", () => {
    const proposals = [
      makeProposal({ templateId: "high", confidence: 0.85 }),
      makeProposal({ templateId: "low", confidence: 0.50 }),
    ];
    const result = selectForAutopilot(proposals, defaultConfig());

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].templateId).toBe("high");
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].outcome).toBe("below_threshold");
  });

  it("rejects proposals for degraded domains", () => {
    const proposals = [
      makeProposal({ templateId: "a", confidence: 0.90, domain: "support" as TemplateDomain }),
    ];
    const degraded = new Set<TemplateDomain>(["support"]);
    const result = selectForAutopilot(proposals, defaultConfig(), degraded);

    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0].outcome).toBe("domain_degraded");
  });

  it("does not reject degraded domains when skipDegradedDomains is false", () => {
    const proposals = [
      makeProposal({ templateId: "a", confidence: 0.90, domain: "support" as TemplateDomain }),
    ];
    const degraded = new Set<TemplateDomain>(["support"]);
    const result = selectForAutopilot(
      proposals,
      defaultConfig({ skipDegradedDomains: false }),
      degraded
    );

    expect(result.selected).toHaveLength(1);
  });

  it("enforces max concurrent limit", () => {
    const proposals = [
      makeProposal({ templateId: "a", confidence: 0.90 }),
      makeProposal({ templateId: "b", confidence: 0.85 }),
      makeProposal({ templateId: "c", confidence: 0.80 }),
      makeProposal({ templateId: "d", confidence: 0.75 }),
    ];
    const result = selectForAutopilot(proposals, defaultConfig({ maxConcurrent: 2 }));

    expect(result.selected).toHaveLength(2);
    expect(result.selected[0].templateId).toBe("a");
    expect(result.selected[1].templateId).toBe("b");
    expect(result.rejected.filter((r) => r.outcome === "max_reached")).toHaveLength(2);
  });

  it("selects highest confidence first", () => {
    const proposals = [
      makeProposal({ templateId: "low", confidence: 0.72 }),
      makeProposal({ templateId: "high", confidence: 0.95 }),
      makeProposal({ templateId: "mid", confidence: 0.80 }),
    ];
    const result = selectForAutopilot(proposals, defaultConfig({ maxConcurrent: 2 }));

    expect(result.selected[0].templateId).toBe("high");
    expect(result.selected[1].templateId).toBe("mid");
  });

  it("selects nothing when all below threshold", () => {
    const proposals = [
      makeProposal({ templateId: "a", confidence: 0.50 }),
      makeProposal({ templateId: "b", confidence: 0.30 }),
    ];
    const result = selectForAutopilot(proposals, defaultConfig());

    expect(result.selected).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });
});

// ── Pipeline Evaluation ──────────────────────────────────────

describe("evaluateProposal", () => {
  it("returns validated_candidate when all stages pass", () => {
    const proposal = makeProposal({ templateId: "test", confidence: 0.85 });
    const result = evaluateProposal(proposal, defaultConfig());

    expect(result.outcome).toBe("validated_candidate");
    expect(result.pipelineStages.every((s) => s.status === "passed")).toBe(true);
    expect(result.qualityGates.every((g) => g.status === "passed")).toBe(true);
    expect(result.baselineCompare?.passed).toBe(true);
    expect(result.reasons).toContain("all pipeline stages passed");
    expect(result.reasons).toContain("all quality gates passed");
    expect(result.reasons).toContain("baseline compare passed");
  });

  it("returns failed_pipeline when pipeline step fails", () => {
    const proposal = makeProposal({ templateId: "test", confidence: 0.85 });
    const failingPipeline = (): PipelineStageResult[] =>
      AUTOPILOT_PIPELINE_STEPS.map((step) => ({
        step,
        status: (step === "schema" ? "failed" : "passed") as StageStatus,
        errorMessage: step === "schema" ? "schema generation failed" : undefined,
      }));

    const result = evaluateProposal(proposal, defaultConfig(), {
      executePipeline: failingPipeline,
    });

    expect(result.outcome).toBe("failed_pipeline");
    expect(result.reasons.some((r) => r.includes("schema"))).toBe(true);
    // Quality gates should be skipped when pipeline fails
    expect(result.qualityGates.every((g) => g.status === "skipped")).toBe(true);
  });

  it("returns failed_quality when quality gate fails", () => {
    const proposal = makeProposal({ templateId: "test", confidence: 0.85 });
    const failingGates = (): QualityGateResult[] =>
      AUTOPILOT_QUALITY_GATES.map((gate) => ({
        gate,
        status: (gate === "typecheck" ? "failed" : "passed") as StageStatus,
        errorMessage: gate === "typecheck" ? "type errors found" : undefined,
      }));

    const result = evaluateProposal(proposal, defaultConfig(), {
      executeQualityGates: failingGates,
    });

    expect(result.outcome).toBe("failed_quality");
    expect(result.reasons.some((r) => r.includes("typecheck"))).toBe(true);
  });

  it("returns failed_baseline when baseline compare fails", () => {
    const proposal = makeProposal({ templateId: "test", confidence: 0.85 });
    const failingBaseline = (): BaselineCompareResult => ({
      passed: false,
      errorMessage: "schema drift detected",
    });

    const result = evaluateProposal(proposal, defaultConfig(), {
      executeBaselineCompare: failingBaseline,
    });

    expect(result.outcome).toBe("failed_baseline");
    expect(result.reasons.some((r) => r.includes("baseline compare failed"))).toBe(true);
  });

  it("returns skipped_dry_run when dry run is enabled", () => {
    const proposal = makeProposal({ templateId: "test", confidence: 0.85 });
    const result = evaluateProposal(proposal, defaultConfig({ dryRun: true }));

    expect(result.outcome).toBe("skipped_dry_run");
    expect(result.pipelineStages.every((s) => s.status === "skipped")).toBe(true);
    expect(result.qualityGates.every((g) => g.status === "skipped")).toBe(true);
    expect(result.totalDurationMs).toBe(0);
  });
});

// ── Full Autopilot Run ───────────────────────────────────────

describe("runAutopilot", () => {
  it("runs full autopilot and produces results", () => {
    const result = runAutopilot({
      evolutionContext: { greenTemplateCount: 5 },
    });

    expect(result.runId).toContain("autopilot-");
    expect(result.config).toBeDefined();
    expect(result.selection.selected.length).toBeGreaterThan(0);
    expect(result.templateResults.length).toBeGreaterThan(0);
    expect(result.summary.proposalsEvaluated).toBeGreaterThan(0);
    expect(result.summary.validatedCandidates).toBeGreaterThan(0);
  });

  it("dry run selects but does not execute", () => {
    const result = runAutopilot({
      config: { dryRun: true },
      evolutionContext: { greenTemplateCount: 5 },
    });

    expect(result.selection.selected.length).toBeGreaterThan(0);
    expect(result.summary.skippedDryRun).toBe(result.selection.selected.length);
    expect(result.summary.validatedCandidates).toBe(0);
  });

  it("respects max concurrent setting", () => {
    const result = runAutopilot({
      config: { maxConcurrent: 1 },
      evolutionContext: { greenTemplateCount: 5 },
    });

    expect(result.selection.selected.length).toBeLessThanOrEqual(1);
    expect(result.templateResults.length).toBeLessThanOrEqual(1);
  });

  it("high threshold reduces selections", () => {
    const result = runAutopilot({
      config: { confidenceThreshold: 0.99 },
      evolutionContext: { greenTemplateCount: 5 },
    });

    expect(result.selection.selected.length).toBe(0);
    expect(result.templateResults.length).toBe(0);
  });
});

// ── Summary Aggregation ──────────────────────────────────────

describe("buildAutopilotRunSummary", () => {
  it("aggregates outcomes correctly", () => {
    const proposals = [
      makeProposal({ templateId: "a", confidence: 0.90 }),
      makeProposal({ templateId: "b", confidence: 0.80 }),
    ];
    const selection = selectForAutopilot(proposals, defaultConfig());

    const results = [
      evaluateProposal(proposals[0], defaultConfig()),
      evaluateProposal(proposals[1], defaultConfig(), {
        executePipeline: () =>
          AUTOPILOT_PIPELINE_STEPS.map((step) => ({
            step,
            status: (step === "blueprint" ? "failed" : "passed") as StageStatus,
          })),
      }),
    ];

    const summary = buildAutopilotRunSummary(5, selection, results);
    expect(summary.proposalsEvaluated).toBe(5);
    expect(summary.proposalsSelected).toBe(2);
    expect(summary.validatedCandidates).toBe(1);
    expect(summary.failedPipeline).toBe(1);
  });
});

// ── Deterministic Output ─────────────────────────────────────

describe("determinism", () => {
  it("same config produces same selection", () => {
    const proposals = [
      makeProposal({ templateId: "a", confidence: 0.90 }),
      makeProposal({ templateId: "b", confidence: 0.80 }),
      makeProposal({ templateId: "c", confidence: 0.50 }),
    ];

    const r1 = selectForAutopilot(proposals, defaultConfig());
    const r2 = selectForAutopilot(proposals, defaultConfig());

    expect(r1.selected.map((p) => p.templateId)).toEqual(
      r2.selected.map((p) => p.templateId)
    );
    expect(r1.rejected.map((r) => r.proposal.templateId)).toEqual(
      r2.rejected.map((r) => r.proposal.templateId)
    );
  });
});

// ── Logging ──────────────────────────────────────────────────

describe("buildAutopilotLog", () => {
  it("produces structured log from run result", () => {
    const result = runAutopilot({
      config: { dryRun: true },
      evolutionContext: { greenTemplateCount: 5 },
    });
    const log = buildAutopilotLog(result);

    expect(log.runId).toBe(result.runId);
    expect(log.selected.length).toBeGreaterThan(0);
    expect(log.summary).toBeDefined();
    expect(log.timestamp).toBeDefined();
  });
});

// ── Report Formatting ────────────────────────────────────────

describe("formatAutopilotReport", () => {
  it("produces readable report", () => {
    const result = runAutopilot({
      evolutionContext: { greenTemplateCount: 5 },
    });
    const report = formatAutopilotReport(result);

    expect(report).toContain("TEMPLATE AUTOPILOT");
    expect(report).toContain("Selection");
    expect(report).toContain("Results");
    expect(report).toContain("SUMMARY");
    expect(report).toContain("Validated candidates:");
  });
});

// ── Default Config ───────────────────────────────────────────

describe("default config", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_CONFIDENCE_THRESHOLD).toBe(0.70);
    expect(DEFAULT_MAX_CONCURRENT).toBe(3);
    expect(DEFAULT_AUTOPILOT_CONFIG.intelligenceMode).toBe("balanced");
    expect(DEFAULT_AUTOPILOT_CONFIG.skipDegradedDomains).toBe(true);
    expect(DEFAULT_AUTOPILOT_CONFIG.dryRun).toBe(false);
  });

  it("pipeline and quality gate lists are complete", () => {
    expect(AUTOPILOT_PIPELINE_STEPS).toHaveLength(6);
    expect(AUTOPILOT_QUALITY_GATES).toHaveLength(5);
  });
});
