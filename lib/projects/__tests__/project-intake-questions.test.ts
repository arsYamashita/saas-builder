import { describe, it, expect } from "vitest";
import {
  INTAKE_QUESTIONS,
  DEFAULT_INTAKE_ANSWERS,
  intakeToFormHints,
  type IntakeAnswers,
} from "../project-intake-questions";

describe("INTAKE_QUESTIONS", () => {
  it("has 5 questions", () => {
    expect(INTAKE_QUESTIONS).toHaveLength(5);
  });

  it("each question has required fields", () => {
    for (const q of INTAKE_QUESTIONS) {
      expect(q.id).toBeTruthy();
      expect(q.question).toBeTruthy();
      expect(q.type).toMatch(/^(text|select|boolean)$/);
      expect(q.targetFields.length).toBeGreaterThan(0);
    }
  });

  it("core_domain has select options", () => {
    const q = INTAKE_QUESTIONS.find((q) => q.id === "core_domain");
    expect(q?.type).toBe("select");
    expect(q?.options?.length).toBeGreaterThan(0);
  });
});

describe("DEFAULT_INTAKE_ANSWERS", () => {
  it("has all empty defaults", () => {
    expect(DEFAULT_INTAKE_ANSWERS.business_type).toBe("");
    expect(DEFAULT_INTAKE_ANSWERS.main_users).toBe("");
    expect(DEFAULT_INTAKE_ANSWERS.core_domain).toBe("");
    expect(DEFAULT_INTAKE_ANSWERS.needs_billing).toBe(false);
    expect(DEFAULT_INTAKE_ANSWERS.needs_affiliate).toBe(false);
  });
});

describe("intakeToFormHints", () => {
  const base: IntakeAnswers = { ...DEFAULT_INTAKE_ANSWERS };

  it("sets summary and problemToSolve from business_type", () => {
    const hints = intakeToFormHints({ ...base, business_type: "オンラインサロン" });
    expect(hints.summary).toBe("オンラインサロン");
    expect(hints.problemToSolve).toBe("オンラインサロン");
  });

  it("sets targetUsers from main_users", () => {
    const hints = intakeToFormHints({ ...base, main_users: "美容サロンオーナー" });
    expect(hints.targetUsers).toBe("美容サロンオーナー");
  });

  it("sets members_content domain hints", () => {
    const hints = intakeToFormHints({ ...base, core_domain: "members_content" });
    expect(hints.managedData).toContain("members");
    expect(hints.managedData).toContain("contents");
    expect(hints.requiredFeatures).toContain("member_management");
    expect(hints.requiredFeatures).toContain("affiliate_links");
  });

  it("sets reservations domain hints", () => {
    const hints = intakeToFormHints({ ...base, core_domain: "reservations" });
    expect(hints.managedData).toContain("reservations");
    expect(hints.requiredFeatures).toContain("reservation_management");
  });

  it("sets customers_deals domain hints", () => {
    const hints = intakeToFormHints({ ...base, core_domain: "customers_deals" });
    expect(hints.managedData).toContain("deals");
    expect(hints.requiredFeatures).toContain("deal_management");
  });

  it("sets billingModel to subscription when needs_billing", () => {
    const hints = intakeToFormHints({ ...base, needs_billing: true });
    expect(hints.billingModel).toBe("subscription");
  });

  it("sets billingModel to none when not needs_billing", () => {
    const hints = intakeToFormHints({ ...base, needs_billing: false });
    expect(hints.billingModel).toBe("none");
  });

  it("sets affiliateEnabled flag", () => {
    expect(intakeToFormHints({ ...base, needs_affiliate: true }).affiliateEnabled).toBe(true);
    expect(intakeToFormHints({ ...base, needs_affiliate: false }).affiliateEnabled).toBe(false);
  });

  it("returns no domain hints for unknown domain", () => {
    const hints = intakeToFormHints({ ...base, core_domain: "other" });
    expect(hints.managedData).toBeUndefined();
    expect(hints.requiredFeatures).toBeUndefined();
  });
});
