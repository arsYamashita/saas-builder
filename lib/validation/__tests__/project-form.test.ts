import { describe, it, expect } from "vitest";
import { projectFormSchema } from "../project-form";
import { MAX_LLM_BRIEF_FIELD_CHARS } from "../llm-input-limits";

const validInput = {
  name: "My SaaS",
  summary: "A comprehensive SaaS platform for managing memberships",
  targetUsers: "Small businesses",
  problemToSolve: "Membership management",
  brandTone: "modern" as const,
  templateKey: "membership_content_affiliate",
  requiredFeatures: ["auth", "billing"],
  managedData: ["users", "subscriptions"],
  endUserCreatedData: [],
  roles: ["owner", "admin"],
  billingModel: "subscription" as const,
  affiliateEnabled: false,
  visibilityRule: "members_only",
  mvpScope: ["auth", "billing"],
  excludedInitialScope: [],
  stackPreference: "nextjs-supabase",
  priority: "medium" as const,
};

describe("projectFormSchema", () => {
  it("accepts valid full input", () => {
    const result = projectFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("defaults optional fields", () => {
    const result = projectFormSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.referenceServices).toBe("");
      expect(result.data.notes).toBe("");
    }
  });

  it("rejects name shorter than 2 chars", () => {
    const result = projectFormSchema.safeParse({ ...validInput, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects summary shorter than 10 chars", () => {
    const result = projectFormSchema.safeParse({ ...validInput, summary: "Short" });
    expect(result.success).toBe(false);
  });

  it("rejects targetUsers shorter than 5 chars", () => {
    const result = projectFormSchema.safeParse({ ...validInput, targetUsers: "SMB" });
    expect(result.success).toBe(false);
  });

  it("rejects problemToSolve shorter than 5 chars", () => {
    const result = projectFormSchema.safeParse({ ...validInput, problemToSolve: "Bug" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid brandTone", () => {
    const result = projectFormSchema.safeParse({ ...validInput, brandTone: "gothic" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid brandTone values", () => {
    for (const tone of ["modern", "minimal", "luxury", "friendly", "professional", "playful"]) {
      const result = projectFormSchema.safeParse({ ...validInput, brandTone: tone });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid templateKey", () => {
    const result = projectFormSchema.safeParse({ ...validInput, templateKey: "nonexistent" });
    expect(result.success).toBe(false);
  });

  it("accepts registered template keys", () => {
    for (const key of ["membership_content_affiliate", "reservation_saas", "community_membership_saas"]) {
      const result = projectFormSchema.safeParse({ ...validInput, templateKey: key });
      expect(result.success).toBe(true);
    }
  });

  it("accepts custom and online_salon placeholders", () => {
    for (const key of ["custom", "online_salon"]) {
      const result = projectFormSchema.safeParse({ ...validInput, templateKey: key });
      expect(result.success).toBe(true);
    }
  });

  it("rejects empty requiredFeatures", () => {
    const result = projectFormSchema.safeParse({ ...validInput, requiredFeatures: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty managedData", () => {
    const result = projectFormSchema.safeParse({ ...validInput, managedData: [] });
    expect(result.success).toBe(false);
  });

  it("rejects empty roles", () => {
    const result = projectFormSchema.safeParse({ ...validInput, roles: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = projectFormSchema.safeParse({ ...validInput, roles: ["superadmin"] });
    expect(result.success).toBe(false);
  });

  it("accepts all valid roles", () => {
    for (const role of ["owner", "admin", "editor", "staff", "member", "affiliate_manager", "sales", "operator"]) {
      const result = projectFormSchema.safeParse({ ...validInput, roles: [role] });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid billingModel", () => {
    const result = projectFormSchema.safeParse({ ...validInput, billingModel: "freemium" });
    expect(result.success).toBe(false);
  });

  it("rejects empty mvpScope", () => {
    const result = projectFormSchema.safeParse({ ...validInput, mvpScope: [] });
    expect(result.success).toBe(false);
  });

  it("rejects invalid priority", () => {
    const result = projectFormSchema.safeParse({ ...validInput, priority: "urgent" });
    expect(result.success).toBe(false);
  });

  it("rejects empty visibilityRule", () => {
    const result = projectFormSchema.safeParse({ ...validInput, visibilityRule: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty stackPreference", () => {
    const result = projectFormSchema.safeParse({ ...validInput, stackPreference: "" });
    expect(result.success).toBe(false);
  });

  // Wiring test for llm_api_unbounded_text_input: these free-text fields are
  // embedded verbatim into the generate-blueprint LLM prompt via
  // buildUserInputFromProject(); an oversized submission must be rejected
  // at the form-validation layer before it ever reaches that prompt.
  it("rejects summary one char over the max length (does not reach LLM prompt)", () => {
    const result = projectFormSchema.safeParse({
      ...validInput,
      summary: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes one char over the max length (does not reach LLM prompt)", () => {
    const result = projectFormSchema.safeParse({
      ...validInput,
      notes: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts summary exactly at the max length", () => {
    const result = projectFormSchema.safeParse({
      ...validInput,
      summary: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS),
    });
    expect(result.success).toBe(true);
  });
});
