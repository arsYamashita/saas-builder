import { describe, it, expect } from "vitest";
import {
  getModelPricing,
  estimateCostUsd,
  MODEL_PRICING,
} from "../provider-pricing";

describe("getModelPricing", () => {
  it("returns exact match", () => {
    const p = getModelPricing("gemini-2.0-flash");
    expect(p).not.toBeNull();
    expect(p!.inputPer1M).toBe(0.10);
    expect(p!.outputPer1M).toBe(0.40);
  });

  it("returns prefix match for versioned model IDs", () => {
    const p = getModelPricing("gemini-2.0-flash-001");
    expect(p).not.toBeNull();
    expect(p!.inputPer1M).toBe(0.10);
  });

  it("returns null for unknown model", () => {
    expect(getModelPricing("gpt-4o")).toBeNull();
  });

  it("has pricing for all expected models", () => {
    const expected = [
      "gemini-2.0-flash",
      "gemini-2.5-pro-preview-05-06",
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
    ];
    for (const model of expected) {
      expect(MODEL_PRICING[model]).toBeDefined();
    }
  });
});

describe("estimateCostUsd", () => {
  it("calculates cost for gemini-2.0-flash", () => {
    // 1M input + 1M output = $0.10 + $0.40 = $0.50
    const cost = estimateCostUsd("gemini-2.0-flash", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.50, 4);
  });

  it("calculates cost for claude-sonnet-4", () => {
    // 10K input + 5K output
    // = (10000/1M * 3.00) + (5000/1M * 15.00)
    // = 0.03 + 0.075 = 0.105
    const cost = estimateCostUsd("claude-sonnet-4-20250514", 10_000, 5_000);
    expect(cost).toBeCloseTo(0.105, 4);
  });

  it("returns null for unknown model", () => {
    expect(estimateCostUsd("unknown-model", 1000, 1000)).toBeNull();
  });

  it("returns 0 for zero tokens", () => {
    const cost = estimateCostUsd("gemini-2.0-flash", 0, 0);
    expect(cost).toBe(0);
  });
});
