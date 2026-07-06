import { describe, it, expect } from "vitest";
import { normalizeHtml } from "./normalize";
import { extractSection } from "./extract";
import { detectDiff } from "./diff";
import { loadFixture } from "../test-utils/fixtures";

describe("normalizeHtml", () => {
  it("strips comments, script, style and collapses whitespace", () => {
    const html = `<div>  <!-- comment -->\n<script>evil()</script><style>.x{color:red}</style>\n  Hello   World </div>`;
    const result = normalizeHtml(html);
    expect(result).not.toContain("comment");
    expect(result).not.toContain("evil()");
    expect(result).not.toContain("color:red");
    expect(result).toContain("Hello World");
    expect(result).not.toMatch(/\s{2,}/);
  });
});

describe("extractSection", () => {
  it("extracts innerHTML of the matching selector", () => {
    const html = `<html><body><main id="main-content"><p>hi</p></main></body></html>`;
    expect(extractSection(html, "main#main-content")).toContain("<p>hi</p>");
  });

  it("returns empty string when selector does not match", () => {
    const html = `<html><body><main id="other"></main></body></html>`;
    expect(extractSection(html, "main#main-content")).toBe("");
  });
});

describe("detectDiff — fixture based (mirasapo-plus / jnet21 / mhlw)", () => {
  const cases = [
    {
      name: "mirasapo-plus",
      before: "mirasapo-plus-before.html",
      after: "mirasapo-plus-after.html",
      selector: "main#main-content",
    },
    { name: "jnet21", before: "jnet21-before.html", after: "jnet21-after.html", selector: "div.contents" },
    { name: "mhlw", before: "mhlw-before.html", after: "mhlw-after.html", selector: "div#contentsWrap" },
  ];

  for (const c of cases) {
    it(`${c.name}: detects a change between before/after fixtures`, () => {
      const before = loadFixture(c.before);
      const after = loadFixture(c.after);
      const result = detectDiff({ previousHtml: before, currentHtml: after, selector: c.selector });
      expect(result.changed).toBe(true);
      expect(result.previousHash).not.toBeNull();
      expect(result.previousHash).not.toBe(result.currentHash);
    });

    it(`${c.name}: no change detected when comparing the same fixture twice`, () => {
      const before = loadFixture(c.before);
      const result = detectDiff({ previousHtml: before, currentHtml: before, selector: c.selector });
      expect(result.changed).toBe(false);
      expect(result.previousHash).toBe(result.currentHash);
    });
  }

  it("first observation (previousHtml = null) is always reported as changed", () => {
    const after = loadFixture("mirasapo-plus-after.html");
    const result = detectDiff({ previousHtml: null, currentHtml: after, selector: "main#main-content" });
    expect(result.changed).toBe(true);
    expect(result.previousHash).toBeNull();
    expect(result.previousNormalized).toBeNull();
  });

  it("ignores unrelated markup changes outside the selector (header text differs, main content unchanged)", () => {
    // mirasapo-plus-before と -after は <header> の文言が異なるが、selector が
    // main#main-content に絞っているため、本文だけを比較した diff で判定したい。
    // ここでは前後の <main> を同一内容にした合成フィクスチャで検証する。
    const before = loadFixture("mirasapo-plus-before.html");
    const afterWithChangedHeaderOnly = before.replace(
      "グローバルナビ（無関係な広告タグ等はここに入る）",
      "グローバルナビ（差し替え後の広告タグ）",
    );
    expect(afterWithChangedHeaderOnly).not.toBe(before);

    const result = detectDiff({
      previousHtml: before,
      currentHtml: afterWithChangedHeaderOnly,
      selector: "main#main-content",
    });
    expect(result.changed).toBe(false);
  });
});
