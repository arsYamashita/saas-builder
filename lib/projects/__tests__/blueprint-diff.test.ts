import { describe, it, expect } from "vitest";
import { computeBlueprintDiff } from "../blueprint-diff";

const makeBp = (version: number, overrides: Record<string, unknown> = {}) => ({
  version,
  prd_json: { product_summary: { name: "Test", problem: "P", target: "T", category: "C" } },
  entities_json: [{ name: "User", description: "d", main_fields: [] }],
  screens_json: [{ name: "Dashboard", path: "/", role_access: ["admin"] }],
  roles_json: [{ name: "admin", description: "admin" }],
  billing_json: { enabled: true },
  affiliate_json: { enabled: false },
  ...overrides,
});

describe("computeBlueprintDiff", () => {
  it("returns null for single blueprint", () => {
    expect(computeBlueprintDiff([makeBp(1)])).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(computeBlueprintDiff([])).toBeNull();
  });

  it("returns no changes when blueprints are identical", () => {
    const diff = computeBlueprintDiff([makeBp(1), makeBp(2)]);
    expect(diff).not.toBeNull();
    expect(diff!.hasAnyChange).toBe(false);
    expect(diff!.latestVersion).toBe(2);
    expect(diff!.previousVersion).toBe(1);
  });

  it("detects product field changes", () => {
    const diff = computeBlueprintDiff([
      makeBp(1),
      makeBp(2, { prd_json: { product_summary: { name: "New", problem: "P", target: "T", category: "C" } } }),
    ]);
    expect(diff!.changedFields).toEqual([{ field: "name", from: "Test", to: "New" }]);
    expect(diff!.hasAnyChange).toBe(true);
  });

  it("detects added entities", () => {
    const diff = computeBlueprintDiff([
      makeBp(1),
      makeBp(2, { entities_json: [{ name: "User", description: "d", main_fields: [] }, { name: "Post", description: "d", main_fields: [] }] }),
    ]);
    expect(diff!.addedEntities).toEqual(["Post"]);
    expect(diff!.removedEntities).toEqual([]);
  });

  it("detects removed entities", () => {
    const diff = computeBlueprintDiff([
      makeBp(1, { entities_json: [{ name: "User" }, { name: "Post" }] }),
      makeBp(2, { entities_json: [{ name: "User" }] }),
    ]);
    expect(diff!.removedEntities).toEqual(["Post"]);
  });

  it("detects added/removed roles", () => {
    const diff = computeBlueprintDiff([
      makeBp(1, { roles_json: [{ name: "admin" }] }),
      makeBp(2, { roles_json: [{ name: "admin" }, { name: "staff" }] }),
    ]);
    expect(diff!.addedRoles).toEqual(["staff"]);
    expect(diff!.removedRoles).toEqual([]);
  });

  it("detects added/removed screens", () => {
    const diff = computeBlueprintDiff([
      makeBp(1, { screens_json: [{ name: "Home", path: "/" }] }),
      makeBp(2, { screens_json: [{ name: "Settings", path: "/s" }] }),
    ]);
    expect(diff!.addedScreens).toEqual(["Settings"]);
    expect(diff!.removedScreens).toEqual(["Home"]);
  });

  it("detects billing change", () => {
    const diff = computeBlueprintDiff([
      makeBp(1, { billing_json: { enabled: true } }),
      makeBp(2, { billing_json: { enabled: false } }),
    ]);
    expect(diff!.billingChanged).toBe(true);
  });

  it("detects affiliate change", () => {
    const diff = computeBlueprintDiff([
      makeBp(1, { affiliate_json: { enabled: false } }),
      makeBp(2, { affiliate_json: { enabled: true } }),
    ]);
    expect(diff!.affiliateChanged).toBe(true);
  });

  it("sorts by version descending (latest first)", () => {
    const diff = computeBlueprintDiff([makeBp(3), makeBp(1), makeBp(2)]);
    expect(diff!.latestVersion).toBe(3);
    expect(diff!.previousVersion).toBe(2);
  });

  it("hasDiffSource is always true when diff exists", () => {
    const diff = computeBlueprintDiff([makeBp(1), makeBp(2)]);
    expect(diff!.hasDiffSource).toBe(true);
  });
});
