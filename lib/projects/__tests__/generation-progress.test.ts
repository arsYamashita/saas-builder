import { describe, it, expect } from "vitest";
import { toGenerationProgress } from "../generation-progress";

const makeRun = (overrides: Record<string, unknown> = {}) => ({
  id: "run-1",
  status: "running",
  current_step: "schema",
  steps_json: [
    { key: "blueprint", label: "Blueprint", status: "completed" },
    { key: "implementation", label: "Implementation", status: "completed" },
    { key: "schema", label: "Schema", status: "running" },
    { key: "api_design", label: "API Design", status: "pending" },
  ],
  error_message: null,
  ...overrides,
});

describe("toGenerationProgress", () => {
  it("returns correct runId", () => {
    expect(toGenerationProgress(makeRun()).runId).toBe("run-1");
  });

  it("counts completed steps", () => {
    const p = toGenerationProgress(makeRun());
    expect(p.completedCount).toBe(2);
    expect(p.totalCount).toBe(4);
  });

  it("detects active run", () => {
    expect(toGenerationProgress(makeRun({ status: "running" })).isActive).toBe(true);
    expect(toGenerationProgress(makeRun({ status: "pending" })).isActive).toBe(true);
    expect(toGenerationProgress(makeRun({ status: "completed" })).isActive).toBe(false);
    expect(toGenerationProgress(makeRun({ status: "failed" })).isActive).toBe(false);
  });

  it("normalizes step statuses", () => {
    const p = toGenerationProgress(makeRun());
    expect(p.steps[0].status).toBe("completed");
    expect(p.steps[2].status).toBe("running");
    expect(p.steps[3].status).toBe("pending");
  });

  it("maps step labels from STEP_LABELS", () => {
    const p = toGenerationProgress(makeRun({
      steps_json: [{ key: "split_files", label: "", status: "pending" }],
    }));
    expect(p.steps[0].label).toBe("File Split");
  });

  it("falls back to key when label is nullish", () => {
    const p = toGenerationProgress(makeRun({
      steps_json: [{ key: "custom_step", status: "pending" }],
    }));
    expect(p.steps[0].label).toBe("custom_step");
  });

  it("keeps empty string label as-is (nullish coalescing)", () => {
    const p = toGenerationProgress(makeRun({
      steps_json: [{ key: "custom_step", label: "", status: "pending" }],
    }));
    expect(p.steps[0].label).toBe("");
  });

  it("handles unknown status as pending", () => {
    const p = toGenerationProgress(makeRun({
      steps_json: [{ key: "x", label: "X", status: "unknown_status" }],
    }));
    expect(p.steps[0].status).toBe("pending");
  });

  it("includes error message", () => {
    const p = toGenerationProgress(makeRun({ error_message: "boom" }));
    expect(p.errorMessage).toBe("boom");
  });

  it("handles null error_message", () => {
    expect(toGenerationProgress(makeRun()).errorMessage).toBeNull();
  });

  it("handles empty steps_json", () => {
    const p = toGenerationProgress(makeRun({ steps_json: [] }));
    expect(p.steps).toEqual([]);
    expect(p.completedCount).toBe(0);
    expect(p.totalCount).toBe(0);
  });
});
