/**
 * Helper for quality gate run progress display.
 */

export interface CheckProgress {
  key: string;
  label: string;
  status: "pending" | "running" | "passed" | "failed" | "error";
  exitCode: number | null;
  durationMs: number | null;
  hasOutput: boolean;
  /** First 500 chars of stderr for inline preview */
  errorPreview: string | null;
}

export interface QualityProgress {
  runId: string;
  overallStatus: string;
  checks: CheckProgress[];
  isActive: boolean;
  passedCount: number;
  totalCount: number;
  summary: string | null;
}

export function toQualityProgress(run: {
  id: string;
  status: string;
  checks_json: Array<{
    key: string;
    label: string;
    status: string;
    exitCode?: number | null;
    durationMs?: number | null;
    stdout?: string | null;
    stderr?: string | null;
  }>;
  summary?: string | null;
}): QualityProgress {
  const checks: CheckProgress[] = (run.checks_json ?? []).map((c) => ({
    key: c.key,
    label: c.label ?? c.key,
    status: normalizeStatus(c.status),
    exitCode: c.exitCode ?? null,
    durationMs: c.durationMs ?? null,
    hasOutput: !!(c.stdout || c.stderr),
    errorPreview:
      c.stderr && c.status !== "passed"
        ? c.stderr.slice(0, 500)
        : null,
  }));

  const passedCount = checks.filter((c) => c.status === "passed").length;
  const isActive = run.status === "running" || run.status === "pending";

  return {
    runId: run.id,
    overallStatus: run.status,
    checks,
    isActive,
    passedCount,
    totalCount: checks.length,
    summary: run.summary ?? null,
  };
}

function normalizeStatus(
  s: string
): "pending" | "running" | "passed" | "failed" | "error" {
  if (s === "passed") return "passed";
  if (s === "running") return "running";
  if (s === "failed") return "failed";
  if (s === "error") return "error";
  return "pending";
}
