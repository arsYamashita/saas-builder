import { describe, it, expect } from "vitest";
import { isSafeRelativePath, normalizeExportPath } from "../safe-path";

describe("isSafeRelativePath", () => {
  it("accepts simple relative path", () => {
    expect(isSafeRelativePath("src/app/page.tsx")).toBe(true);
  });

  it("rejects absolute path", () => {
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isSafeRelativePath("../secret")).toBe(false);
    expect(isSafeRelativePath("src/../../etc")).toBe(false);
  });

  it("rejects null bytes", () => {
    expect(isSafeRelativePath("file\0name")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeRelativePath("")).toBe(false);
  });

  it("accepts nested paths", () => {
    expect(isSafeRelativePath("a/b/c/d.ts")).toBe(true);
  });
});

describe("normalizeExportPath", () => {
  it("joins cwd with exports/projects/id/file", () => {
    const result = normalizeExportPath("proj-1", "src/page.tsx");
    expect(result).toContain("exports/projects/proj-1/src/page.tsx");
  });
});
