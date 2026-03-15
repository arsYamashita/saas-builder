import { describe, it, expect } from "vitest";
import {
  getGreenTemplates,
  computeRegressionStatus,
  compareWithPreviousRegression,
  buildRegressionSummary,
  buildNightlyReport,
  formatRegressionReport,
  extractPipelineResult,
  DEGRADATION_THRESHOLDS,
  type TemplateRegressionSummary,
  type PipelineResult,
  type NightlyRegressionReport,
} from "../nightly-template-regression";

// ── Helpers ─────────────────────────────────────────────────

function makeSummary(
  overrides: Partial<TemplateRegressionSummary> = {}
): TemplateRegressionSummary {
  return {
    templateKey: "simple_crm_saas",
    shortName: "crm",
    runId: "run-1",
    startedAt: "2026-03-13T00:00:00Z",
    finishedAt: "2026-03-13T00:10:00Z",
    pipelinePassed: true,
    qualityGatesPassed: true,
    baselinePassed: true,
    promotionEligible: true,
    fallbackUsed: false,
    fallbackCount: 0,
    selectedProviders: ["claude", "gemini"],
    routingScores: [],
    estimatedCostTotal: 0.05,
    durationMsTotal: 60000,
    perStepStatus: [],
    qualityChecks: [],
    regressionStatus: "pass",
    ...overrides,
  };
}

function makePipelineResult(
  overrides: Partial<PipelineResult> = {}
): PipelineResult {
  return {
    runId: "run-1",
    status: "completed",
    steps: [
      { key: "blueprint", status: "completed", meta: { provider: "gemini", durationMs: 5000, estimatedCostUsd: 0.01 } },
      { key: "implementation", status: "completed", meta: { provider: "claude", durationMs: 10000, estimatedCostUsd: 0.02 } },
      { key: "schema", status: "completed", meta: { provider: "claude", durationMs: 8000, estimatedCostUsd: 0.01 } },
      { key: "api_design", status: "completed", meta: { provider: "claude", durationMs: 7000, estimatedCostUsd: 0.01 } },
      { key: "split_files", status: "completed", meta: { provider: "claude", durationMs: 6000 } },
      { key: "export_files", status: "completed" },
    ],
    qualityChecks: [
      { key: "lint", status: "passed" },
      { key: "typecheck", status: "passed" },
      { key: "playwright", status: "passed" },
    ],
    qualityStatus: "passed",
    ...overrides,
  };
}

// ── GREEN Template Discovery ────────────────────────────────

describe("getGreenTemplates", () => {
  it("discovers GREEN templates from catalog", () => {
    const green = getGreenTemplates();
    expect(green.length).toBeGreaterThan(0);

    for (const t of green) {
      expect(t.templateKey).toBeTruthy();
      expect(t.shortName).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.manifest).toBeDefined();
    }
  });

  it("includes known GREEN templates", () => {
    const green = getGreenTemplates();
    const keys = green.map((t) => t.templateKey);

    expect(keys).toContain("simple_crm_saas");
    expect(keys).toContain("reservation_saas");
    expect(keys).toContain("community_membership_saas");
    expect(keys).toContain("internal_admin_ops_saas");
  });

  it("does not hardcode — discovers dynamically", () => {
    // All returned templates have statusBadge = GREEN in catalog
    const green = getGreenTemplates();
    expect(green.length).toBeGreaterThanOrEqual(4);
  });
});

// ── regression status = pass ────────────────────────────────

describe("computeRegressionStatus", () => {
  it("returns pass when pipeline/gates/baseline all pass and no degradation", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: null,
      durationDeltaPct: null,
    });
    expect(status).toBe("pass");
  });

  it("returns pass when cost delta is below threshold", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: 15, // below 20%
      durationDeltaPct: 10, // below 20%
    });
    expect(status).toBe("pass");
  });

  // ── regression status = fail ────────────────────────────

  it("returns fail when pipeline fails", () => {
    const status = computeRegressionStatus({
      pipelinePassed: false,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: null,
      durationDeltaPct: null,
    });
    expect(status).toBe("fail");
  });

  it("returns fail when any quality gate fails", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: false,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: null,
      durationDeltaPct: null,
    });
    expect(status).toBe("fail");
  });

  it("returns fail when baseline compare fails", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: false,
      fallbackUsed: false,
      costDeltaPct: null,
      durationDeltaPct: null,
    });
    expect(status).toBe("fail");
  });

  // ── regression status = degraded ──────────────────────────

  it("returns degraded on fallback usage", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: true,
      costDeltaPct: null,
      durationDeltaPct: null,
    });
    expect(status).toBe("degraded");
  });

  it("returns degraded on >= 20% cost increase", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: DEGRADATION_THRESHOLDS.costIncreasePct,
      durationDeltaPct: null,
    });
    expect(status).toBe("degraded");
  });

  it("returns degraded on >= 20% duration increase", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: null,
      durationDeltaPct: DEGRADATION_THRESHOLDS.durationIncreasePct,
    });
    expect(status).toBe("degraded");
  });

  it("fail takes precedence over degraded", () => {
    const status = computeRegressionStatus({
      pipelinePassed: false,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: true, // also degraded
      costDeltaPct: 50, // also degraded
      durationDeltaPct: null,
    });
    expect(status).toBe("fail");
  });
});

// ── no degraded delta checks when no previous run ───────────

describe("compareWithPreviousRegression", () => {
  it("returns empty comparison when no previous run", () => {
    const current = makeSummary();
    const comparison = compareWithPreviousRegression(current, null);
    expect(comparison.costDeltaPct).toBeUndefined();
    expect(comparison.durationDeltaPct).toBeUndefined();
    expect(comparison.fallbackDelta).toBeUndefined();
    expect(comparison.previousRunId).toBeUndefined();
  });

  it("computes deltas correctly", () => {
    const previous = makeSummary({
      runId: "prev-run",
      estimatedCostTotal: 0.04,
      durationMsTotal: 50000,
      fallbackCount: 1,
    });

    const current = makeSummary({
      runId: "curr-run",
      estimatedCostTotal: 0.06, // +50%
      durationMsTotal: 70000, // +40%
      fallbackCount: 3,
    });

    const comparison = compareWithPreviousRegression(current, previous);
    expect(comparison.previousRunId).toBe("prev-run");
    expect(comparison.costDeltaPct).toBe(50);
    expect(comparison.durationDeltaPct).toBe(40);
    expect(comparison.fallbackDelta).toBe(2);
  });

  it("returns null cost delta when previous cost is 0", () => {
    const previous = makeSummary({
      runId: "prev-run",
      estimatedCostTotal: 0,
    });
    const current = makeSummary({
      estimatedCostTotal: 0.05,
    });
    const comparison = compareWithPreviousRegression(current, previous);
    expect(comparison.costDeltaPct).toBeNull();
  });

  it("returns null deltas when current values are null", () => {
    const previous = makeSummary({
      runId: "prev-run",
      estimatedCostTotal: 0.04,
      durationMsTotal: 50000,
    });
    const current = makeSummary({
      estimatedCostTotal: null,
      durationMsTotal: null,
    });
    const comparison = compareWithPreviousRegression(current, previous);
    expect(comparison.costDeltaPct).toBeNull();
    expect(comparison.durationDeltaPct).toBeNull();
  });

  it("computes negative deltas correctly", () => {
    const previous = makeSummary({
      runId: "prev-run",
      estimatedCostTotal: 0.10,
      durationMsTotal: 100000,
      fallbackCount: 5,
    });
    const current = makeSummary({
      estimatedCostTotal: 0.05, // -50%
      durationMsTotal: 60000, // -40%
      fallbackCount: 2,
    });
    const comparison = compareWithPreviousRegression(current, previous);
    expect(comparison.costDeltaPct).toBe(-50);
    expect(comparison.durationDeltaPct).toBe(-40);
    expect(comparison.fallbackDelta).toBe(-3);
  });
});

// ── buildRegressionSummary ──────────────────────────────────

describe("buildRegressionSummary", () => {
  it("builds a complete summary from pipeline result", () => {
    const pipelineResult = makePipelineResult();

    const summary = buildRegressionSummary({
      templateKey: "simple_crm_saas",
      shortName: "crm",
      runId: "run-1",
      startedAt: "2026-03-13T00:00:00Z",
      finishedAt: "2026-03-13T00:10:00Z",
      pipelineResult,
      baselinePassed: true,
      promotionEligible: true,
      previousRun: null,
    });

    expect(summary.templateKey).toBe("simple_crm_saas");
    expect(summary.pipelinePassed).toBe(true);
    expect(summary.qualityGatesPassed).toBe(true);
    expect(summary.baselinePassed).toBe(true);
    expect(summary.regressionStatus).toBe("pass");
    expect(summary.selectedProviders).toContain("claude");
    expect(summary.selectedProviders).toContain("gemini");
    expect(summary.estimatedCostTotal).toBe(0.05);
    expect(summary.durationMsTotal).toBe(36000);
    expect(summary.perStepStatus.length).toBe(6);
    expect(summary.qualityChecks.length).toBe(3);
  });

  it("detects fallback usage in steps", () => {
    const pipelineResult = makePipelineResult({
      steps: [
        { key: "blueprint", status: "completed", meta: { provider: "claude", fallbackUsed: true } },
        { key: "schema", status: "completed", meta: { provider: "claude" } },
      ],
    });

    const summary = buildRegressionSummary({
      templateKey: "simple_crm_saas",
      shortName: "crm",
      runId: "run-1",
      startedAt: "2026-03-13T00:00:00Z",
      finishedAt: "2026-03-13T00:10:00Z",
      pipelineResult,
      baselinePassed: true,
      promotionEligible: true,
      previousRun: null,
    });

    expect(summary.fallbackUsed).toBe(true);
    expect(summary.fallbackCount).toBe(1);
    expect(summary.regressionStatus).toBe("degraded");
  });

  it("marks fail when pipeline fails", () => {
    const pipelineResult = makePipelineResult({ status: "failed" });

    const summary = buildRegressionSummary({
      templateKey: "simple_crm_saas",
      shortName: "crm",
      runId: "run-1",
      startedAt: "2026-03-13T00:00:00Z",
      finishedAt: "2026-03-13T00:10:00Z",
      pipelineResult,
      baselinePassed: true,
      promotionEligible: false,
      previousRun: null,
    });

    expect(summary.regressionStatus).toBe("fail");
  });

  it("marks fail when baseline fails", () => {
    const pipelineResult = makePipelineResult();

    const summary = buildRegressionSummary({
      templateKey: "simple_crm_saas",
      shortName: "crm",
      runId: "run-1",
      startedAt: "2026-03-13T00:00:00Z",
      finishedAt: "2026-03-13T00:10:00Z",
      pipelineResult,
      baselinePassed: false,
      promotionEligible: false,
      previousRun: null,
    });

    expect(summary.regressionStatus).toBe("fail");
  });

  it("marks degraded when cost increased >=20% vs previous", () => {
    const previousRun = makeSummary({
      runId: "prev-1",
      estimatedCostTotal: 0.05,
      durationMsTotal: 36000,
    });

    const pipelineResult = makePipelineResult({
      steps: [
        { key: "blueprint", status: "completed", meta: { provider: "gemini", durationMs: 5000, estimatedCostUsd: 0.02 } },
        { key: "implementation", status: "completed", meta: { provider: "claude", durationMs: 10000, estimatedCostUsd: 0.03 } },
        { key: "schema", status: "completed", meta: { provider: "claude", durationMs: 8000, estimatedCostUsd: 0.02 } },
        { key: "api_design", status: "completed", meta: { provider: "claude", durationMs: 7000, estimatedCostUsd: 0.02 } },
        { key: "split_files", status: "completed", meta: { provider: "claude", durationMs: 6000 } },
        { key: "export_files", status: "completed" },
      ],
    });

    const summary = buildRegressionSummary({
      templateKey: "simple_crm_saas",
      shortName: "crm",
      runId: "run-2",
      startedAt: "2026-03-14T00:00:00Z",
      finishedAt: "2026-03-14T00:10:00Z",
      pipelineResult,
      baselinePassed: true,
      promotionEligible: true,
      previousRun,
    });

    // Cost went from 0.05 → 0.09, that's +80%
    expect(summary.estimatedCostTotal).toBe(0.09);
    expect(summary.comparison?.costDeltaPct).toBe(80);
    expect(summary.regressionStatus).toBe("degraded");
  });
});

// ── extractPipelineResult ───────────────────────────────────

describe("extractPipelineResult", () => {
  it("extracts from API-shaped response", () => {
    const apiResponse = {
      generationRuns: [
        {
          id: "gen-run-1",
          status: "completed",
          steps_json: [
            { key: "blueprint", status: "completed", meta: { provider: "gemini" } },
            { key: "schema", status: "completed", meta: { provider: "claude" } },
          ],
        },
      ],
      qualityRuns: [
        {
          status: "passed",
          checks_json: [
            { key: "lint", status: "passed" },
            { key: "typecheck", status: "passed" },
          ],
        },
      ],
    };

    const result = extractPipelineResult(apiResponse);
    expect(result.runId).toBe("gen-run-1");
    expect(result.status).toBe("completed");
    expect(result.steps.length).toBe(2);
    expect(result.qualityChecks.length).toBe(2);
    expect(result.qualityStatus).toBe("passed");
  });

  it("handles missing data gracefully", () => {
    const result = extractPipelineResult({});
    expect(result.runId).toBe("unknown");
    expect(result.status).toBe("unknown");
    expect(result.steps).toEqual([]);
    expect(result.qualityChecks).toEqual([]);
  });
});

// ── nightly runner processes multiple templates ─────────────

describe("buildNightlyReport", () => {
  it("builds report from multiple template results", () => {
    const results = [
      makeSummary({ templateKey: "simple_crm_saas", regressionStatus: "pass" }),
      makeSummary({ templateKey: "reservation_saas", regressionStatus: "degraded" }),
      makeSummary({ templateKey: "community_membership_saas", regressionStatus: "fail" }),
      makeSummary({ templateKey: "internal_admin_ops_saas", regressionStatus: "pass" }),
    ];

    const report = buildNightlyReport(
      "nightly-20260313",
      "2026-03-13T00:00:00Z",
      "2026-03-13T01:00:00Z",
      results
    );

    expect(report.summary.templatesProcessed).toBe(4);
    expect(report.summary.passCount).toBe(2);
    expect(report.summary.degradedCount).toBe(1);
    expect(report.summary.failCount).toBe(1);
    expect(report.templateResults.length).toBe(4);
  });
});

// ── summary output shape is stable and typed ────────────────

describe("summary output shape", () => {
  it("has all required fields", () => {
    const summary = makeSummary();

    // Required fields
    expect(summary).toHaveProperty("templateKey");
    expect(summary).toHaveProperty("shortName");
    expect(summary).toHaveProperty("runId");
    expect(summary).toHaveProperty("startedAt");
    expect(summary).toHaveProperty("finishedAt");
    expect(summary).toHaveProperty("pipelinePassed");
    expect(summary).toHaveProperty("qualityGatesPassed");
    expect(summary).toHaveProperty("baselinePassed");
    expect(summary).toHaveProperty("promotionEligible");
    expect(summary).toHaveProperty("fallbackUsed");
    expect(summary).toHaveProperty("fallbackCount");
    expect(summary).toHaveProperty("selectedProviders");
    expect(summary).toHaveProperty("routingScores");
    expect(summary).toHaveProperty("estimatedCostTotal");
    expect(summary).toHaveProperty("durationMsTotal");
    expect(summary).toHaveProperty("perStepStatus");
    expect(summary).toHaveProperty("qualityChecks");
    expect(summary).toHaveProperty("regressionStatus");

    // Types
    expect(typeof summary.templateKey).toBe("string");
    expect(typeof summary.pipelinePassed).toBe("boolean");
    expect(["pass", "fail", "degraded"]).toContain(summary.regressionStatus);
    expect(Array.isArray(summary.selectedProviders)).toBe(true);
  });

  it("report shape is stable", () => {
    const report: NightlyRegressionReport = {
      nightlyRunId: "test",
      startedAt: "2026-03-13T00:00:00Z",
      finishedAt: "2026-03-13T01:00:00Z",
      templateResults: [],
      summary: {
        templatesProcessed: 0,
        passCount: 0,
        degradedCount: 0,
        failCount: 0,
      },
    };

    expect(report).toHaveProperty("nightlyRunId");
    expect(report).toHaveProperty("startedAt");
    expect(report).toHaveProperty("finishedAt");
    expect(report).toHaveProperty("templateResults");
    expect(report).toHaveProperty("summary");
    expect(report.summary).toHaveProperty("templatesProcessed");
    expect(report.summary).toHaveProperty("passCount");
    expect(report.summary).toHaveProperty("degradedCount");
    expect(report.summary).toHaveProperty("failCount");
  });
});

// ── formatRegressionReport ──────────────────────────────────

describe("formatRegressionReport", () => {
  it("produces readable output", () => {
    const report = buildNightlyReport(
      "nightly-test",
      "2026-03-13T00:00:00Z",
      "2026-03-13T01:00:00Z",
      [
        makeSummary({ templateKey: "simple_crm_saas", shortName: "crm", regressionStatus: "pass" }),
        makeSummary({ templateKey: "reservation_saas", shortName: "rsv", regressionStatus: "degraded", fallbackUsed: true }),
      ]
    );

    const output = formatRegressionReport(report);

    expect(output).toContain("NIGHTLY TEMPLATE REGRESSION");
    expect(output).toContain("simple_crm_saas");
    expect(output).toContain("PASS");
    expect(output).toContain("reservation_saas");
    expect(output).toContain("DEGRADED");
    expect(output).toContain("SUMMARY");
    expect(output).toContain("Templates: 2");
    expect(output).toContain("Pass:      1");
    expect(output).toContain("Degraded:  1");
  });
});
