/**
 * Nightly Template Regression v1
 *
 * Orchestrates regression runs for GREEN templates.
 * Captures pipeline, quality gate, baseline, provider routing,
 * cost, and duration metrics per template.
 *
 * Pure logic layer — no DB migrations, no quality gate changes.
 * Persistence via JSON summary files under regression-results/.
 */

import {
  TEMPLATE_CATALOG,
  type TemplateCatalogEntry,
} from "@/lib/templates/template-catalog";
import {
  TEMPLATE_REGISTRY,
  type TemplateManifest,
} from "@/lib/templates/template-registry";

// ── Regression Status ───────────────────────────────────────

export type RegressionStatus = "pass" | "fail" | "degraded";

// ── Summary Model ───────────────────────────────────────────

export interface RegressionComparison {
  previousRunId?: string;
  costDeltaPct?: number | null;
  durationDeltaPct?: number | null;
  fallbackDelta?: number | null;
}

export interface TemplateRegressionSummary {
  templateKey: string;
  shortName: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  pipelinePassed: boolean;
  qualityGatesPassed: boolean;
  baselinePassed: boolean;
  promotionEligible: boolean;
  fallbackUsed: boolean;
  fallbackCount: number;
  selectedProviders: string[];
  routingScores: Array<{ stepKey: string; score?: number }>;
  estimatedCostTotal: number | null;
  durationMsTotal: number | null;
  perStepStatus: Array<{ key: string; status: string; provider?: string }>;
  qualityChecks: Array<{ key: string; status: string }>;
  regressionStatus: RegressionStatus;
  comparison?: RegressionComparison;
  errorMessage?: string;
}

export interface NightlyRegressionReport {
  nightlyRunId: string;
  startedAt: string;
  finishedAt: string;
  templateResults: TemplateRegressionSummary[];
  summary: {
    templatesProcessed: number;
    passCount: number;
    degradedCount: number;
    failCount: number;
  };
}

// ── Degradation Thresholds ──────────────────────────────────

export const DEGRADATION_THRESHOLDS = {
  costIncreasePct: 20,
  durationIncreasePct: 20,
} as const;

// ── GREEN Template Discovery ────────────────────────────────

/**
 * Returns all GREEN templates by checking the template catalog statusBadge.
 * Does not hardcode template keys — dynamically discovers from catalog.
 */
export function getGreenTemplates(): Array<{
  templateKey: string;
  shortName: string;
  label: string;
  manifest: TemplateManifest;
}> {
  const greenCatalog = TEMPLATE_CATALOG.filter(
    (entry: TemplateCatalogEntry) => entry.statusBadge === "GREEN"
  );

  return greenCatalog
    .map((entry) => {
      const manifest = TEMPLATE_REGISTRY[entry.templateKey];
      if (!manifest) return null;
      return {
        templateKey: entry.templateKey,
        shortName: manifest.shortName,
        label: entry.label,
        manifest,
      };
    })
    .filter(
      (e): e is NonNullable<typeof e> => e != null
    );
}

// ── Pipeline Result Extraction ──────────────────────────────

export interface PipelineResult {
  runId: string;
  status: string;
  steps: Array<{ key: string; status: string; meta?: Record<string, unknown> }>;
  qualityChecks: Array<{ key: string; status: string }>;
  qualityStatus: string;
  errorMessage?: string;
}

/**
 * Extracts regression-relevant data from a raw project API response.
 * This is the adapter between the API shape and the regression summary model.
 */
export function extractPipelineResult(
  projectResponse: Record<string, unknown>
): PipelineResult {
  const genRuns = projectResponse.generationRuns as Array<Record<string, unknown>> | undefined;
  const genRun = genRuns?.[0];
  const qualityRuns = projectResponse.qualityRuns as Array<Record<string, unknown>> | undefined;
  const qualityRun = qualityRuns?.[0];

  const steps = ((genRun?.steps_json as Array<Record<string, unknown>>) ?? []).map((s) => ({
    key: s.key as string,
    status: s.status as string,
    meta: s.meta as Record<string, unknown> | undefined,
  }));

  const qualityChecks = (
    (qualityRun?.checks_json as Array<Record<string, unknown>>) ?? []
  ).map((c) => ({
    key: c.key as string,
    status: c.status as string,
  }));

  return {
    runId: (genRun?.id as string) ?? "unknown",
    status: (genRun?.status as string) ?? "unknown",
    steps,
    qualityChecks,
    qualityStatus: (qualityRun?.status as string) ?? "unknown",
    errorMessage: (genRun?.error_message as string) ?? undefined,
  };
}

// ── Step Metrics Extraction ─────────────────────────────────

function extractStepProviders(
  steps: PipelineResult["steps"]
): string[] {
  const providers = new Set<string>();
  for (const step of steps) {
    const provider = step.meta?.provider as string | undefined;
    if (provider) providers.add(provider);
  }
  return Array.from(providers);
}

function extractRoutingScores(
  steps: PipelineResult["steps"]
): Array<{ stepKey: string; score?: number }> {
  return steps.map((s) => ({
    stepKey: s.key,
    score: s.meta?.routingScore as number | undefined,
  }));
}

function extractFallbackCount(steps: PipelineResult["steps"]): number {
  return steps.filter((s) => s.meta?.fallbackUsed === true).length;
}

function extractEstimatedCost(steps: PipelineResult["steps"]): number | null {
  let total = 0;
  let hasCost = false;
  for (const step of steps) {
    const cost = step.meta?.estimatedCostUsd as number | undefined;
    if (cost != null) {
      total += cost;
      hasCost = true;
    }
  }
  return hasCost ? Math.round(total * 10000) / 10000 : null;
}

function extractDurationTotal(steps: PipelineResult["steps"]): number | null {
  let total = 0;
  let hasDuration = false;
  for (const step of steps) {
    const dur = step.meta?.durationMs as number | undefined;
    if (dur != null) {
      total += dur;
      hasDuration = true;
    }
  }
  return hasDuration ? total : null;
}

// ── Regression Status Computation ───────────────────────────

/**
 * Determines overall regression status from pipeline/quality/baseline results.
 */
export function computeRegressionStatus(opts: {
  pipelinePassed: boolean;
  qualityGatesPassed: boolean;
  baselinePassed: boolean;
  fallbackUsed: boolean;
  costDeltaPct: number | null;
  durationDeltaPct: number | null;
}): RegressionStatus {
  // Fail conditions
  if (!opts.pipelinePassed || !opts.qualityGatesPassed || !opts.baselinePassed) {
    return "fail";
  }

  // Degraded conditions
  if (opts.fallbackUsed) return "degraded";
  if (
    opts.costDeltaPct != null &&
    opts.costDeltaPct >= DEGRADATION_THRESHOLDS.costIncreasePct
  ) {
    return "degraded";
  }
  if (
    opts.durationDeltaPct != null &&
    opts.durationDeltaPct >= DEGRADATION_THRESHOLDS.durationIncreasePct
  ) {
    return "degraded";
  }

  return "pass";
}

// ── Comparison Logic ────────────────────────────────────────

/**
 * Compares current regression run with a previous run for the same template.
 * Returns delta percentages for cost and duration, and fallback count delta.
 *
 * If previousRun is null (first regression), returns null deltas.
 */
export function compareWithPreviousRegression(
  currentRun: TemplateRegressionSummary,
  previousRun: TemplateRegressionSummary | null
): RegressionComparison {
  if (!previousRun) {
    return {};
  }

  const costDeltaPct = computeDeltaPct(
    currentRun.estimatedCostTotal,
    previousRun.estimatedCostTotal
  );

  const durationDeltaPct = computeDeltaPct(
    currentRun.durationMsTotal,
    previousRun.durationMsTotal
  );

  const fallbackDelta =
    currentRun.fallbackCount - previousRun.fallbackCount;

  return {
    previousRunId: previousRun.runId,
    costDeltaPct,
    durationDeltaPct,
    fallbackDelta,
  };
}

function computeDeltaPct(
  current: number | null,
  previous: number | null
): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

// ── Build Summary ───────────────────────────────────────────

/**
 * Builds a typed regression summary from pipeline result and comparison data.
 */
export function buildRegressionSummary(opts: {
  templateKey: string;
  shortName: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  pipelineResult: PipelineResult;
  baselinePassed: boolean;
  promotionEligible: boolean;
  previousRun: TemplateRegressionSummary | null;
}): TemplateRegressionSummary {
  const { pipelineResult } = opts;

  const pipelinePassed = pipelineResult.status === "completed";
  const qualityGatesPassed = pipelineResult.qualityStatus === "passed";
  const fallbackCount = extractFallbackCount(pipelineResult.steps);
  const fallbackUsed = fallbackCount > 0;
  const estimatedCostTotal = extractEstimatedCost(pipelineResult.steps);
  const durationMsTotal = extractDurationTotal(pipelineResult.steps);

  const partialSummary: TemplateRegressionSummary = {
    templateKey: opts.templateKey,
    shortName: opts.shortName,
    runId: opts.runId,
    startedAt: opts.startedAt,
    finishedAt: opts.finishedAt,
    pipelinePassed,
    qualityGatesPassed,
    baselinePassed: opts.baselinePassed,
    promotionEligible: opts.promotionEligible,
    fallbackUsed,
    fallbackCount,
    selectedProviders: extractStepProviders(pipelineResult.steps),
    routingScores: extractRoutingScores(pipelineResult.steps),
    estimatedCostTotal,
    durationMsTotal,
    perStepStatus: pipelineResult.steps.map((s) => ({
      key: s.key,
      status: s.status,
      provider: s.meta?.provider as string | undefined,
    })),
    qualityChecks: pipelineResult.qualityChecks,
    regressionStatus: "pass", // placeholder
    errorMessage: pipelineResult.errorMessage,
  };

  const comparison = compareWithPreviousRegression(partialSummary, opts.previousRun);

  const regressionStatus = computeRegressionStatus({
    pipelinePassed,
    qualityGatesPassed,
    baselinePassed: opts.baselinePassed,
    fallbackUsed,
    costDeltaPct: comparison.costDeltaPct ?? null,
    durationDeltaPct: comparison.durationDeltaPct ?? null,
  });

  return {
    ...partialSummary,
    regressionStatus,
    comparison,
  };
}

// ── Report Builder ──────────────────────────────────────────

export function buildNightlyReport(
  nightlyRunId: string,
  startedAt: string,
  finishedAt: string,
  templateResults: TemplateRegressionSummary[]
): NightlyRegressionReport {
  return {
    nightlyRunId,
    startedAt,
    finishedAt,
    templateResults,
    summary: {
      templatesProcessed: templateResults.length,
      passCount: templateResults.filter((r) => r.regressionStatus === "pass").length,
      degradedCount: templateResults.filter((r) => r.regressionStatus === "degraded").length,
      failCount: templateResults.filter((r) => r.regressionStatus === "fail").length,
    },
  };
}

// ── Console Reporting ───────────────────────────────────────

const STATUS_SYMBOLS: Record<RegressionStatus, string> = {
  pass: "PASS",
  degraded: "DEGRADED",
  fail: "FAIL",
};

export function formatRegressionReport(report: NightlyRegressionReport): string {
  const lines: string[] = [];

  lines.push("=== NIGHTLY TEMPLATE REGRESSION ===");
  lines.push(`Run ID:    ${report.nightlyRunId}`);
  lines.push(`Started:   ${report.startedAt}`);
  lines.push(`Finished:  ${report.finishedAt}`);
  lines.push("");

  for (const r of report.templateResults) {
    lines.push(`--- ${r.templateKey} (${r.shortName}) ---`);
    lines.push(`  Status:       ${STATUS_SYMBOLS[r.regressionStatus]}`);
    lines.push(`  Pipeline:     ${r.pipelinePassed ? "PASS" : "FAIL"}`);
    lines.push(`  Quality:      ${r.qualityGatesPassed ? "PASS" : "FAIL"}`);
    lines.push(`  Baseline:     ${r.baselinePassed ? "PASS" : "FAIL"}`);
    lines.push(`  Promotion:    ${r.promotionEligible ? "eligible" : "not eligible"}`);
    lines.push(`  Providers:    ${r.selectedProviders.join(", ") || "N/A"}`);
    lines.push(`  Fallback:     ${r.fallbackUsed ? `yes (${r.fallbackCount})` : "no"}`);
    lines.push(`  Cost:         ${r.estimatedCostTotal != null ? `$${r.estimatedCostTotal}` : "N/A"}`);
    lines.push(`  Duration:     ${r.durationMsTotal != null ? `${r.durationMsTotal}ms` : "N/A"}`);
    if (r.comparison?.costDeltaPct != null) {
      lines.push(`  Cost Delta:   ${r.comparison.costDeltaPct >= 0 ? "+" : ""}${r.comparison.costDeltaPct}%`);
    }
    if (r.comparison?.durationDeltaPct != null) {
      lines.push(`  Duration Δ:   ${r.comparison.durationDeltaPct >= 0 ? "+" : ""}${r.comparison.durationDeltaPct}%`);
    }
    if (r.errorMessage) {
      lines.push(`  Error:        ${r.errorMessage}`);
    }
    lines.push("");
  }

  lines.push("=== SUMMARY ===");
  lines.push(`Templates: ${report.summary.templatesProcessed}`);
  lines.push(`Pass:      ${report.summary.passCount}`);
  lines.push(`Degraded:  ${report.summary.degradedCount}`);
  lines.push(`Fail:      ${report.summary.failCount}`);

  return lines.join("\n");
}
