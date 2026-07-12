import { describe, it, expect } from "vitest";
import { projectBasicInfoSchema } from "../page";

/**
 * Regression coverage for two bugs caught across two rounds of codex review
 * (gpt-5.6-terra) during the RHF+Zod migration:
 *
 * 1. `projectBasicInfoSchema` originally picked `targetUsers` verbatim from
 *    `projectFormSchema`, pulling in its `min(5)` rule. That rule is meant
 *    for the *post-fallback* value `buildPayload` computes (template
 *    default / "一般ユーザー"), not the raw, optional
 *    "ターゲットユーザー（任意）" field on step 2 — validating raw input
 *    against `.min(5)` silently blocked submission (round 1).
 * 2. Simply dropping the length rule entirely (making the field
 *    unconditionally valid) reopened a different hole: a short but
 *    *non-blank* value (e.g. "営業") would pass step 2, then fail the
 *    canonical `projectFormSchema.safeParse` in `onSubmit` — but that
 *    field/error isn't rendered on step 3, where submit happens, so the
 *    failure had nowhere visible to go (round 2).
 *
 * The fix accepts blank (falls back later) or 5+ characters, matching the
 * canonical rule's intent while still letting the "任意" field be empty —
 * and enforces it during step-2 `goNext`, so an invalid non-blank value can
 * never reach step 3 in the first place.
 */
describe("projectBasicInfoSchema", () => {
  it("accepts a blank targetUsers (matches the '任意' label)", () => {
    const result = projectBasicInfoSchema.safeParse({
      name: "マイCRM",
      summary: "中小企業向けの顧客管理システムです。",
      targetUsers: "",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a missing targetUsers and defaults it to an empty string", () => {
    const result = projectBasicInfoSchema.safeParse({
      name: "マイCRM",
      summary: "中小企業向けの顧客管理システムです。",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetUsers).toBe("");
    }
  });

  it("still enforces the canonical name/summary length rules", () => {
    const result = projectBasicInfoSchema.safeParse({
      name: "A",
      summary: "short",
      targetUsers: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("サービス名は2文字以上で入力してください");
      expect(messages).toContain("サービス概要を入力してください");
    }
  });

  it("still accepts a targetUsers value the user actually typed", () => {
    const result = projectBasicInfoSchema.safeParse({
      name: "マイCRM",
      summary: "中小企業向けの顧客管理システムです。",
      targetUsers: "中小企業の営業チーム",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetUsers).toBe("中小企業の営業チーム");
    }
  });

  it("rejects a non-blank targetUsers shorter than 5 characters", () => {
    const result = projectBasicInfoSchema.safeParse({
      name: "マイCRM",
      summary: "中小企業向けの顧客管理システムです。",
      targetUsers: "営業",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "5文字以上で入力するか、空欄のままにしてください"
      );
    }
  });

  it("accepts exactly 5 characters", () => {
    const result = projectBasicInfoSchema.safeParse({
      name: "マイCRM",
      summary: "中小企業向けの顧客管理システムです。",
      targetUsers: "五文字丁度",
    });

    expect(result.success).toBe(true);
  });
});
