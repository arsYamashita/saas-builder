import { describe, it, expect } from "vitest";
import { compareDocumentsLocal } from "../document-diff";

describe("compareDocumentsLocal", () => {
  it("detects added lines", () => {
    const result = compareDocumentsLocal("line1\nline2", "line1\nline2\nline3");
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(0);
  });

  it("detects removed lines", () => {
    const result = compareDocumentsLocal("line1\nline2\nline3", "line1\nline2");
    expect(result.removedLines).toBe(1);
    expect(result.addedLines).toBe(0);
  });

  it("detects modified lines", () => {
    const result = compareDocumentsLocal("line1\nold line\nline3", "line1\nnew line\nline3");
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(1);
    expect(result.unchangedLines).toBe(2);
  });

  it("returns zero change for identical documents", () => {
    const result = compareDocumentsLocal("same\ncontent", "same\ncontent");
    expect(result.addedLines).toBe(0);
    expect(result.removedLines).toBe(0);
    expect(result.changeRatio).toBe(0);
  });

  it("returns 100% change for completely different documents", () => {
    const result = compareDocumentsLocal("old1\nold2\nold3", "new1\nnew2\nnew3");
    expect(result.addedLines).toBe(3);
    expect(result.removedLines).toBe(3);
    expect(result.changeRatio).toBe(2); // 6 changes / 3 max lines
  });

  it("handles empty old document", () => {
    const result = compareDocumentsLocal("", "line1\nline2");
    // "" splits to [""], so empty string is in oldSet; line1 and line2 are new
    expect(result.addedLines).toBe(2);
    // The empty string "" is not in newSet, so 1 removed
    expect(result.removedLines).toBe(1);
  });

  it("handles empty new document", () => {
    const result = compareDocumentsLocal("line1\nline2", "");
    // "" splits to [""], so empty string is in newSet
    expect(result.addedLines).toBe(1);
    expect(result.removedLines).toBe(2);
  });

  it("handles real-world Japanese text diff", () => {
    const old = "第1条 介護報酬は月額10万円とする。\n第2条 対象は65歳以上。\n第3条 申請は市区町村に行う。";
    const updated = "第1条 介護報酬は月額12万円とする。\n第2条 対象は65歳以上。\n第3条 申請は市区町村に行う。\n第4条 改定は年1回行う。";
    const result = compareDocumentsLocal(old, updated);
    expect(result.addedLines).toBe(2); // modified line1 + new line4
    expect(result.removedLines).toBe(1); // old line1
    expect(result.unchangedLines).toBe(2); // line2 + line3
  });
});
