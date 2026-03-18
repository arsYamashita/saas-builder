import { describe, it, expect } from "vitest";
import {
  getTemplateRegressionConfig,
  resolveGreenTemplatesForRegression,
  resolveTemplatesForRegression,
  REGRESSION_CONFIG_REGISTRY,
  type ResolvedRegressionTemplate,
} from "@/lib/regression/template-regression-config";
import {
  formatSingleResult,
  type SingleRegressionResult,
} from "@/lib/regression/template-regression-runner";
import {
  buildRegressionSummary,
  buildNightlyReport,
  formatRegressionReport,
  computeRegressionStatus,
  type PipelineResult,
  type TemplateRegressionSummary,
} from "@/lib/regression/nightly-template-regression";
import { TEMPLATE_MANIFESTS } from "@/lib/templates/template-registry";
import { TEMPLATE_CATALOG } from "@/lib/templates/template-catalog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePassingPipelineResult(): PipelineResult {
  return {
    runId: "test-run-001",
    status: "completed",
    steps: [
      { key: "blueprint", status: "completed", meta: { provider: "gemini", durationMs: 5000, estimatedCostUsd: 0.01 } },
      { key: "implementation", status: "completed", meta: { provider: "claude", durationMs: 10000, estimatedCostUsd: 0.05 } },
      { key: "schema", status: "completed", meta: { provider: "claude", durationMs: 3000, estimatedCostUsd: 0.02 } },
      { key: "api_design", status: "completed", meta: { provider: "claude", durationMs: 4000, estimatedCostUsd: 0.03 } },
      { key: "split_files", status: "completed", meta: { provider: "claude", durationMs: 6000, estimatedCostUsd: 0.04 } },
      { key: "export_files", status: "completed" },
    ],
    qualityChecks: [
      { key: "lint", status: "passed" },
      { key: "typecheck", status: "passed" },
      { key: "playwright", status: "passed" },
    ],
    qualityStatus: "passed",
  };
}

function makeFailedPipelineResult(): PipelineResult {
  return {
    runId: "test-run-fail",
    status: "failed",
    steps: [
      { key: "blueprint", status: "completed" },
      { key: "implementation", status: "failed" },
    ],
    qualityChecks: [],
    qualityStatus: "unknown",
    errorMessage: "Implementation step failed",
  };
}

function makeSummary(
  templateKey: string,
  shortName: string,
  pipeline: PipelineResult,
  baselinePassed = true
): TemplateRegressionSummary {
  return buildRegressionSummary({
    templateKey,
    shortName,
    runId: pipeline.runId,
    startedAt: "2026-03-16T00:00:00Z",
    finishedAt: "2026-03-16T00:10:00Z",
    pipelineResult: pipeline,
    baselinePassed,
    promotionEligible: false,
    previousRun: null,
  });
}

function makeSingleResult(
  templateKey: string,
  shortName: string,
  pipeline: PipelineResult,
  baselinePassed = true
): SingleRegressionResult {
  const summary = makeSummary(templateKey, shortName, pipeline, baselinePassed);
  return {
    templateKey,
    shortName,
    summary,
    stepsCompleted: ["create_project", "trigger_generation", "poll_completion", "fetch_final_state", "quality_gates", "baseline_compare"],
    stepsSkipped: ["runtime_verification"],
    durationMs: 60000,
  };
}

// ---------------------------------------------------------------------------
// 1. Single-template regression execution works
// ---------------------------------------------------------------------------

describe("single-template regression", () => {
  it("builds a valid summary for a passing run", () => {
    const pipeline = makePassingPipelineResult();
    const summary = makeSummary("reservation_saas", "rsv", pipeline);

    expect(summary.templateKey).toBe("reservation_saas");
    expect(summary.shortName).toBe("rsv");
    expect(summary.pipelinePassed).toBe(true);
    expect(summary.qualityGatesPassed).toBe(true);
    expect(summary.baselinePassed).toBe(true);
    expect(summary.regressionStatus).toBe("pass");
  });

  it("builds a valid summary for a failing run", () => {
    const pipeline = makeFailedPipelineResult();
    const summary = makeSummary("reservation_saas", "rsv", pipeline);

    expect(summary.pipelinePassed).toBe(false);
    expect(summary.regressionStatus).toBe("fail");
  });

  it("formatSingleResult produces readable output", () => {
    const result = makeSingleResult("reservation_saas", "rsv", makePassingPipelineResult());
    const formatted = formatSingleResult(result);

    expect(formatted).toContain("[rsv]");
    expect(formatted).toContain("reservation_saas");
    expect(formatted).toContain("PASS");
    expect(formatted).toContain("Steps:");
    expect(formatted).toContain("Duration:");
  });
});

// ---------------------------------------------------------------------------
// 2. All-green regression execution works
// ---------------------------------------------------------------------------

describe("all-green regression", () => {
  it("resolveGreenTemplatesForRegression returns all 5 GREEN templates", () => {
    const templates = resolveGreenTemplatesForRegression();
    expect(templates).toHaveLength(5);

    const keys = templates.map((t) => t.templateKey);
    expect(keys).toContain("membership_content_affiliate");
    expect(keys).toContain("reservation_saas");
    expect(keys).toContain("community_membership_saas");
    expect(keys).toContain("simple_crm_saas");
    expect(keys).toContain("internal_admin_ops_saas");
  });

  it("each resolved template has manifest, catalog, and config", () => {
    const templates = resolveGreenTemplatesForRegression();
    for (const t of templates) {
      expect(t.manifest).toBeDefined();
      expect(t.catalog).toBeDefined();
      expect(t.config).toBeDefined();
      expect(t.shortName).toBeTruthy();
      expect(t.label).toBeTruthy();
    }
  });

  it("buildNightlyReport produces correct summary counts", () => {
    const summaries = [
      makeSummary("mca", "mca", makePassingPipelineResult()),
      makeSummary("rsv", "rsv", makePassingPipelineResult()),
      makeSummary("crm", "crm", makeFailedPipelineResult()),
    ];

    const report = buildNightlyReport("test-nightly", "start", "end", summaries);

    expect(report.summary.templatesProcessed).toBe(3);
    expect(report.summary.passCount).toBe(2);
    expect(report.summary.failCount).toBe(1);
    expect(report.summary.degradedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Explicit template list execution works
// ---------------------------------------------------------------------------

describe("explicit template list", () => {
  it("resolveTemplatesForRegression resolves specified keys", () => {
    const templates = resolveTemplatesForRegression([
      "reservation_saas",
      "simple_crm_saas",
    ]);

    expect(templates).toHaveLength(2);
    expect(templates[0].templateKey).toBe("reservation_saas");
    expect(templates[1].templateKey).toBe("simple_crm_saas");
  });

  it("resolveTemplatesForRegression skips unknown keys", () => {
    const templates = resolveTemplatesForRegression([
      "reservation_saas",
      "nonexistent_saas",
    ]);

    expect(templates).toHaveLength(1);
    expect(templates[0].templateKey).toBe("reservation_saas");
  });

  it("resolveTemplatesForRegression returns empty for all unknown keys", () => {
    const templates = resolveTemplatesForRegression(["foo", "bar"]);
    expect(templates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Template regression config is resolved correctly
// ---------------------------------------------------------------------------

describe("regression config resolution", () => {
  it("each GREEN template has a registered config", () => {
    const greenKeys = TEMPLATE_CATALOG
      .filter((c) => c.statusBadge === "GREEN")
      .map((c) => c.templateKey);

    for (const key of greenKeys) {
      const config = getTemplateRegressionConfig(key);
      expect(config.templateKey).toBe(key);
      expect(config.qualityGates).toBe(true);
      expect(config.baselineCompare).toBe(true);
    }
  });

  it("unknown template gets default config", () => {
    const config = getTemplateRegressionConfig("nonexistent_saas");
    expect(config.templateKey).toBe("nonexistent_saas");
    expect(config.qualityGates).toBe(true);
    expect(config.baselineCompare).toBe(true);
    expect(config.templateSmoke).toBe(false);
    expect(config.runtimeVerification).toBe(false);
  });

  it("reservation_saas has runtimeVerification enabled", () => {
    const config = getTemplateRegressionConfig("reservation_saas");
    expect(config.runtimeVerification).toBe(true);
  });

  it("membership_content_affiliate has runtimeVerification disabled", () => {
    const config = getTemplateRegressionConfig("membership_content_affiliate");
    expect(config.runtimeVerification).toBe(false);
  });

  it("all configs have required fields", () => {
    for (const config of REGRESSION_CONFIG_REGISTRY) {
      expect(config.templateKey).toBeTruthy();
      expect(typeof config.qualityGates).toBe("boolean");
      expect(typeof config.baselineCompare).toBe("boolean");
      expect(typeof config.templateSmoke).toBe("boolean");
      expect(typeof config.runtimeVerification).toBe("boolean");
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Regression summary format is stable
// ---------------------------------------------------------------------------

describe("summary format stability", () => {
  it("TemplateRegressionSummary has all required fields", () => {
    const summary = makeSummary("reservation_saas", "rsv", makePassingPipelineResult());

    expect(summary).toHaveProperty("templateKey");
    expect(summary).toHaveProperty("shortName");
    expect(summary).toHaveProperty("runId");
    expect(summary).toHaveProperty("startedAt");
    expect(summary).toHaveProperty("finishedAt");
    expect(summary).toHaveProperty("pipelinePassed");
    expect(summary).toHaveProperty("qualityGatesPassed");
    expect(summary).toHaveProperty("baselinePassed");
    expect(summary).toHaveProperty("regressionStatus");
    expect(summary).toHaveProperty("fallbackUsed");
    expect(summary).toHaveProperty("fallbackCount");
    expect(summary).toHaveProperty("selectedProviders");
    expect(summary).toHaveProperty("estimatedCostTotal");
    expect(summary).toHaveProperty("durationMsTotal");
    expect(summary).toHaveProperty("perStepStatus");
    expect(summary).toHaveProperty("qualityChecks");
  });

  it("NightlyRegressionReport has stable shape", () => {
    const summaries = [makeSummary("rsv", "rsv", makePassingPipelineResult())];
    const report = buildNightlyReport("nightly-test", "s", "e", summaries);

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

  it("formatRegressionReport produces deterministic output", () => {
    const summaries = [makeSummary("rsv", "rsv", makePassingPipelineResult())];
    const report = buildNightlyReport("nightly-test", "s", "e", summaries);

    const first = formatRegressionReport(report);
    const second = formatRegressionReport(report);
    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// 6. Templates with runtime verification enabled run that step
// ---------------------------------------------------------------------------

describe("runtime verification step tracking", () => {
  it("reservation_saas config enables runtime verification", () => {
    const templates = resolveGreenTemplatesForRegression();
    const rsv = templates.find((t) => t.templateKey === "reservation_saas");
    expect(rsv).toBeDefined();
    expect(rsv!.config.runtimeVerification).toBe(true);
  });

  it("internal_admin_ops_saas config enables runtime verification", () => {
    const templates = resolveGreenTemplatesForRegression();
    const iao = templates.find((t) => t.templateKey === "internal_admin_ops_saas");
    expect(iao).toBeDefined();
    expect(iao!.config.runtimeVerification).toBe(true);
  });

  it("community_membership_saas config disables runtime verification", () => {
    const config = getTemplateRegressionConfig("community_membership_saas");
    expect(config.runtimeVerification).toBe(false);
  });

  it("stepsSkipped reflects runtime_verification when disabled", () => {
    const result = makeSingleResult("mca", "mca", makePassingPipelineResult());
    expect(result.stepsSkipped).toContain("runtime_verification");
  });
});

// ---------------------------------------------------------------------------
// 7. Pass/degraded/fail status propagates correctly
// ---------------------------------------------------------------------------

describe("status propagation", () => {
  it("pass when all conditions met", () => {
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

  it("fail when pipeline fails", () => {
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

  it("fail when quality gates fail", () => {
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

  it("fail when baseline fails", () => {
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

  it("degraded when fallback used", () => {
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

  it("degraded when cost increase >= 20%", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: 25,
      durationDeltaPct: null,
    });
    expect(status).toBe("degraded");
  });

  it("degraded when duration increase >= 20%", () => {
    const status = computeRegressionStatus({
      pipelinePassed: true,
      qualityGatesPassed: true,
      baselinePassed: true,
      fallbackUsed: false,
      costDeltaPct: null,
      durationDeltaPct: 30,
    });
    expect(status).toBe("degraded");
  });

  it("fail takes precedence over degraded", () => {
    const summary = makeSummary("rsv", "rsv", makeFailedPipelineResult(), false);
    expect(summary.regressionStatus).toBe("fail");
  });
});

// ---------------------------------------------------------------------------
// 8. Unified runner remains backward compatible
// ---------------------------------------------------------------------------

describe("backward compatibility", () => {
  it("all GREEN templates from catalog are in regression config", () => {
    const greenKeys = TEMPLATE_CATALOG
      .filter((c) => c.statusBadge === "GREEN")
      .map((c) => c.templateKey);
    const configKeys = REGRESSION_CONFIG_REGISTRY.map((c) => c.templateKey);

    for (const key of greenKeys) {
      expect(configKeys).toContain(key);
    }
  });

  it("all manifest template keys are in catalog", () => {
    const catalogKeys = TEMPLATE_CATALOG.map((c) => c.templateKey);
    for (const manifest of TEMPLATE_MANIFESTS) {
      expect(catalogKeys).toContain(manifest.templateKey);
    }
  });

  it("resolved templates have consistent fixture paths from manifests", () => {
    const templates = resolveGreenTemplatesForRegression();
    for (const t of templates) {
      expect(t.manifest.fixturePath).toBeTruthy();
      expect(t.manifest.baselineJsonPath).toBeTruthy();
    }
  });

  it("regression config registry matches manifest count", () => {
    expect(REGRESSION_CONFIG_REGISTRY).toHaveLength(TEMPLATE_MANIFESTS.length);
  });
});

// ---------------------------------------------------------------------------
// 9. Deterministic report output is preserved
// ---------------------------------------------------------------------------

describe("deterministic report output", () => {
  it("resolveGreenTemplatesForRegression returns same order", () => {
    const first = resolveGreenTemplatesForRegression().map((t) => t.templateKey);
    const second = resolveGreenTemplatesForRegression().map((t) => t.templateKey);
    expect(first).toEqual(second);
  });

  it("resolveTemplatesForRegression preserves input order", () => {
    const keys = ["simple_crm_saas", "reservation_saas"];
    const templates = resolveTemplatesForRegression(keys);
    expect(templates[0].templateKey).toBe("simple_crm_saas");
    expect(templates[1].templateKey).toBe("reservation_saas");
  });

  it("formatSingleResult is idempotent", () => {
    const result = makeSingleResult("rsv", "rsv", makePassingPipelineResult());
    const first = formatSingleResult(result);
    const second = formatSingleResult(result);
    expect(first).toBe(second);
  });

  it("buildNightlyReport summary matches template results", () => {
    const pass = makeSummary("mca", "mca", makePassingPipelineResult());
    const fail = makeSummary("rsv", "rsv", makeFailedPipelineResult());
    const report = buildNightlyReport("id", "s", "e", [pass, fail]);

    expect(report.summary.passCount + report.summary.failCount + report.summary.degradedCount)
      .toBe(report.summary.templatesProcessed);
  });
});
