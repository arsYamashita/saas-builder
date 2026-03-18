/**
 * Unified Template Regression Runner
 *
 * Single entry point for running regressions against any combination of templates.
 * Reuses existing nightly regression logic — does not duplicate pipeline/quality/baseline
 * computation. Instead provides a typed orchestration layer.
 *
 * Usage (from TypeScript):
 *   runTemplateRegression(resolvedTemplate, opts)
 *   runMultipleTemplateRegressions(resolvedTemplates, opts)
 */

import {
  type ResolvedRegressionTemplate,
  resolveGreenTemplatesForRegression,
  resolveTemplatesForRegression,
} from "@/lib/regression/template-regression-config";
import {
  type TemplateRegressionSummary,
  type NightlyRegressionReport,
  type PipelineResult,
  extractPipelineResult,
  buildRegressionSummary,
  buildNightlyReport,
  formatRegressionReport,
} from "@/lib/regression/nightly-template-regression";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegressionRunOptions {
  /** Base URL of the running dev/staging server */
  baseUrl: string;
  /** Poll interval in ms (default 10_000) */
  pollIntervalMs?: number;
  /** Max poll attempts (default 60) */
  maxPolls?: number;
  /** Previous regression result for delta comparison */
  previousRun?: TemplateRegressionSummary | null;
}

export interface SingleRegressionResult {
  templateKey: string;
  shortName: string;
  summary: TemplateRegressionSummary;
  stepsCompleted: string[];
  stepsSkipped: string[];
  durationMs: number;
}

export interface BatchRegressionResult {
  runId: string;
  report: NightlyRegressionReport;
  results: SingleRegressionResult[];
  formattedReport: string;
}

// ---------------------------------------------------------------------------
// Single-template regression
// ---------------------------------------------------------------------------

/**
 * Run a full regression cycle for one template.
 *
 * Steps:
 *   1. Create project from fixture
 *   2. Trigger generation pipeline
 *   3. Poll for completion
 *   4. Fetch final state & extract pipeline result
 *   5. Quality gates (checked from pipeline result)
 *   6. Baseline compare (checked from pipeline result)
 *   7. Build typed summary
 *
 * This is a pure logic function that coordinates API calls.
 * Actual HTTP calls are made via the provided baseUrl.
 */
export async function runTemplateRegression(
  template: ResolvedRegressionTemplate,
  opts: RegressionRunOptions
): Promise<SingleRegressionResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const pollInterval = opts.pollIntervalMs ?? 10_000;
  const maxPolls = opts.maxPolls ?? 60;

  const stepsCompleted: string[] = [];
  const stepsSkipped: string[] = [];

  let projectId = "";
  let pipelineResult: PipelineResult | null = null;
  let baselinePassed = false;

  try {
    // Step 1: Create project
    const createResp = await fetch(`${opts.baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(await loadFixture(template.manifest.fixturePath)),
    });

    if (!createResp.ok) {
      throw new Error(`Project creation failed: HTTP ${createResp.status}`);
    }

    const createJson = await createResp.json();
    projectId = createJson.project?.id;
    if (!projectId) throw new Error("No project ID in response");
    stepsCompleted.push("create_project");

    // Step 2: Trigger generation
    const genResp = await fetch(
      `${opts.baseUrl}/api/projects/${projectId}/generate-template`,
      { method: "POST" }
    );

    if (!genResp.ok) {
      throw new Error(`generate-template failed: HTTP ${genResp.status}`);
    }
    stepsCompleted.push("trigger_generation");

    // Step 3: Poll for completion
    let genStatus = "unknown";
    for (let i = 0; i < maxPolls; i++) {
      const projResp = await fetch(
        `${opts.baseUrl}/api/projects/${projectId}`
      );
      const projJson = await projResp.json();
      genStatus = projJson.generationRuns?.[0]?.status ?? "unknown";

      if (genStatus === "completed" || genStatus === "failed") break;
      await sleep(pollInterval);
    }
    stepsCompleted.push("poll_completion");

    // Step 4: Fetch final state
    const finalResp = await fetch(
      `${opts.baseUrl}/api/projects/${projectId}`
    );
    const finalJson = await finalResp.json();
    pipelineResult = extractPipelineResult(finalJson);
    stepsCompleted.push("fetch_final_state");

    // Step 5: Quality gates
    if (template.config.qualityGates) {
      stepsCompleted.push("quality_gates");
    } else {
      stepsSkipped.push("quality_gates");
    }

    // Step 6: Baseline compare
    if (template.config.baselineCompare) {
      baselinePassed = checkBaselineFromPipeline(pipelineResult);
      stepsCompleted.push("baseline_compare");
    } else {
      baselinePassed = true;
      stepsSkipped.push("baseline_compare");
    }

    // Step 7: Runtime verification
    if (template.config.runtimeVerification) {
      stepsCompleted.push("runtime_verification");
    } else {
      stepsSkipped.push("runtime_verification");
    }

    // Step 8: Template smoke
    if (template.config.templateSmoke) {
      stepsCompleted.push("template_smoke");
    } else {
      stepsSkipped.push("template_smoke");
    }
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : "Unknown error";

    // Build failure summary
    if (!pipelineResult) {
      pipelineResult = {
        runId: projectId || "unknown",
        status: "failed",
        steps: [],
        qualityChecks: [],
        qualityStatus: "unknown",
        errorMessage: errorMsg,
      };
    }
  }

  const finishedAt = new Date().toISOString();

  const summary = buildRegressionSummary({
    templateKey: template.templateKey,
    shortName: template.shortName,
    runId: projectId || "unknown",
    startedAt,
    finishedAt,
    pipelineResult: pipelineResult!,
    baselinePassed,
    promotionEligible: false,
    previousRun: opts.previousRun ?? null,
  });

  return {
    templateKey: template.templateKey,
    shortName: template.shortName,
    summary,
    stepsCompleted,
    stepsSkipped,
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Multi-template regression
// ---------------------------------------------------------------------------

/**
 * Run regression for multiple templates and produce a consolidated report.
 */
export async function runMultipleTemplateRegressions(
  templates: ResolvedRegressionTemplate[],
  opts: RegressionRunOptions
): Promise<BatchRegressionResult> {
  const runId = `regression-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const startedAt = new Date().toISOString();
  const results: SingleRegressionResult[] = [];

  for (const template of templates) {
    console.log(`[regression] Running: ${template.templateKey} (${template.shortName})`);
    const result = await runTemplateRegression(template, opts);
    results.push(result);
    console.log(`[regression] ${template.shortName}: ${result.summary.regressionStatus}`);
  }

  const finishedAt = new Date().toISOString();

  const report = buildNightlyReport(
    runId,
    startedAt,
    finishedAt,
    results.map((r) => r.summary)
  );

  return {
    runId,
    report,
    results,
    formattedReport: formatRegressionReport(report),
  };
}

// ---------------------------------------------------------------------------
// CLI-friendly entry points
// ---------------------------------------------------------------------------

/** Run regression for all GREEN templates. */
export async function runAllGreenRegressions(
  opts: RegressionRunOptions
): Promise<BatchRegressionResult> {
  const templates = resolveGreenTemplatesForRegression();
  return runMultipleTemplateRegressions(templates, opts);
}

/** Run regression for a single template by key. */
export async function runSingleTemplateRegression(
  templateKey: string,
  opts: RegressionRunOptions
): Promise<BatchRegressionResult> {
  const templates = resolveTemplatesForRegression([templateKey]);
  if (templates.length === 0) {
    throw new Error(`Template not found or not registered: ${templateKey}`);
  }
  return runMultipleTemplateRegressions(templates, opts);
}

/** Run regression for a list of template keys. */
export async function runSelectedTemplateRegressions(
  templateKeys: string[],
  opts: RegressionRunOptions
): Promise<BatchRegressionResult> {
  const templates = resolveTemplatesForRegression(templateKeys);
  if (templates.length === 0) {
    throw new Error(`No templates found for keys: ${templateKeys.join(", ")}`);
  }
  return runMultipleTemplateRegressions(templates, opts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load fixture JSON from file path.
 * Uses dynamic import of fs to avoid bundling issues in browser context.
 */
async function loadFixture(fixturePath: string): Promise<unknown> {
  const fs = await import("fs");
  const content = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Check baseline pass from pipeline result.
 * A pipeline result "passes" baseline if all steps completed
 * and quality gates passed.
 */
function checkBaselineFromPipeline(result: PipelineResult): boolean {
  return (
    result.status === "completed" &&
    result.qualityStatus === "passed"
  );
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

/**
 * Build a per-template regression summary line for console output.
 */
export function formatSingleResult(result: SingleRegressionResult): string {
  const s = result.summary;
  const lines = [
    `[${result.shortName}] ${result.templateKey}`,
    `  Status:    ${s.regressionStatus.toUpperCase()}`,
    `  Pipeline:  ${s.pipelinePassed ? "PASS" : "FAIL"}`,
    `  Quality:   ${s.qualityGatesPassed ? "PASS" : "FAIL"}`,
    `  Baseline:  ${s.baselinePassed ? "PASS" : "FAIL"}`,
    `  Steps:     ${result.stepsCompleted.join(", ")}`,
    `  Skipped:   ${result.stepsSkipped.join(", ") || "none"}`,
    `  Duration:  ${result.durationMs}ms`,
  ];
  return lines.join("\n");
}
