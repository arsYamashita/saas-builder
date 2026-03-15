import { describe, it, expect } from "vitest";
import {
  cmsGenerationInputsSchema,
  iaoGenerationInputsSchema,
  crmGenerationInputsSchema,
  rsvGenerationInputsSchema,
  validateGenerationInputs,
  getGenerationInputsJsonSchema,
} from "../generation-inputs";

describe("cmsGenerationInputsSchema", () => {
  const validInput = {
    tenantName: "Test Community",
    tenantSlug: "test-community",
    ownerEmail: "owner@example.com",
    defaultCurrency: "jpy",
  };

  it("accepts valid required-only input", () => {
    const result = cmsGenerationInputsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = cmsGenerationInputsSchema.parse(validInput);
    expect(result.brandTone).toBe("modern");
    expect(result.initialPlans).toEqual([]);
    expect(result.initialTags).toEqual([]);
  });

  it("accepts full input with optional fields", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      brandTone: "minimal",
      initialPlans: [
        { name: "Free", priceAmount: 0, currency: "jpy" },
        { name: "Pro", priceAmount: 980, currency: "jpy", features: ["all content"] },
      ],
      initialTags: [
        { name: "VIP", slug: "vip", color: "#EAB308" },
      ],
      stripeAccountId: "acct_xxx",
      customDomain: "community.example.com",
    });
    expect(result.success).toBe(true);
  });

  // Validation failures
  it("rejects empty tenantName", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      tenantName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug (uppercase)", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      tenantSlug: "Test-Community",
    });
    expect(result.success).toBe(false);
  });

  it("rejects slug starting with hyphen", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      tenantSlug: "-test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      ownerEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid currency format", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      defaultCurrency: "JPY", // uppercase
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tag color", () => {
    const result = cmsGenerationInputsSchema.safeParse({
      ...validInput,
      initialTags: [{ name: "Bad", slug: "bad", color: "red" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("iaoGenerationInputsSchema", () => {
  const validInput = {
    tenantName: "サンプル株式会社",
    tenantSlug: "sample-corp",
    ownerEmail: "admin@example.com",
  };

  it("accepts valid required-only input", () => {
    const result = iaoGenerationInputsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = iaoGenerationInputsSchema.parse(validInput);
    expect(result.brandTone).toBe("professional");
    expect(result.initialCategories).toEqual([]);
    expect(result.requireApproval).toBe(true);
  });

  it("accepts full input with optional fields", () => {
    const result = iaoGenerationInputsSchema.safeParse({
      ...validInput,
      brandTone: "modern",
      initialCategories: [
        { name: "総務", slug: "general-affairs" },
        { name: "経理", slug: "accounting", color: "#3B82F6" },
      ],
      requireApproval: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tenantName", () => {
    const result = iaoGenerationInputsSchema.safeParse({ ...validInput, tenantName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug", () => {
    const result = iaoGenerationInputsSchema.safeParse({ ...validInput, tenantSlug: "Bad-Slug" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = iaoGenerationInputsSchema.safeParse({ ...validInput, ownerEmail: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid category color", () => {
    const result = iaoGenerationInputsSchema.safeParse({
      ...validInput,
      initialCategories: [{ name: "Bad", slug: "bad", color: "blue" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("validateGenerationInputs", () => {
  it("validates known template", () => {
    const result = validateGenerationInputs("community_membership_saas", {
      tenantName: "Test",
      tenantSlug: "test",
      ownerEmail: "a@b.com",
      defaultCurrency: "jpy",
    });
    expect(result.success).toBe(true);
  });

  it("returns errors for invalid input", () => {
    const result = validateGenerationInputs("community_membership_saas", {
      tenantName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("validates IAO template", () => {
    const result = validateGenerationInputs("internal_admin_ops_saas", {
      tenantName: "Test Corp",
      tenantSlug: "test-corp",
      ownerEmail: "a@b.com",
    });
    expect(result.success).toBe(true);
  });

  it("returns errors for invalid IAO input", () => {
    const result = validateGenerationInputs("internal_admin_ops_saas", {
      tenantName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("validates CRM template", () => {
    const result = validateGenerationInputs("simple_crm_saas", {
      tenantName: "Sales Corp",
      tenantSlug: "sales-corp",
      ownerEmail: "a@b.com",
    });
    expect(result.success).toBe(true);
  });

  it("returns errors for invalid CRM input", () => {
    const result = validateGenerationInputs("simple_crm_saas", {
      tenantName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("validates RSV template", () => {
    const result = validateGenerationInputs("reservation_saas", {
      tenantName: "Salon ABC",
      tenantSlug: "salon-abc",
      ownerEmail: "a@b.com",
    });
    expect(result.success).toBe(true);
  });

  it("returns errors for invalid RSV input", () => {
    const result = validateGenerationInputs("reservation_saas", {
      tenantName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("passes through unknown templates", () => {
    const result = validateGenerationInputs("unknown_template", { anything: true });
    expect(result.success).toBe(true);
  });
});

describe("crmGenerationInputsSchema", () => {
  const validInput = {
    tenantName: "Sales Corp",
    tenantSlug: "sales-corp",
    ownerEmail: "admin@example.com",
  };

  it("accepts valid required-only input", () => {
    const result = crmGenerationInputsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = crmGenerationInputsSchema.parse(validInput);
    expect(result.brandTone).toBe("professional");
    expect(result.initialDealStages).toEqual([]);
    expect(result.initialContactStatuses).toEqual(["lead", "prospect", "active", "inactive"]);
  });

  it("accepts full input with optional fields", () => {
    const result = crmGenerationInputsSchema.safeParse({
      ...validInput,
      brandTone: "modern",
      initialDealStages: [
        { name: "リード", slug: "lead", sortOrder: 0 },
        { name: "商談中", slug: "negotiation", color: "#3B82F6", sortOrder: 1 },
      ],
      initialCustomerStatuses: ["lead", "active", "churned"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tenantName", () => {
    const result = crmGenerationInputsSchema.safeParse({ ...validInput, tenantName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug", () => {
    const result = crmGenerationInputsSchema.safeParse({ ...validInput, tenantSlug: "Bad-Slug" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = crmGenerationInputsSchema.safeParse({ ...validInput, ownerEmail: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid deal stage color", () => {
    const result = crmGenerationInputsSchema.safeParse({
      ...validInput,
      initialDealStages: [{ name: "Bad", slug: "bad", color: "blue" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("rsvGenerationInputsSchema", () => {
  const validInput = {
    tenantName: "Beauty Salon ABC",
    tenantSlug: "salon-abc",
    ownerEmail: "owner@example.com",
  };

  it("accepts valid required-only input", () => {
    const result = rsvGenerationInputsSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("applies defaults for optional fields", () => {
    const result = rsvGenerationInputsSchema.parse(validInput);
    expect(result.brandTone).toBe("professional");
    expect(result.initialServiceCategories).toEqual([]);
    expect(result.defaultSlotDurationMinutes).toBe(60);
  });

  it("accepts full input with optional fields", () => {
    const result = rsvGenerationInputsSchema.safeParse({
      ...validInput,
      brandTone: "luxury",
      initialServiceCategories: [
        { name: "カット", slug: "cut" },
        { name: "カラー", slug: "color", color: "#EAB308" },
      ],
      defaultSlotDurationMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty tenantName", () => {
    const result = rsvGenerationInputsSchema.safeParse({ ...validInput, tenantName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug", () => {
    const result = rsvGenerationInputsSchema.safeParse({ ...validInput, tenantSlug: "Bad-Slug" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = rsvGenerationInputsSchema.safeParse({ ...validInput, ownerEmail: "bad" });
    expect(result.success).toBe(false);
  });

  it("rejects slot duration below minimum", () => {
    const result = rsvGenerationInputsSchema.safeParse({ ...validInput, defaultSlotDurationMinutes: 2 });
    expect(result.success).toBe(false);
  });

  it("rejects slot duration above maximum", () => {
    const result = rsvGenerationInputsSchema.safeParse({ ...validInput, defaultSlotDurationMinutes: 500 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid service category color", () => {
    const result = rsvGenerationInputsSchema.safeParse({
      ...validInput,
      initialServiceCategories: [{ name: "Bad", slug: "bad", color: "red" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("getGenerationInputsJsonSchema", () => {
  it("returns field descriptors for CMS", () => {
    const schema = getGenerationInputsJsonSchema("community_membership_saas");
    expect(schema).not.toBeNull();
    expect(schema!.templateKey).toBe("community_membership_saas");
    expect(Array.isArray(schema!.fields)).toBe(true);
    const fields = schema!.fields as Array<{ key: string; required: boolean }>;
    expect(fields.length).toBe(9);
    const required = fields.filter((f) => f.required);
    expect(required.length).toBe(4);
  });

  it("returns field descriptors for IAO", () => {
    const schema = getGenerationInputsJsonSchema("internal_admin_ops_saas");
    expect(schema).not.toBeNull();
    expect(schema!.templateKey).toBe("internal_admin_ops_saas");
    const fields = schema!.fields as Array<{ key: string; required: boolean }>;
    expect(fields.length).toBe(6);
    const required = fields.filter((f) => f.required);
    expect(required.length).toBe(3);
  });

  it("returns field descriptors for CRM", () => {
    const schema = getGenerationInputsJsonSchema("simple_crm_saas");
    expect(schema).not.toBeNull();
    expect(schema!.templateKey).toBe("simple_crm_saas");
    const fields = schema!.fields as Array<{ key: string; required: boolean }>;
    expect(fields.length).toBe(6);
    const required = fields.filter((f) => f.required);
    expect(required.length).toBe(3);
  });

  it("returns field descriptors for RSV", () => {
    const schema = getGenerationInputsJsonSchema("reservation_saas");
    expect(schema).not.toBeNull();
    expect(schema!.templateKey).toBe("reservation_saas");
    const fields = schema!.fields as Array<{ key: string; required: boolean }>;
    expect(fields.length).toBe(6);
    const required = fields.filter((f) => f.required);
    expect(required.length).toBe(3);
  });

  it("returns null for unknown template", () => {
    expect(getGenerationInputsJsonSchema("unknown")).toBeNull();
  });
});
