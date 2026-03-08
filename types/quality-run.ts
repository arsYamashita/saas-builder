export type QualityCheckKey = "lint" | "typecheck" | "playwright";

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
