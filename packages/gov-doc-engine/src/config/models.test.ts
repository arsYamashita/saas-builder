import { describe, it, expect, vi } from "vitest";
import { resolveClaudeModel, DEFAULT_CLAUDE_MODEL } from "./models";
import { MODELS, UnknownModelError } from "@saas/llm-guard";

describe("resolveClaudeModel — @saas/llm-guard 経由のサイレント劣化ガード (指示書2026-07-06_031)", () => {
  it("env未設定なら DEFAULT_CLAUDE_MODEL (MODELS.opus) を返す", () => {
    expect(resolveClaudeModel({})).toBe(DEFAULT_CLAUDE_MODEL);
    expect(DEFAULT_CLAUDE_MODEL).toBe(MODELS.opus);
  });

  it("env が現行世代モデルID (MODELS.sonnet) なら上書きを許可する", () => {
    expect(resolveClaudeModel({ GOV_DOC_ENGINE_CLAUDE_MODEL: MODELS.sonnet })).toBe(MODELS.sonnet);
  });

  it("ネガティブテスト: env が旧世代モデルID (claude-sonnet-4-5) なら黙って通さず例外を投げる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => resolveClaudeModel({ GOV_DOC_ENGINE_CLAUDE_MODEL: "claude-sonnet-4-5" })).toThrow(
      UnknownModelError,
    );
    vi.restoreAllMocks();
  });

  it("ネガティブテスト: env が空文字や空白のみなら DEFAULT_CLAUDE_MODEL にフォールバックする(例外にはしない)", () => {
    expect(resolveClaudeModel({ GOV_DOC_ENGINE_CLAUDE_MODEL: "" })).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveClaudeModel({ GOV_DOC_ENGINE_CLAUDE_MODEL: "   " })).toBe(DEFAULT_CLAUDE_MODEL);
  });
});
