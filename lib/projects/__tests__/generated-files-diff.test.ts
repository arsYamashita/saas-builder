import { describe, it, expect } from "vitest";
import { computeGeneratedFilesDiff } from "../generated-files-diff";

describe("computeGeneratedFilesDiff", () => {
  it("returns null when fewer than 2 versions", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1 },
    ]);
    expect(result).toBeNull();
  });

  it("detects added files", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1 },
      { file_path: "a.ts", version: 2 },
      { file_path: "b.ts", version: 2 },
    ]);
    expect(result).not.toBeNull();
    expect(result!.addedFiles).toEqual(["b.ts"]);
    expect(result!.removedFiles).toEqual([]);
  });

  it("detects removed files", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1 },
      { file_path: "b.ts", version: 1 },
      { file_path: "a.ts", version: 2 },
    ]);
    expect(result!.removedFiles).toEqual(["b.ts"]);
  });

  it("detects modified files via content comparison", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1, content_text: "old content" },
      { file_path: "a.ts", version: 2, content_text: "new content" },
    ]);
    expect(result).not.toBeNull();
    expect(result!.modifiedFiles).toEqual(["a.ts"]);
    expect(result!.unchangedFiles).toEqual([]);
    expect(result!.hasAnyChange).toBe(true);
  });

  it("treats identical content as unchanged", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1, content_text: "same" },
      { file_path: "a.ts", version: 2, content_text: "same" },
    ]);
    expect(result!.modifiedFiles).toEqual([]);
    expect(result!.unchangedFiles).toEqual(["a.ts"]);
    expect(result!.hasAnyChange).toBe(false);
  });

  it("generates content diff lines for modified files", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1, content_text: "line1\nline2\nline3" },
      { file_path: "a.ts", version: 2, content_text: "line1\nchanged\nline3" },
    ]);
    const diff = result!.contentDiffs.find((d) => d.file_path === "a.ts");
    expect(diff).toBeDefined();
    expect(diff!.status).toBe("modified");
    expect(diff!.addedLineCount).toBeGreaterThan(0);
    expect(diff!.removedLineCount).toBeGreaterThan(0);
    // "line2" should be removed, "changed" should be added
    const removedTexts = diff!.diffLines.filter((l) => l.type === "removed").map((l) => l.text);
    const addedTexts = diff!.diffLines.filter((l) => l.type === "added").map((l) => l.text);
    expect(removedTexts).toContain("line2");
    expect(addedTexts).toContain("changed");
  });

  it("generates content diff for added files", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1, content_text: "old" },
      { file_path: "a.ts", version: 2, content_text: "old" },
      { file_path: "b.ts", version: 2, content_text: "new file\ncontent" },
    ]);
    const diff = result!.contentDiffs.find((d) => d.file_path === "b.ts");
    expect(diff).toBeDefined();
    expect(diff!.status).toBe("added");
    expect(diff!.addedLineCount).toBe(2);
  });

  it("generates content diff for removed files", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1, content_text: "keep" },
      { file_path: "b.ts", version: 1, content_text: "gone\nfile" },
      { file_path: "a.ts", version: 2, content_text: "keep" },
    ]);
    const diff = result!.contentDiffs.find((d) => d.file_path === "b.ts");
    expect(diff).toBeDefined();
    expect(diff!.status).toBe("removed");
    expect(diff!.removedLineCount).toBe(2);
  });

  it("falls back gracefully when content_text is undefined", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1 },
      { file_path: "a.ts", version: 2 },
    ]);
    // No content → treated as unchanged at path level
    expect(result!.unchangedFiles).toEqual(["a.ts"]);
    expect(result!.modifiedFiles).toEqual([]);
  });

  it("reports correct totals", () => {
    const result = computeGeneratedFilesDiff([
      { file_path: "a.ts", version: 1, content_text: "v1" },
      { file_path: "b.ts", version: 1, content_text: "v1" },
      { file_path: "a.ts", version: 2, content_text: "v2" },
      { file_path: "c.ts", version: 2, content_text: "new" },
    ]);
    expect(result!.totalLatest).toBe(2);
    expect(result!.totalPrevious).toBe(2);
    expect(result!.latestVersion).toBe(2);
    expect(result!.previousVersion).toBe(1);
  });
});
