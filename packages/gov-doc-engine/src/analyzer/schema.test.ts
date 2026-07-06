import { describe, it, expect } from "vitest";
import { DiffAnalysisRequestSchema, SubsidyExtractionSchema, MAX_DIFF_TEXT_LENGTH } from "./schema";

describe("DiffAnalysisRequestSchema — llm_api_unbounded_text_input regression", () => {
  const base = {
    tenantId: "tenant-1",
    sourceId: "mirasapo-plus-subsidy-search",
    sourceUrl: "https://mirasapo-plus.go.jp/subsidy/",
    previousText: "before",
  };

  it("accepts text exactly at the limit", () => {
    expect(() =>
      DiffAnalysisRequestSchema.parse({ ...base, currentText: "a".repeat(MAX_DIFF_TEXT_LENGTH) }),
    ).not.toThrow();
  });

  it("rejects currentText beyond MAX_DIFF_TEXT_LENGTH (regression: unbounded text input)", () => {
    const result = DiffAnalysisRequestSchema.safeParse({
      ...base,
      currentText: "a".repeat(MAX_DIFF_TEXT_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects previousText beyond MAX_DIFF_TEXT_LENGTH", () => {
    const result = DiffAnalysisRequestSchema.safeParse({
      ...base,
      previousText: "a".repeat(MAX_DIFF_TEXT_LENGTH + 1),
      currentText: "ok",
    });
    expect(result.success).toBe(false);
  });

  it("allows previousText: null for a first observation", () => {
    expect(() => DiffAnalysisRequestSchema.parse({ ...base, previousText: null, currentText: "x" })).not.toThrow();
  });

  it("rejects empty currentText", () => {
    expect(DiffAnalysisRequestSchema.safeParse({ ...base, currentText: "" }).success).toBe(false);
  });

  it("rejects a non-URL sourceUrl", () => {
    expect(DiffAnalysisRequestSchema.safeParse({ ...base, sourceUrl: "not-a-url", currentText: "x" }).success).toBe(
      false,
    );
  });
});

describe("SubsidyExtractionSchema", () => {
  const valid = {
    isRelevant: true,
    subsidyName: "IT導入補助金2026（通常枠）",
    targetIndustries: ["全業種"],
    amount: { min: 50_000, max: 4_500_000, unit: "JPY", description: "補助率1/2以内" },
    applicationDeadline: { date: "2026-08-28", description: null },
    summary: "IT導入補助金2026 通常枠が新設された。",
    sourceUrl: "https://mirasapo-plus.go.jp/subsidy/",
    confidence: "high",
  };

  it("accepts a valid structured extraction", () => {
    expect(() => SubsidyExtractionSchema.parse(valid)).not.toThrow();
  });

  it("accepts null amount/deadline fields when unknown", () => {
    const withNulls = {
      ...valid,
      amount: { min: null, max: null, unit: "JPY", description: null },
      applicationDeadline: { date: null, description: "詳細はページ参照" },
    };
    expect(() => SubsidyExtractionSchema.parse(withNulls)).not.toThrow();
  });

  it("rejects a malformed deadline date", () => {
    const result = SubsidyExtractionSchema.safeParse({
      ...valid,
      applicationDeadline: { date: "8/28/2026", description: null },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown confidence value", () => {
    const result = SubsidyExtractionSchema.safeParse({ ...valid, confidence: "certain" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-JPY unit", () => {
    const result = SubsidyExtractionSchema.safeParse({
      ...valid,
      amount: { ...valid.amount, unit: "USD" },
    });
    expect(result.success).toBe(false);
  });
});
