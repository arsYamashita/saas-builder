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
  /** Token usage from provider API */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** Estimated cost in USD based on model pricing */
  estimatedCostUsd?: number;
  /** True when the primary provider failed and fallback was used */
  fallbackUsed?: boolean;
  /** The provider that was tried first and failed (only set when fallbackUsed=true) */
  fallbackFromProvider?: string;
  /** Error message from the primary provider failure */
  fallbackReason?: string;
  /** Routing Intelligence: final score that determined provider selection */
  routingScore?: number;
  /** Routing Intelligence: base score from global historical metrics */
  routingBaseScore?: number;
  /** Routing Intelligence: recent score from recent performance window */
  routingRecentScore?: number;
  /** Routing Intelligence: metrics window used ("global" | "adaptive") */
  routingMetricsWindow?: string;
  /** Routing Intelligence: fallback providers ordered by score */
  routingFallbacks?: string[];
  /** Cost Guardrail v1: result of budget check ("allowed" | "downgraded" | "blocked") */
  costGuardrailResult?: string;
  /** Cost Guardrail v1: providers rejected due to budget */
  budgetRejectedProviders?: string[];
  /** Cost Guardrail v1: original top-ranked provider before budget filtering */
  costDowngradedFromProvider?: string;
  /** Cost Guardrail v1: cheaper provider selected after budget filtering */
  costDowngradedToProvider?: string;
  /** Cost Guardrail v1: projected cost for this step */
  projectedStepCost?: number;
  /** Cost Guardrail v1: accumulated estimated cost across the run */
  accumulatedEstimatedCost?: number;
  /** Provider Learning Loop v1: whether learning adjustment was applied */
  learningApplied?: boolean;
  /** Provider Learning Loop v1: confidence of the learning signal (0–1) */
  learningConfidence?: number;
  /** Provider Learning Loop v1: providers classified as preferred */
  learningPreferredProviders?: string[];
  /** Provider Learning Loop v1: providers classified as avoided */
  learningAvoidedProviders?: string[];
  /** Provider Learning Loop v1: human-readable reason summary */
  learningReasonSummary?: string;
  /** Provider Learning Loop v1: provider order before learning adjustment */
  routingBaseOrder?: string[];
  /** Provider Learning Loop v1: provider order after learning adjustment */
  routingFinalOrder?: string[];
  /** Factory Intelligence Control Plane v1: policy mode used for this step */
  intelligenceMode?: string;
  /** Factory Intelligence Control Plane v1: whether regression penalty was applied */
  regressionPenaltyApplied?: boolean;
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

/** Factory Intelligence Control Plane v1: run-level intelligence metadata */
export type RunIntelligenceMeta = {
  intelligenceMode?: string;
  learningAppliedStepCount?: number;
  downgradedStepCount?: number;
  blockedStepCount?: number;
  fallbackStepCount?: number;
  regressionPenaltyStepCount?: number;
  overallStatus?: string;
};

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
  /** Factory Intelligence Control Plane v1: run-level intelligence summary */
  intelligence_meta?: RunIntelligenceMeta;
};
