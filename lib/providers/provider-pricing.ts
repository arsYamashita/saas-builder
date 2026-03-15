/**
 * Provider Pricing — Model cost estimation
 *
 * Pricing data for cost-per-generation tracking in Scoreboard v1.1.
 * Prices are in USD per 1M tokens. Update when models/pricing change.
 */

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

/**
 * Pricing table — keyed by model ID.
 * Partial model matching is supported: if exact match fails,
 * tries prefix match (e.g. "gemini-2.0-flash-001" matches "gemini-2.0-flash").
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini
  "gemini-2.0-flash": { inputPer1M: 0.10, outputPer1M: 0.40 },
  "gemini-2.5-flash-preview-05-20": { inputPer1M: 0.15, outputPer1M: 0.60 },
  "gemini-2.5-pro-preview-05-06": { inputPer1M: 1.25, outputPer1M: 10.00 },
  // Claude
  "claude-sonnet-4-20250514": { inputPer1M: 3.00, outputPer1M: 15.00 },
  "claude-opus-4-20250514": { inputPer1M: 15.00, outputPer1M: 75.00 },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80, outputPer1M: 4.00 },
};

/**
 * Look up pricing for a model ID.
 * Falls back to prefix matching if exact match not found.
 */
export function getModelPricing(model: string): ModelPricing | null {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Prefix match: "gemini-2.0-flash-001" → "gemini-2.0-flash"
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) return MODEL_PRICING[key];
  }

  return null;
}

/**
 * Estimate cost in USD from token counts and model ID.
 * Returns null if pricing is unavailable for the model.
 */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const pricing = getModelPricing(model);
  if (!pricing) return null;

  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}
