# Provider Scoreboard v1.1 — Design Memo

## Overview

Scoreboard v1 tracks: success rate, fallback rate, rerun rate, duration (avg/p50/p95).
v1.1 adds: **token usage**, **cost per generation**, **fallback reason**, **provider contribution to promotion rate**.

## Current Data Flow

```
ProviderAdapter.generate()
  → ProviderRawResult { provider, model, text, raw, durationMs, fallbackUsed?, fallbackFromProvider? }
    → buildStepMeta(taskKind, TaskResult)
      → GenerationStepMeta { provider, model, durationMs, fallbackUsed, ... }
        → stored in generation_runs.steps_json[].meta (JSONB)
          → buildProviderScoreboard() reads steps_json
```

## Changes Required

### 1. Token Usage

**ProviderRawResult** — add fields:
```ts
inputTokens?: number;
outputTokens?: number;
totalTokens?: number;
```

**GenerationStepMeta** — add fields:
```ts
inputTokens?: number;
outputTokens?: number;
totalTokens?: number;
```

**Adapter changes**:
- Gemini: `response.usageMetadata.promptTokenCount` / `candidatesTokenCount` / `totalTokenCount`
- Claude: `response.usage.input_tokens` / `output_tokens`

**No migration needed** — meta is JSONB, new fields are optional.

### 2. Cost per Generation

**Pricing table** — new file `lib/providers/provider-pricing.ts`:
```ts
export const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "gemini-2.0-flash": { inputPer1M: 0.10, outputPer1M: 0.40 },
  "gemini-2.5-pro-preview-05-06": { inputPer1M: 1.25, outputPer1M: 10.00 },
  "claude-sonnet-4-20250514": { inputPer1M: 3.00, outputPer1M: 15.00 },
  "claude-opus-4-20250514": { inputPer1M: 15.00, outputPer1M: 75.00 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number;
```

**GenerationStepMeta** — add:
```ts
estimatedCostUsd?: number;
```

**buildStepMeta()** — call `estimateCostUsd()` if token counts are available.

### 3. Fallback Reason

**ProviderRawResult** — add:
```ts
fallbackReason?: string;  // error message or code from primary provider failure
```

**GenerationStepMeta** — add:
```ts
fallbackReason?: string;
```

**Adapter/Router** — capture error message when primary fails before fallback.

### 4. Provider Contribution to Promotion Rate

**ProviderTaskMetric** — add:
```ts
promotedSteps: number;       // steps in promoted runs
promotedStepRate: number;    // promotedSteps / totalSteps * 100
totalTokens: number;
totalCostUsd: number;
avgCostPerStep: number;
```

**TemplateProviderSummary** — add:
```ts
totalCostUsd: number;
avgCostPerRun: number;
```

**buildProviderScoreboard()** — pass `promoted_at` flag through to step accumulation.

### 5. UI Changes (page.tsx)

Add columns to MetricTable:
- Tokens (in/out/total)
- Cost ($)
- Fallback Reason (tooltip)
- Promotion Contribution

Add per-template cost summary row.

## File Changes

| File | Change |
|---|---|
| `lib/providers/provider-interface.ts` | Add token/fallback fields to ProviderRawResult |
| `types/generation-run.ts` | Add token/cost/fallback fields to GenerationStepMeta |
| `lib/providers/step-meta.ts` | Capture tokens/cost in buildStepMeta() |
| `lib/providers/provider-pricing.ts` | **NEW** — pricing table + estimateCostUsd() |
| `lib/providers/provider-scoreboard.ts` | Add token/cost/promotion accumulation |
| `app/(builder)/provider-scoreboard/page.tsx` | Add new columns |
| `lib/providers/__tests__/provider-scoreboard.test.ts` | Update tests |

## No DB Migration

All new fields are optional additions to existing JSONB columns.
Backward compatible — old runs without token data show `-` in UI.

## Implementation Order

1. `provider-pricing.ts` (new, pure function, testable)
2. `provider-interface.ts` + `generation-run.ts` (type additions)
3. `step-meta.ts` (capture logic)
4. `provider-scoreboard.ts` (accumulation)
5. `page.tsx` (UI)
6. Tests
