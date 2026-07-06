// ── config ──────────────────────────────────────────────────
export { DEFAULT_CLAUDE_MODEL, resolveClaudeModel } from "./config/models";

// ── collector (収集層) ──────────────────────────────────────
export { WatcherSourceSchema, WatcherConfigSchema, type WatcherSource, type WatcherConfig } from "./collector/types";
export { loadWatcherConfigFromYaml, loadWatcherConfigFromFile } from "./collector/config-loader";
export { normalizeHtml } from "./collector/normalize";
export { hashContent } from "./collector/hash";
export { extractSection } from "./collector/extract";
export { detectDiff, type DiffResult } from "./collector/diff";
export {
  DocumentWatcher,
  startPolling,
  type FetchFn,
  type WatcherStore,
  type WatchResult,
  type SchedulerHandle,
} from "./collector/watcher";

// ── analyzer (解析層) ───────────────────────────────────────
export {
  MAX_DIFF_TEXT_LENGTH,
  DiffAnalysisRequestSchema,
  SubsidyExtractionSchema,
  type DiffAnalysisRequest,
  type SubsidyExtraction,
} from "./analyzer/schema";
export {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  DEFAULT_ESTIMATED_TOKENS_PER_REQUEST,
  applyReservation,
  reservationAdjustment,
  InMemoryTenantUsageGuard,
  type TenantUsageGuard,
  type ReservationResult,
} from "./analyzer/usage-guard";
export {
  FailureThresholdTracker,
  InMemoryAlertSink,
  recordAiFailure,
  type AlertSink,
  type AiFailureEvent,
  type AiFailureReason,
  type ThresholdExceededEvent,
} from "./analyzer/alerts";
export {
  analyzeDiff,
  createAnthropicClaudeClient,
  createClaudeClientFromEnv,
  AiApiUnavailableError,
  AiUsageLimitExceededError,
  AiResponseParseError,
  AiRefusalError,
  type AnalyzeDiffDeps,
  type ClaudeMessagesClient,
  type ClaudeMessageResponse,
} from "./analyzer/claude-client";
export { buildUnifiedDiffText, buildUserPrompt, SYSTEM_INSTRUCTIONS } from "./analyzer/prompt";
export { SUBSIDY_OUTPUT_JSON_SCHEMA } from "./analyzer/output-schema";

// ── application (適用層 — インターフェイスのみ) ─────────────
export type { SubsidyDetectionAdapter } from "./application/adapter";
