import { describe, it, expect, vi, afterEach } from "vitest";
import { MODELS, assertValidModel, resolveModelFromEnv, UnknownModelError } from "../core/models";

describe("MODELS — 共通モデルID定数 (指示書2026-07-06_031)", () => {
  it("現行世代の3モデルを定義する", () => {
    expect(MODELS.opus).toBe("claude-opus-4-8");
    expect(MODELS.sonnet).toBe("claude-sonnet-5");
    expect(MODELS.haiku).toBe("claude-haiku-4-5-20251001");
  });
});

describe("assertValidModel — サイレント劣化ガード", () => {
  it("MODELS の値はすべて許可する", () => {
    expect(() => assertValidModel(MODELS.opus)).not.toThrow();
    expect(() => assertValidModel(MODELS.sonnet)).not.toThrow();
    expect(() => assertValidModel(MODELS.haiku)).not.toThrow();
  });

  it("ネガティブテスト: 旧世代モデルID (claude-sonnet-4-5) は明示エラーになる", () => {
    expect(() => assertValidModel("claude-sonnet-4-5")).toThrow(UnknownModelError);
  });

  it("ネガティブテスト: 旧世代モデルID (claude-opus-4-20250514) は明示エラーになる", () => {
    expect(() => assertValidModel("claude-opus-4-20250514")).toThrow(UnknownModelError);
  });

  it("ネガティブテスト: 空文字は明示エラーになる", () => {
    expect(() => assertValidModel("")).toThrow(UnknownModelError);
  });

  it("ネガティブテスト: undefined/null は明示エラーになる", () => {
    expect(() => assertValidModel(undefined)).toThrow(UnknownModelError);
    expect(() => assertValidModel(null)).toThrow(UnknownModelError);
  });

  it("ネガティブテスト: 未知のモデルIDは明示エラーになる", () => {
    expect(() => assertValidModel("claude-opus-9000")).toThrow(UnknownModelError);
  });

  it("誤検知しない: haiku-4-5 は '-4-5' サフィックスだが現行世代なので許可される", () => {
    // allowlist方式であることの確認 — もし正規表現ブロックリスト方式なら
    // 「-4-5で終わる」という理由で誤って弾かれてしまう。
    expect(() => assertValidModel("claude-haiku-4-5-20251001")).not.toThrow();
  });

  it("エラーメッセージはユーザー向け汎用文言のみで、モデルID自体を含まない (api_error_message_internal_leak対策)", () => {
    try {
      assertValidModel("claude-sonnet-4-5");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownModelError);
      const e = err as UnknownModelError;
      expect(e.message).not.toContain("claude-sonnet-4-5");
      expect(e.attemptedModel).toBe("claude-sonnet-4-5"); // 詳細はプロパティ側に保持
    }
  });

  it("詳細はサーバーログ (console.error) に出す", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertValidModel("claude-sonnet-4-5")).toThrow();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0].join(" ")).toContain("claude-sonnet-4-5");
    spy.mockRestore();
  });
});

describe("resolveModelFromEnv", () => {
  afterEach(() => vi.restoreAllMocks());

  it("env未設定ならfallbackを使う", () => {
    expect(resolveModelFromEnv(undefined, MODELS.opus)).toBe(MODELS.opus);
    expect(resolveModelFromEnv("", MODELS.opus)).toBe(MODELS.opus);
    expect(resolveModelFromEnv("   ", MODELS.opus)).toBe(MODELS.opus);
  });

  it("env が有効なMODELS値ならそれを使う", () => {
    expect(resolveModelFromEnv(MODELS.sonnet, MODELS.opus)).toBe(MODELS.sonnet);
  });

  it("env が旧世代/未知のモデルIDなら例外 (ドリフトを構造的に防止)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => resolveModelFromEnv("claude-sonnet-4-5", MODELS.opus)).toThrow(UnknownModelError);
  });
});
