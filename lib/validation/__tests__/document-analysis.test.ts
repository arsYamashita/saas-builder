import { describe, it, expect } from "vitest";
import {
  parseRequestSchema,
  diffRequestSchema,
  documentChangeSchema,
} from "../document-analysis";
import {
  MAX_LLM_INPUT_CHARS,
  MAX_LLM_INPUT_BASE64_BYTES,
  MAX_LOCAL_DIFF_INPUT_CHARS,
  MAX_LLM_LABEL_FIELD_CHARS,
} from "../llm-input-limits";

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

  // Wiring test for llm_api_unbounded_text_input: an oversized base64 payload
  // must be rejected at the validation layer, before it ever reaches the
  // PDF parser / LLM call.
  it("accepts base64 exactly at the max length", () => {
    const base64 = "A".repeat(MAX_LLM_INPUT_BASE64_BYTES);
    const result = parseRequestSchema.safeParse({ base64 });
    expect(result.success).toBe(true);
  });

  it("rejects base64 one char over the max length (does not reach LLM call)", () => {
    const base64 = "A".repeat(MAX_LLM_INPUT_BASE64_BYTES + 1);
    const result = parseRequestSchema.safeParse({ base64 });
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

  // Wiring test for llm_api_unbounded_text_input: oversized oldText/newText
  // must be rejected before compareDocuments() forwards them to Claude.
  it("accepts oldText/newText exactly at the max length", () => {
    const text = "a".repeat(MAX_LLM_INPUT_CHARS);
    const result = diffRequestSchema.safeParse({ oldText: text, newText: text });
    expect(result.success).toBe(true);
  });

  it("rejects oldText one char over the max length (does not reach LLM call)", () => {
    const oldText = "a".repeat(MAX_LLM_INPUT_CHARS + 1);
    const result = diffRequestSchema.safeParse({ oldText, newText: "b" });
    expect(result.success).toBe(false);
  });

  it("rejects newText one char over the max length (does not reach LLM call)", () => {
    const newText = "a".repeat(MAX_LLM_INPUT_CHARS + 1);
    const result = diffRequestSchema.safeParse({ oldText: "a", newText });
    expect(result.success).toBe(false);
  });

  // Codex review (指示書043, P2): localOnly=true never reaches Claude, so it
  // must not be capped by the LLM-specific limit — only by the much larger
  // local-diff safety cap.
  it("accepts oldText/newText over MAX_LLM_INPUT_CHARS when localOnly=true", () => {
    const text = "a".repeat(MAX_LLM_INPUT_CHARS + 1);
    const result = diffRequestSchema.safeParse({ oldText: text, newText: text, localOnly: true });
    expect(result.success).toBe(true);
  });

  it("still rejects text over MAX_LOCAL_DIFF_INPUT_CHARS even when localOnly=true", () => {
    const text = "a".repeat(MAX_LOCAL_DIFF_INPUT_CHARS + 1);
    const result = diffRequestSchema.safeParse({ oldText: text, newText: "b", localOnly: true });
    expect(result.success).toBe(false);
  });

  it("rejects oldText over MAX_LLM_INPUT_CHARS when localOnly is omitted (defaults to LLM path)", () => {
    const oldText = "a".repeat(MAX_LLM_INPUT_CHARS + 1);
    const result = diffRequestSchema.safeParse({ oldText, newText: "b" });
    expect(result.success).toBe(false);
  });

  it("rejects oldText over MAX_LLM_INPUT_CHARS when localOnly is explicitly false", () => {
    const oldText = "a".repeat(MAX_LLM_INPUT_CHARS + 1);
    const result = diffRequestSchema.safeParse({ oldText, newText: "b", localOnly: false });
    expect(result.success).toBe(false);
  });

  // Codex review (指示書043, P1): buildDiffPrompt() interpolates
  // oldLabel/newLabel/domain verbatim (domain twice) — a caller could keep
  // oldText/newText within limits while smuggling megabytes into a "label"
  // field instead. Must be bounded independently of the body-text caps.
  it("rejects oldLabel one char over the label max length", () => {
    const result = diffRequestSchema.safeParse({
      oldText: "a",
      newText: "b",
      oldLabel: "x".repeat(MAX_LLM_LABEL_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects newLabel one char over the label max length", () => {
    const result = diffRequestSchema.safeParse({
      oldText: "a",
      newText: "b",
      newLabel: "x".repeat(MAX_LLM_LABEL_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects domain one char over the label max length", () => {
    const result = diffRequestSchema.safeParse({
      oldText: "a",
      newText: "b",
      domain: "x".repeat(MAX_LLM_LABEL_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts label fields exactly at the max length", () => {
    const label = "x".repeat(MAX_LLM_LABEL_FIELD_CHARS);
    const result = diffRequestSchema.safeParse({
      oldText: "a",
      newText: "b",
      oldLabel: label,
      newLabel: label,
      domain: label,
    });
    expect(result.success).toBe(true);
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
