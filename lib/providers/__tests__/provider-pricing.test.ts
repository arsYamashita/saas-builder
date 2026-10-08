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
    expect(getModelPricing("llama-3-70b")).toBeNull();
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

describe("現行世代の料金 (指示書148 / claude-api skill 2026-09-25)", () => {
  it.each([
    ["claude-opus-5-5", 4, 20],
    ["claude-opus-5", 5, 25],
    ["claude-opus-4-8", 5, 25],
    ["claude-sonnet-5-5", 2, 10],
    ["claude-sonnet-5", 2, 10],
    ["claude-sonnet-4-6", 3, 15],
    ["claude-haiku-4-5-20251001", 1, 5],
  ])("%s は $%d/$%d", (model, i, o) => {
    expect(getModelPricing(model)).toEqual({ inputPer1M: i, outputPer1M: o });
  });

  it("claude-opus-5-5 は前方一致で claude-opus-5 ($5/$25) に誤当たりしない", () => {
    expect(getModelPricing("claude-opus-5-5")!.inputPer1M).toBe(4);
    expect(estimateCostUsd("claude-opus-5-5", 1_000_000, 1_000_000)).toBeCloseTo(24, 4);
  });

  it("claude-sonnet-5-5 は前方一致で claude-sonnet-5 に誤当たりしない (値が同じでも行は別)", () => {
    expect(MODEL_PRICING["claude-sonnet-5-5"]).toBeDefined();
    expect(MODEL_PRICING["claude-sonnet-5-5"]).not.toBe(MODEL_PRICING["claude-sonnet-5"]);
  });

  it("日付付きの派生IDは前方一致で最も近い行に当たる", () => {
    expect(getModelPricing("claude-opus-5-5-20261001")!.inputPer1M).toBe(4);
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
