import { describe, it, expect } from "vitest";
import {
  parseRequestSchema,
  diffRequestSchema,
  documentChangeSchema,
} from "../document-analysis";

describe("parseRequestSchema", () => {
  it("accepts valid base64 request", () => {
    const result = parseRequestSchema.safeParse({ base64: "AAAA" });
    expect(result.success).toBe(true);
  });

  it("accepts base64 with filename", () => {
    const result = parseRequestSchema.safeParse({ base64: "AAAA", filename: "test.pdf" });
    expect(result.success).toBe(true);
  });

  it("rejects empty base64", () => {
    const result = parseRequestSchema.safeParse({ base64: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing base64", () => {
    const result = parseRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("diffRequestSchema", () => {
  it("accepts minimal valid request", () => {
    const result = diffRequestSchema.safeParse({ oldText: "a", newText: "b" });
    expect(result.success).toBe(true);
  });

  it("accepts full request with all optional fields", () => {
    const result = diffRequestSchema.safeParse({
      oldText: "old content",
      newText: "new content",
      oldLabel: "v1",
      newLabel: "v2",
      domain: "介護報酬",
      language: "ja",
      localOnly: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty oldText", () => {
    const result = diffRequestSchema.safeParse({ oldText: "", newText: "b" });
    expect(result.success).toBe(false);
  });

  it("rejects empty newText", () => {
    const result = diffRequestSchema.safeParse({ oldText: "a", newText: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(diffRequestSchema.safeParse({}).success).toBe(false);
    expect(diffRequestSchema.safeParse({ oldText: "a" }).success).toBe(false);
    expect(diffRequestSchema.safeParse({ newText: "b" }).success).toBe(false);
  });
});

describe("documentChangeSchema", () => {
  it("accepts valid change", () => {
    const result = documentChangeSchema.safeParse({
      type: "modified",
      location: "第1条",
      summary: "金額が変更",
      impact: "high",
    });
    expect(result.success).toBe(true);
  });

  it("accepts change with snippets", () => {
    const result = documentChangeSchema.safeParse({
      type: "added",
      location: "第4条",
      summary: "新規追加",
      impact: "medium",
      oldSnippet: undefined,
      newSnippet: "新しい条文テキスト",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const result = documentChangeSchema.safeParse({
      type: "unknown",
      location: "a",
      summary: "b",
      impact: "low",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid impact", () => {
    const result = documentChangeSchema.safeParse({
      type: "added",
      location: "a",
      summary: "b",
      impact: "critical",
    });
    expect(result.success).toBe(false);
  });
});
