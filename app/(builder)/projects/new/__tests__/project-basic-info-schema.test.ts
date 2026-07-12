import { describe, it, expect } from "vitest";
import { projectBasicInfoSchema } from "../page";

/**
 * Regression coverage for a bug caught in codex review (gpt-5.6-terra) during
 * the RHF+Zod migration: `projectBasicInfoSchema` was originally
 * `projectFormSchema.pick({ name, summary, targetUsers })` verbatim, which
 * pulled in the canonical schema's `targetUsers: z.string().min(5, ...)`
 * rule. That rule is only meant to apply to the *post-fallback* value
 * `buildPayload` computes (template default / "一般ユーザー"), not to the
 * raw, optional "ターゲットユーザー（任意）" field the user types into on
 * step 2. Validating the raw input against `.min(5)` blocked submission
 * with no visible error, since the field (and its error message) only
 * renders on step 2 while the "作成" button lives on step 3.
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
});
