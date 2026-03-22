import { describe, it, expect } from "vitest";
import {
  blueprintFieldSchema,
  blueprintEntitySchema,
  blueprintScreenSchema,
  blueprintRoleSchema,
  blueprintPermissionSchema,
  blueprintBillingSchema,
  blueprintAffiliateSchema,
  blueprintSchema,
} from "../blueprint";

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

describe("blueprintFieldSchema", () => {
  it("accepts valid field", () => {
    const result = blueprintFieldSchema.safeParse({
      name: "email",
      type: "string",
      required: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional description", () => {
    const result = blueprintFieldSchema.safeParse({
      name: "email",
      type: "string",
      required: false,
      description: "User email",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = blueprintFieldSchema.safeParse({
      name: "",
      type: "string",
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required", () => {
    const result = blueprintFieldSchema.safeParse({
      name: "id",
      type: "uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("blueprintEntitySchema", () => {
  const validField = { name: "id", type: "uuid", required: true };

  it("accepts entity with one field", () => {
    const result = blueprintEntitySchema.safeParse({
      name: "users",
      description: "User table",
      main_fields: [validField],
    });
    expect(result.success).toBe(true);
  });

  it("rejects entity with no fields", () => {
    const result = blueprintEntitySchema.safeParse({
      name: "users",
      description: "User table",
      main_fields: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const result = blueprintEntitySchema.safeParse({
      name: "users",
      main_fields: [validField],
    });
    expect(result.success).toBe(false);
  });
});

describe("blueprintScreenSchema", () => {
  it("accepts valid screen", () => {
    const result = blueprintScreenSchema.safeParse({
      name: "Dashboard",
      purpose: "Overview",
      role_access: ["admin"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty role_access", () => {
    const result = blueprintScreenSchema.safeParse({
      name: "Dashboard",
      purpose: "Overview",
      role_access: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("blueprintRoleSchema", () => {
  it("accepts role with name only", () => {
    const result = blueprintRoleSchema.safeParse({ name: "admin" });
    expect(result.success).toBe(true);
  });

  it("accepts role with description", () => {
    const result = blueprintRoleSchema.safeParse({
      name: "admin",
      description: "Full access",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = blueprintRoleSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("blueprintPermissionSchema", () => {
  it("accepts valid permission", () => {
    const result = blueprintPermissionSchema.safeParse({
      role: "admin",
      allowed_actions: ["read", "write"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty allowed_actions", () => {
    const result = blueprintPermissionSchema.safeParse({
      role: "admin",
      allowed_actions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("blueprintBillingSchema", () => {
  it("accepts subscription model", () => {
    const result = blueprintBillingSchema.safeParse({
      enabled: true,
      model: "subscription",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid model", () => {
    const result = blueprintBillingSchema.safeParse({
      enabled: true,
      model: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid models", () => {
    for (const model of ["subscription", "one_time", "hybrid", "none"]) {
      const result = blueprintBillingSchema.safeParse({ enabled: false, model });
      expect(result.success).toBe(true);
    }
  });
});

describe("blueprintAffiliateSchema", () => {
  it("accepts disabled affiliate", () => {
    const result = blueprintAffiliateSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it("accepts full affiliate config", () => {
    const result = blueprintAffiliateSchema.safeParse({
      enabled: true,
      commission_type: "percentage",
      commission_value: 10,
      notes: "Standard commission",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid commission_type", () => {
    const result = blueprintAffiliateSchema.safeParse({
      enabled: true,
      commission_type: "invalid",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Full blueprint schema
// ---------------------------------------------------------------------------

describe("blueprintSchema", () => {
  const minimalBlueprint = {
    product_summary: {},
    entities: [
      {
        name: "users",
        description: "Users",
        main_fields: [{ name: "id", type: "uuid", required: true }],
      },
    ],
    screens: [
      { name: "Dashboard", purpose: "Overview", role_access: ["admin"] },
    ],
    roles: [{ name: "admin" }],
    permissions: [{ role: "admin", allowed_actions: ["*"] }],
    billing: { enabled: false, model: "none" },
    affiliate: { enabled: false },
    events: [],
    kpis: [],
    assumptions: [],
    mvp_scope: ["auth"],
    future_scope: [],
  };

  it("accepts minimal valid blueprint", () => {
    const result = blueprintSchema.safeParse(minimalBlueprint);
    expect(result.success).toBe(true);
  });

  it("rejects empty entities", () => {
    const result = blueprintSchema.safeParse({
      ...minimalBlueprint,
      entities: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty screens", () => {
    const result = blueprintSchema.safeParse({
      ...minimalBlueprint,
      screens: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty roles", () => {
    const result = blueprintSchema.safeParse({
      ...minimalBlueprint,
      roles: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty mvp_scope", () => {
    const result = blueprintSchema.safeParse({
      ...minimalBlueprint,
      mvp_scope: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional product_summary fields", () => {
    const result = blueprintSchema.safeParse({
      ...minimalBlueprint,
      product_summary: {
        name: "My SaaS",
        problem: "Problem X",
        target: "SMBs",
        category: "CRM",
      },
    });
    expect(result.success).toBe(true);
  });
});
