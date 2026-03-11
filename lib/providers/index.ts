/**
 * Provider Adapter Layer — Barrel Export
 */

// Core interfaces
export type {
  TaskKind,
  ExpectedFormat,
  ProviderId,
  ProviderRawResult,
  GenerationRequest,
  ProviderAdapter,
} from "./provider-interface";
export { TASK_EXPECTED_FORMAT } from "./provider-interface";

// Adapters
export { GeminiAdapter } from "./gemini";
export { ClaudeAdapter } from "./claude";
export { OpenAIAdapter } from "./openai";

// Normalizer
export type {
  NormalizedResult,
  NormalizedJsonResult,
  NormalizedTextResult,
  NormalizedFilesResult,
  NormalizedFileEntry,
  ValidationError,
} from "./result-normalizer";
export {
  normalizeResult,
  validateNormalizedResult,
  stripCodeFences,
  extractJsonFromText,
  parseFileBlocks,
} from "./result-normalizer";

// Router
export type { TaskRoute, TaskResult } from "./task-router";
export {
  executeTask,
  getRouteForTask,
  getExpectedFormat,
  getAdapter,
  listRoutes,
} from "./task-router";

// Step Metadata
export { buildStepMeta, mergeStepMetas } from "./step-meta";
