import { describe, it, expect } from "vitest";
import { extractBlueprintSummary } from "../blueprint-preview";

const makeBp = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  prd_json: { product_summary: { name: "Test", problem: "P", target: "T", category: "C" } },
  entities_json: [{ name: "User", description: "user entity", main_fields: [{ name: "email", type: "text", required: true }] }],
  screens_json: [{ name: "Dashboard", path: "/dash", role_access: ["admin"] }],
  roles_json: [{ name: "admin", description: "admin role" }],
  billing_json: { enabled: true },
  affiliate_json: { enabled: false },
  ...overrides,
});

describe("extractBlueprintSummary", () => {
  it("extracts product summary fields", () => {
    const bp = extractBlueprintSummary(makeBp());
    expect(bp.product.name).toBe("Test");
    expect(bp.product.problem).toBe("P");
    expect(bp.product.target).toBe("T");
    expect(bp.product.category).toBe("C");
  });

  it("extracts version", () => {
    expect(extractBlueprintSummary(makeBp({ version: 3 })).version).toBe(3);
  });

  it("extracts entities with fields", () => {
    const bp = extractBlueprintSummary(makeBp());
    expect(bp.entities).toHaveLength(1);
    expect(bp.entities[0].name).toBe("User");
    expect(bp.entities[0].fields).toHaveLength(1);
    expect(bp.entities[0].fields[0]).toEqual({ name: "email", type: "text", required: true });
  });

  it("extracts roles", () => {
    const bp = extractBlueprintSummary(makeBp());
    expect(bp.roles).toHaveLength(1);
    expect(bp.roles[0].name).toBe("admin");
  });

  it("extracts screens with role_access", () => {
    const bp = extractBlueprintSummary(makeBp());
    expect(bp.screens).toHaveLength(1);
    expect(bp.screens[0].name).toBe("Dashboard");
    expect(bp.screens[0].role_access).toEqual(["admin"]);
  });

  it("extracts billing/affiliate flags", () => {
    const bp = extractBlueprintSummary(makeBp());
    expect(bp.billingEnabled).toBe(true);
    expect(bp.affiliateEnabled).toBe(false);
  });

  it("handles missing prd_json gracefully", () => {
    const bp = extractBlueprintSummary(makeBp({ prd_json: null }));
    expect(bp.product.name).toBe("");
    expect(bp.product.problem).toBe("");
  });

  it("handles empty entities_json", () => {
    const bp = extractBlueprintSummary(makeBp({ entities_json: [] }));
    expect(bp.entities).toEqual([]);
  });

  it("handles malformed entities_json (not array)", () => {
    const bp = extractBlueprintSummary(makeBp({ entities_json: "bad" }));
    expect(bp.entities).toEqual([]);
  });

  it("handles null roles_json", () => {
    const bp = extractBlueprintSummary(makeBp({ roles_json: null }));
    expect(bp.roles).toEqual([]);
  });

  it("uses alternative field names (product_name, entity_name)", () => {
    const bp = extractBlueprintSummary(makeBp({
      prd_json: { product_name: "Alt", problem_to_solve: "AltP", target_users: "AltT", service_category: "AltC" },
    }));
    expect(bp.product.name).toBe("Alt");
    expect(bp.product.problem).toBe("AltP");
    expect(bp.product.target).toBe("AltT");
    expect(bp.product.category).toBe("AltC");
  });

  it("handles billing_json as boolean", () => {
    const bp = extractBlueprintSummary(makeBp({ billing_json: true }));
    expect(bp.billingEnabled).toBe(true);
  });

  it("handles entities with no main_fields", () => {
    const bp = extractBlueprintSummary(makeBp({
      entities_json: [{ name: "Bare", description: "no fields" }],
    }));
    expect(bp.entities[0].fields).toEqual([]);
  });
});
