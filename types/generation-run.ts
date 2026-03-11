export type GenerationStepStatus = "pending" | "running" | "completed" | "failed";

export type StepReviewStatus = "pending" | "approved" | "rejected";

export type GenerationStepMeta = {
  taskKind?: string;
  provider?: string;
  model?: string;
  expectedFormat?: string;
  durationMs?: number;
  warningCount?: number;
  errorCount?: number;
  resultSummary?: string;
  reviewStatus?: StepReviewStatus;
  reviewedAt?: string;
  rerunAt?: string;
  invalidatedAt?: string;
  invalidatedByStep?: string;
  rerunError?: string;
  rejectReason?: string;
};

export type GenerationStep = {
  key:
    | "blueprint"
    | "implementation"
    | "schema"
    | "api_design"
    | "split_files"
    | "export_files";
  label: string;
  status: GenerationStepStatus;
  meta?: GenerationStepMeta;
};

export type GenerationRunReviewStatus = "pending" | "approved" | "rejected";

export type GenerationRunRecord = {
  id: string;
  project_id: string;
  template_key: string;
  status: "running" | "completed" | "failed";
  current_step?: string | null;
  steps_json: GenerationStep[];
  error_message?: string | null;
  provider?: string | null;
  model?: string | null;
  review_status: GenerationRunReviewStatus;
  reviewed_at?: string | null;
  promoted_at?: string | null;
  baseline_tag?: string | null;
  started_at: string;
  finished_at?: string | null;
};
