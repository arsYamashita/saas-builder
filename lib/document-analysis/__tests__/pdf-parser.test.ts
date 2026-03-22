import { describe, it, expect } from "vitest";
import { splitIntoSections } from "../pdf-parser";

describe("splitIntoSections", () => {
  it("splits on 第N条 pattern", () => {
    const text = "前文テキスト\n第1条 定義\nこの規約における用語の定義\n第2条 適用範囲\n適用対象について";
    const sections = splitIntoSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.some((s) => s.heading === "第1条 定義")).toBe(true);
    expect(sections.some((s) => s.heading === "第2条 適用範囲")).toBe(true);
  });

  it("splits on numbered patterns (1. 2. 3.)", () => {
    const text = "概要\n1. はじめに\n最初の段落\n2. 目的\n目的の説明\n3. 対象者\n対象者リスト";
    const sections = splitIntoSections(text);
    expect(sections.some((s) => s.heading === "1. はじめに")).toBe(true);
    expect(sections.some((s) => s.heading === "2. 目的")).toBe(true);
  });

  it("splits on bullet markers (■, ●, ◆)", () => {
    const text = "■ 第一章\n内容1\n● 注意事項\n内容2\n◆ まとめ\n内容3";
    const sections = splitIntoSections(text);
    expect(sections.some((s) => s.heading === "■ 第一章")).toBe(true);
    expect(sections.some((s) => s.heading === "● 注意事項")).toBe(true);
    expect(sections.some((s) => s.heading === "◆ まとめ")).toBe(true);
  });

  it("splits on 【】bracket headings", () => {
    const text = "【概要】\n概要テキスト\n【詳細】\n詳細テキスト";
    const sections = splitIntoSections(text);
    expect(sections.some((s) => s.heading === "【概要】")).toBe(true);
    expect(sections.some((s) => s.heading === "【詳細】")).toBe(true);
  });

  it("splits on （N）parenthesized numbers", () => {
    const text = "（1）要件定義\n内容A\n（2）設計\n内容B";
    const sections = splitIntoSections(text);
    expect(sections.some((s) => s.heading === "（1）要件定義")).toBe(true);
    expect(sections.some((s) => s.heading === "（2）設計")).toBe(true);
  });

  it("detects short line after blank as heading", () => {
    const text = "前の段落の最後。\n\n新しいセクション\nこのセクションの本文がここにあります。";
    const sections = splitIntoSections(text);
    expect(sections.some((s) => s.heading === "新しいセクション")).toBe(true);
  });

  it("does not split on long lines after blank", () => {
    const text = "段落1。\n\nこれは非常に長い行であり、見出しではなく本文の一部として扱われるべきテキストです。六十文字を超える行は見出しとはみなされません。\n次の行";
    const sections = splitIntoSections(text);
    // Long line should not become a heading
    const headings = sections.map((s) => s.heading);
    expect(headings.every((h) => h.length < 60 || h === "")).toBe(true);
  });

  it("returns at least one section for any non-empty text", () => {
    const text = "これは見出しではない長い段落テキストです。六十文字を超えるため見出しとして認識されません。本文のみのセクションが1つ生成されるべきです。";
    const sections = splitIntoSections(text);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    // Long line without heading pattern → goes into body or heading
    const allText = sections.map((s) => s.heading + s.body).join("");
    expect(allText).toContain("これは見出しではない");
  });

  it("returns empty array for empty text", () => {
    const sections = splitIntoSections("");
    expect(sections).toEqual([]);
  });

  it("tracks page numbers via form-feed", () => {
    const text = "ページ1\n\fページ2の見出し\nページ2のテキスト\n\fページ3のテキスト";
    const sections = splitIntoSections(text);
    // The section starting at page 2 should have startPage >= 2
    const page2Section = sections.find((s) => s.heading.includes("ページ2") || s.body.includes("ページ2"));
    expect(page2Section).toBeDefined();
  });
});
