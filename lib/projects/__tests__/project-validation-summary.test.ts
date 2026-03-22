import { describe, it, expect } from "vitest";
import { buildValidationSummary } from "../project-validation-summary";

describe("buildValidationSummary", () => {
  it("isReady when all required fields present", () => {
    const s = buildValidationSummary({ name: "My App", templateKey: "reservation_saas" });
    expect(s.isReady).toBe(true);
  });

  it("not ready when name is missing", () => {
    const s = buildValidationSummary({ name: "", templateKey: "reservation_saas" });
    expect(s.isReady).toBe(false);
    expect(s.missingItems.find((m) => m.key === "name")).toBeDefined();
  });

  it("not ready when templateKey is missing", () => {
    const s = buildValidationSummary({ name: "App", templateKey: "" });
    expect(s.isReady).toBe(false);
    expect(s.missingItems.find((m) => m.key === "templateKey")).toBeDefined();
  });

  it("includes optional missing items but still isReady", () => {
    const s = buildValidationSummary({ name: "App", templateKey: "x" });
    expect(s.isReady).toBe(true);
    expect(s.missingItems.length).toBeGreaterThan(0);
    expect(s.missingItems.find((m) => m.key === "summary")).toBeDefined();
  });

  it("no missing items when everything is filled", () => {
    const s = buildValidationSummary({
      name: "App",
      templateKey: "x",
      summary: "A summary",
      targetUsers: "Users",
      requiredFeatures: ["auth"],
      managedData: ["users"],
    });
    expect(s.missingItems).toEqual([]);
    expect(s.isReady).toBe(true);
  });

  it("whitespace-only name counts as missing", () => {
    const s = buildValidationSummary({ name: "   ", templateKey: "x" });
    expect(s.isReady).toBe(false);
  });

  it("empty array counts as missing for requiredFeatures", () => {
    const s = buildValidationSummary({ name: "A", templateKey: "x", requiredFeatures: [] });
    expect(s.missingItems.find((m) => m.key === "requiredFeatures")).toBeDefined();
  });
});
