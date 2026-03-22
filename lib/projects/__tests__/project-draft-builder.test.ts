import { describe, it, expect } from "vitest";
import { buildProjectDraft, previewDraft, type DraftPatch } from "../project-draft-builder";
import type { IntakeAnswers } from "../project-intake-questions";
import { DEFAULT_INTAKE_ANSWERS } from "../project-intake-questions";

const baseIntake: IntakeAnswers = {
  ...DEFAULT_INTAKE_ANSWERS,
  business_type: "オンラインサロン",
  main_users: "美容サロンオーナー",
  core_domain: "members_content",
  needs_billing: true,
  needs_affiliate: true,
};

const emptyForm: Record<string, unknown> = {
  name: "",
  templateKey: "",
  summary: "",
  problemToSolve: "",
  targetUsers: "",
  managedData: [],
  requiredFeatures: [],
  billingModel: "",
  affiliateEnabled: false,
};

describe("buildProjectDraft", () => {
  it("fills empty fields from intake hints", () => {
    const draft = buildProjectDraft(baseIntake, emptyForm, []);
    expect(draft.values.summary).toBe("オンラインサロン");
    expect(draft.values.targetUsers).toBe("美容サロンオーナー");
    expect(draft.filledFields).toContain("summary");
    expect(draft.filledFields).toContain("targetUsers");
  });

  it("does not overwrite user-entered values", () => {
    const form = { ...emptyForm, summary: "既に入力済み" };
    const draft = buildProjectDraft(baseIntake, form, []);
    expect(draft.values.summary).toBeUndefined();
    expect(draft.filledFields).not.toContain("summary");
  });

  it("sets suggestedTemplate from first recommendation", () => {
    const recs = [{ templateKey: "reservation_saas", score: 5, reasons: ["r"] }];
    const draft = buildProjectDraft(baseIntake, emptyForm, recs);
    expect(draft.suggestedTemplate).toBe("reservation_saas");
  });

  it("suggestedTemplate is null when no recommendations", () => {
    const draft = buildProjectDraft(baseIntake, emptyForm, []);
    expect(draft.suggestedTemplate).toBeNull();
  });

  it("applies templateKey when form has default", () => {
    const form = { ...emptyForm, templateKey: "membership_content_affiliate" };
    const recs = [{ templateKey: "reservation_saas", score: 5, reasons: ["r"] }];
    const draft = buildProjectDraft(baseIntake, form, recs);
    expect(draft.values.templateKey).toBe("reservation_saas");
    expect(draft.filledFields).toContain("templateKey");
  });

  it("does not apply templateKey when user already chose a non-default", () => {
    const form = { ...emptyForm, templateKey: "simple_crm_saas" };
    const recs = [{ templateKey: "reservation_saas", score: 5, reasons: ["r"] }];
    const draft = buildProjectDraft(baseIntake, form, recs);
    expect(draft.values.templateKey).toBeUndefined();
  });

  it("sets billingModel and affiliateEnabled from intake", () => {
    const draft = buildProjectDraft(baseIntake, emptyForm, []);
    expect(draft.values.billingModel).toBe("subscription");
    expect(draft.values.affiliateEnabled).toBe(true);
  });

  it("fills managedData and requiredFeatures for members_content domain", () => {
    const draft = buildProjectDraft(baseIntake, emptyForm, []);
    expect(draft.values.managedData).toContain("members");
    expect(draft.values.requiredFeatures).toContain("member_management");
  });
});

describe("previewDraft", () => {
  it("shows filled field labels", () => {
    const patch: DraftPatch = {
      values: { summary: "test" },
      filledFields: ["summary", "targetUsers"],
      suggestedTemplate: null,
    };
    const preview = previewDraft(patch);
    expect(preview.fields).toHaveLength(2);
    expect(preview.fields[0].label).toBe("サービス概要");
    expect(preview.hasChanges).toBe(true);
  });

  it("hasChanges is false when no fields filled", () => {
    const patch: DraftPatch = { values: {}, filledFields: [], suggestedTemplate: null };
    const preview = previewDraft(patch);
    expect(preview.hasChanges).toBe(false);
  });

  it("uses getTemplateLabel when provided", () => {
    const patch: DraftPatch = {
      values: {},
      filledFields: [],
      suggestedTemplate: "reservation_saas",
    };
    const preview = previewDraft(patch, (k) => k === "reservation_saas" ? "予約SaaS" : undefined);
    expect(preview.suggestedTemplateLabel).toBe("予約SaaS");
  });

  it("falls back to templateKey when label not found", () => {
    const patch: DraftPatch = {
      values: {},
      filledFields: [],
      suggestedTemplate: "unknown_key",
    };
    const preview = previewDraft(patch, () => undefined);
    expect(preview.suggestedTemplateLabel).toBe("unknown_key");
  });
});
