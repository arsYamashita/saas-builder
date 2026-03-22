import { describe, it, expect } from "vitest";
import { toQualityProgress } from "../quality-progress";

const makeQr = (overrides: Record<string, unknown> = {}) => ({
  id: "qr-1",
  status: "running",
  checks_json: [
    { key: "lint", label: "ESLint", status: "passed", exitCode: 0, durationMs: 1200 },
    { key: "typecheck", label: "TypeScript", status: "running" },
    { key: "e2e", label: "Playwright", status: "pending" },
  ],
  summary: null,
  ...overrides,
});

describe("toQualityProgress", () => {
  it("returns correct runId", () => {
    expect(toQualityProgress(makeQr()).runId).toBe("qr-1");
  });

  it("counts passed checks", () => {
    const p = toQualityProgress(makeQr());
    expect(p.passedCount).toBe(1);
    expect(p.totalCount).toBe(3);
  });

  it("detects active run", () => {
    expect(toQualityProgress(makeQr({ status: "running" })).isActive).toBe(true);
    expect(toQualityProgress(makeQr({ status: "pending" })).isActive).toBe(true);
    expect(toQualityProgress(makeQr({ status: "passed" })).isActive).toBe(false);
    expect(toQualityProgress(makeQr({ status: "failed" })).isActive).toBe(false);
  });

  it("normalizes check statuses", () => {
    const p = toQualityProgress(makeQr());
    expect(p.checks[0].status).toBe("passed");
    expect(p.checks[1].status).toBe("running");
    expect(p.checks[2].status).toBe("pending");
  });

  it("normalizes error status", () => {
    const p = toQualityProgress(makeQr({
      checks_json: [{ key: "x", label: "X", status: "error" }],
    }));
    expect(p.checks[0].status).toBe("error");
  });

  it("normalizes unknown status to pending", () => {
    const p = toQualityProgress(makeQr({
      checks_json: [{ key: "x", label: "X", status: "weird" }],
    }));
    expect(p.checks[0].status).toBe("pending");
  });

  it("includes exitCode and durationMs", () => {
    const p = toQualityProgress(makeQr());
    expect(p.checks[0].exitCode).toBe(0);
    expect(p.checks[0].durationMs).toBe(1200);
    expect(p.checks[1].exitCode).toBeNull();
    expect(p.checks[1].durationMs).toBeNull();
  });

  it("detects hasOutput from stdout/stderr", () => {
    const p = toQualityProgress(makeQr({
      checks_json: [
        { key: "a", label: "A", status: "passed", stdout: "ok" },
        { key: "b", label: "B", status: "passed" },
      ],
    }));
    expect(p.checks[0].hasOutput).toBe(true);
    expect(p.checks[1].hasOutput).toBe(false);
  });

  it("truncates errorPreview to 500 chars", () => {
    const longErr = "x".repeat(1000);
    const p = toQualityProgress(makeQr({
      checks_json: [{ key: "a", label: "A", status: "failed", stderr: longErr }],
    }));
    expect(p.checks[0].errorPreview).toHaveLength(500);
  });

  it("does not show errorPreview for passed checks", () => {
    const p = toQualityProgress(makeQr({
      checks_json: [{ key: "a", label: "A", status: "passed", stderr: "some output" }],
    }));
    expect(p.checks[0].errorPreview).toBeNull();
  });

  it("includes summary", () => {
    const p = toQualityProgress(makeQr({ summary: "All good" }));
    expect(p.summary).toBe("All good");
  });

  it("handles empty checks_json", () => {
    const p = toQualityProgress(makeQr({ checks_json: [] }));
    expect(p.checks).toEqual([]);
    expect(p.passedCount).toBe(0);
  });
});
