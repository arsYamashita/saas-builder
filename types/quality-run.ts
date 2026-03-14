export type QualityCheckKey = "lint" | "typecheck" | "playwright" | (string & {});

export type QualityCheckStatus = "pending" | "running" | "passed" | "failed" | "error";

export type QualityCheck = {
  key: QualityCheckKey;
  label: string;
  status: QualityCheckStatus;
  stdout?: string | null;
  stderr?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
};

/**
 * Declarative quality gate definition.
 * Common gates are shared across all templates.
 * Templates can declare extra gates via TemplateManifest.extraQualityGates.
 */
export type QualityGateDefinition = {
  key: string;
  label: string;
  /** Shell command to execute (relative to project export dir) */
  tool: string;
  required: boolean;
  timeoutMs: number;
};

/** Common quality gates — always run for every template. */
export const COMMON_QUALITY_GATES: QualityGateDefinition[] = [
  { key: "lint", label: "ESLint", tool: "eslint", required: true, timeoutMs: 120_000 },
  { key: "typecheck", label: "TypeScript Check", tool: "tsc --noEmit", required: true, timeoutMs: 120_000 },
  { key: "playwright", label: "Playwright E2E", tool: "playwright test", required: true, timeoutMs: 180_000 },
];

export type QualityRunRecord = {
  id: string;
  project_id: string;
  generation_run_id?: string | null;
  status: "running" | "passed" | "failed" | "error";
  checks_json: QualityCheck[];
  summary?: string | null;
  started_at: string;
  finished_at?: string | null;
};
