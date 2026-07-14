import { describe, it, expect } from "vitest";
import { rewriteBriefRequestSchema } from "../rewrite-brief";
import { MAX_LLM_BRIEF_FIELD_CHARS } from "../llm-input-limits";

describe("rewriteBriefRequestSchema", () => {
  it("accepts an empty body (all fields optional)", () => {
    const result = rewriteBriefRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a normal request", () => {
    const result = rewriteBriefRequestSchema.safeParse({
      summary: "既存の要約",
      problemToSolve: "課題",
      targetUsers: "ターゲット",
    });
    expect(result.success).toBe(true);
  });

  // Wiring test for llm_api_unbounded_text_input: previously this route had
  // no schema at all, so any of these fields could carry unbounded text
  // straight into the rewrite-project-brief LLM prompt.
  it("accepts summary exactly at the max length", () => {
    const result = rewriteBriefRequestSchema.safeParse({
      summary: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS),
    });
    expect(result.success).toBe(true);
  });

  it("rejects summary one char over the max length (does not reach LLM call)", () => {
    const result = rewriteBriefRequestSchema.safeParse({
      summary: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects problemToSolve one char over the max length", () => {
    const result = rewriteBriefRequestSchema.safeParse({
      problemToSolve: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects targetUsers one char over the max length", () => {
    const result = rewriteBriefRequestSchema.safeParse({
      targetUsers: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });
});
