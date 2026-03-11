/**
 * Task Router
 *
 * Resolves which provider to use for each taskKind.
 * Static routing with fallback support.
 */

import type {
  TaskKind,
  ProviderId,
  ProviderAdapter,
  ExpectedFormat,
  TASK_EXPECTED_FORMAT,
  ProviderRawResult,
} from "./provider-interface";
import { TASK_EXPECTED_FORMAT as FORMAT_MAP } from "./provider-interface";
import { GeminiAdapter } from "./gemini";
import { ClaudeAdapter } from "./claude";
import { OpenAIAdapter } from "./openai";
import {
  normalizeResult,
  validateNormalizedResult,
  type NormalizedResult,
} from "./result-normalizer";

// ── Static Route Table ──────────────────────────────────────

export interface TaskRoute {
  primary: ProviderId;
  fallback: ProviderId | null;
  system?: string;
}

/**
 * Maps each taskKind to its primary and fallback provider.
 * This mirrors the current codebase behavior:
 * - blueprint / brief_rewrite: Gemini primary, Claude fallback
 * - implementation / schema / api_design / file_split: Claude primary, no fallback
 * - ui_generation / quality_fix / regression_repair: Claude primary (future)
 */
const ROUTE_TABLE: Record<TaskKind, TaskRoute> = {
  intake: {
    primary: "gemini",
    fallback: "claude",
  },
  blueprint: {
    primary: "gemini",
    fallback: "claude",
  },
  brief_rewrite: {
    primary: "gemini",
    fallback: "claude",
  },
  implementation: {
    primary: "claude",
    fallback: null,
    system: "You are a senior SaaS architect and tech lead. Return structured implementation guidance.",
  },
  schema: {
    primary: "claude",
    fallback: null,
    system: "You are a PostgreSQL and SaaS schema expert. Return production-grade schema output.",
  },
  api_design: {
    primary: "claude",
    fallback: null,
    system: "You are a Next.js API route and SaaS backend expert. Return production-grade API design.",
  },
  file_split: {
    primary: "claude",
    fallback: null,
    system: "You convert SaaS implementation outputs into saveable file objects. Return JSON only.",
  },
  ui_generation: {
    primary: "claude",
    fallback: null,
  },
  quality_fix: {
    primary: "claude",
    fallback: null,
  },
  regression_repair: {
    primary: "claude",
    fallback: null,
  },
};

// ── Adapter Registry ────────────────────────────────────────

const adapters: Record<ProviderId, ProviderAdapter> = {
  gemini: new GeminiAdapter(),
  claude: new ClaudeAdapter(),
  openai: new OpenAIAdapter(),
};

// ── Router ──────────────────────────────────────────────────

export function getRouteForTask(taskKind: TaskKind): TaskRoute {
  return ROUTE_TABLE[taskKind];
}

export function getExpectedFormat(taskKind: TaskKind): ExpectedFormat {
  return FORMAT_MAP[taskKind];
}

export function getAdapter(providerId: ProviderId): ProviderAdapter {
  return adapters[providerId];
}

export interface TaskResult {
  raw: ProviderRawResult;
  normalized: NormalizedResult;
  warnings: string[];
  validationErrors: Array<{ field: string; message: string }>;
}

/**
 * Executes a task through the adapter layer.
 *
 * 1. Resolves provider from route table
 * 2. Falls back if primary is unavailable
 * 3. Calls provider adapter
 * 4. Normalizes result
 * 5. Validates normalized result
 */
export async function executeTask(
  taskKind: TaskKind,
  prompt: string,
  options?: {
    system?: string;
    maxTokens?: number;
    forceProvider?: ProviderId;
  }
): Promise<TaskResult> {
  const route = ROUTE_TABLE[taskKind];
  const expectedFormat = FORMAT_MAP[taskKind];

  // Resolve provider
  let providerId: ProviderId;
  if (options?.forceProvider) {
    providerId = options.forceProvider;
  } else {
    const primary = adapters[route.primary];
    if (primary.isAvailable()) {
      providerId = route.primary;
    } else if (route.fallback && adapters[route.fallback].isAvailable()) {
      console.log(
        `[task-router] ${route.primary} unavailable for ${taskKind}, falling back to ${route.fallback}`
      );
      providerId = route.fallback;
    } else {
      throw new Error(
        `No available provider for taskKind=${taskKind} (primary=${route.primary}, fallback=${route.fallback})`
      );
    }
  }

  const adapter = adapters[providerId];
  const system = options?.system ?? route.system;

  // Execute
  const raw = await adapter.generate({
    prompt,
    system,
    taskKind,
    maxTokens: options?.maxTokens,
  });

  // Normalize
  const normalized = normalizeResult(raw, expectedFormat);

  // Validate
  const validationErrors = validateNormalizedResult(normalized, expectedFormat);

  return {
    raw,
    normalized,
    warnings: normalized.warnings,
    validationErrors,
  };
}

// ── Introspection ───────────────────────────────────────────

export function listRoutes(): Array<{
  taskKind: TaskKind;
  primary: ProviderId;
  fallback: ProviderId | null;
  expectedFormat: ExpectedFormat;
}> {
  return (Object.keys(ROUTE_TABLE) as TaskKind[]).map((taskKind) => ({
    taskKind,
    primary: ROUTE_TABLE[taskKind].primary,
    fallback: ROUTE_TABLE[taskKind].fallback,
    expectedFormat: FORMAT_MAP[taskKind],
  }));
}
