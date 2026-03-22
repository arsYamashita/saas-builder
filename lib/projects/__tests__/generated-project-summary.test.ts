import { describe, it, expect } from "vitest";
import { buildGeneratedProjectSummary } from "../generated-project-summary";

const makeData = (overrides: Record<string, unknown> = {}) => ({
  generationRuns: [{ status: "completed", finished_at: "2026-03-22" }],
  qualityRuns: [{ status: "passed" }],
  blueprints: [{}],
  implementationRuns: [{}, {}],
  generatedFiles: [],
  ...overrides,
});

describe("buildGeneratedProjectSummary", () => {
  it("returns generation and quality status", () => {
    const s = buildGeneratedProjectSummary(makeData());
    expect(s.generationStatus).toBe("completed");
    expect(s.qualityStatus).toBe("passed");
    expect(s.generationFinishedAt).toBe("2026-03-22");
  });

  it("counts blueprints and implementation runs", () => {
    const s = buildGeneratedProjectSummary(makeData());
    expect(s.blueprintCount).toBe(1);
    expect(s.implementationRunCount).toBe(2);
  });

  it("counts generated files", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "page", file_path: "src/app/home/page.tsx" },
        { file_category: "component", file_path: "src/components/Button.tsx" },
      ],
    }));
    expect(s.generatedFileCount).toBe(2);
  });

  it("builds category breakdown sorted by count", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "page", file_path: "a" },
        { file_category: "page", file_path: "b" },
        { file_category: "component", file_path: "c" },
      ],
    }));
    expect(s.categoryBreakdown[0]).toEqual({ category: "page", count: 2 });
    expect(s.categoryBreakdown[1]).toEqual({ category: "component", count: 1 });
  });

  it("classifies pages by path pattern", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "page", file_path: "src/app/dashboard/page.tsx" },
      ],
    }));
    expect(s.pageCount).toBe(1);
  });

  it("classifies API routes", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "route", file_path: "src/api/users/route.ts" },
      ],
    }));
    expect(s.apiRouteCount).toBe(1);
  });

  it("classifies components", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "component", file_path: "src/components/Card.tsx" },
      ],
    }));
    expect(s.componentCount).toBe(1);
  });

  it("classifies tests", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "test", file_path: "tests/e2e/login.spec.ts" },
        { file_category: "test", file_path: "src/lib/__tests__/auth.test.ts" },
      ],
    }));
    expect(s.testCount).toBe(2);
  });

  it("classifies lib/utils", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "lib", file_path: "src/lib/helpers.ts" },
      ],
    }));
    expect(s.libCount).toBe(1);
  });

  it("counts other files", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [
        { file_category: "config", file_path: "next.config.js" },
      ],
    }));
    expect(s.otherCount).toBe(1);
  });

  it("hasResults is true when files exist", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generatedFiles: [{ file_category: "x", file_path: "x" }],
    }));
    expect(s.hasResults).toBe(true);
  });

  it("hasResults is true when blueprints exist (even without files)", () => {
    const s = buildGeneratedProjectSummary(makeData({ generatedFiles: [] }));
    expect(s.hasResults).toBe(true);
  });

  it("hasResults is false when nothing exists", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generationRuns: [],
      qualityRuns: [],
      blueprints: [],
      implementationRuns: [],
      generatedFiles: [],
    }));
    expect(s.hasResults).toBe(false);
  });

  it("handles null generation/quality status", () => {
    const s = buildGeneratedProjectSummary(makeData({
      generationRuns: [],
      qualityRuns: [],
    }));
    expect(s.generationStatus).toBeNull();
    expect(s.qualityStatus).toBeNull();
  });
});
