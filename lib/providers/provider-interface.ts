/**
 * Provider Adapter Layer — Core Interfaces
 *
 * All external AI providers implement ProviderAdapter.
 * The system never calls provider APIs directly; it always goes through adapters.
 */

// ── Task Kinds ──────────────────────────────────────────────

export type TaskKind =
  | "intake"
  | "blueprint"
  | "brief_rewrite"
  | "implementation"
  | "schema"
  | "api_design"
  | "file_split"
  | "ui_generation"
  | "quality_fix"
  | "regression_repair";

// ── Expected Output Formats ─────────────────────────────────

export type ExpectedFormat = "json" | "text" | "files";

export const TASK_EXPECTED_FORMAT: Record<TaskKind, ExpectedFormat> = {
  intake: "text",
  blueprint: "json",
  brief_rewrite: "json",
  implementation: "text",
  schema: "text",
  api_design: "text",
  file_split: "files",
  ui_generation: "files",
  quality_fix: "files",
  regression_repair: "files",
};

// ── Provider IDs ────────────────────────────────────────────

export type ProviderId = "gemini" | "claude" | "openai";

// ── Raw Result ──────────────────────────────────────────────

export interface ProviderRawResult {
  provider: ProviderId;
  model: string;
  text: string;
  raw: unknown;
  durationMs: number;
  /** Token counts from provider API response */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** True when fallback provider was used instead of primary */
  fallbackUsed?: boolean;
  /** The primary provider that failed (only set when fallbackUsed=true) */
  fallbackFromProvider?: ProviderId;
  /** Error message from primary provider failure (only set when fallbackUsed=true) */
  fallbackReason?: string;
}

// ── Generation Request ──────────────────────────────────────

export interface GenerationRequest {
  prompt: string;
  system?: string;
  taskKind: TaskKind;
  maxTokens?: number;
}

// ── Provider Adapter ────────────────────────────────────────

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly defaultModel: string;

  generate(request: GenerationRequest): Promise<ProviderRawResult>;

  /** Returns true if the provider has a valid API key configured */
  isAvailable(): boolean;
}
