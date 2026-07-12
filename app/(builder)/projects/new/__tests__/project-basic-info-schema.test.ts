import { describe, it, expect } from "vitest";
import { projectFormSchema } from "@/lib/validation/project-form";
import { buildProjectPayload, projectBasicInfoSchema } from "../page";

/**
 * Regression coverage for three bugs caught across three rounds of codex
 * review (gpt-5.6-terra) during the RHF+Zod migration:
 *
 * 1. `projectBasicInfoSchema` originally picked `targetUsers` verbatim from
 *    `projectFormSchema`, pulling in its `min(5)` rule. That rule is meant
 *    for the *post-fallback* value `buildProjectPayload` computes (template
 *    default / "一般ユーザー"), not the raw, optional
 *    "ターゲットユーザー（任意）" field on step 2 — validating raw input
 *    against `.min(5)` silently blocked submission (round 1).
 * 2. Simply dropping the length rule entirely (making the field
 *    unconditionally valid) reopened a different hole: a short but
 *    *non-blank* value (e.g. "営業") would pass step 2, then fail the
 *    canonical `projectFormSchema.safeParse` in `onSubmit` — but that
 *    field/error isn't rendered on step 3, where submit happens, so the
 *    failure had nowhere visible to go (round 2).
 * 3. `buildProjectPayload` used to re-`.trim()` `name`/`summary`/
 *    `targetUsers` before the second (canonical) validation pass. A
 *    whitespace-padded value (e.g. `" A"`, a summary ending in whitespace
 *    that's exactly 10 chars raw, or a padded short `targetUsers`) could
 *    pass step 2's raw-length check, then fail the canonical schema *after*
 *    trimming — again invisibly, on step 3 (round 3).
 *
 * The fix (round 1+2) accepts blank (falls back later) or 5+ characters for
 * `targetUsers`, enforced during step-2 `goNext` so an invalid non-blank
 * value can never reach step 3. The fix (round 3) is to never trim between
 * the two validation passes — both layers see the exact same string, so
 * they can never disagree.
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

describe("buildProjectPayload (dual-validation consistency)", () => {
  /**
   * The property under test: anything `projectBasicInfoSchema` accepts for
   * name/summary/targetUsers must also be accepted by the canonical
   * `projectFormSchema` once merged into a full payload — i.e.
   * `buildProjectPayload` must not transform these three values in a way
   * that changes their validity between the two passes.
   */
  function revalidateAsFullPayload(basicInfo: {
    name: string;
    summary: string;
    targetUsers: string;
  }) {
    const payload = buildProjectPayload(basicInfo, "membership_content_affiliate", undefined);
    return projectFormSchema.safeParse(payload);
  }

  it("a whitespace-padded name that is borderline-valid raw does not get silently trimmed into invalid", () => {
    // " A" is 2 raw chars (passes projectBasicInfoSchema's min(2)) but only
    // 1 char once trimmed — this used to fail invisibly after buildPayload
    // re-trimmed it.
    const basicInfo = { name: " A", summary: "十分な長さのサービス概要です。", targetUsers: "" };

    expect(projectBasicInfoSchema.safeParse(basicInfo).success).toBe(true);
    const result = revalidateAsFullPayload(basicInfo);
    expect(result.success).toBe(true);
    if (result.success) {
      // Stored exactly as validated — not re-trimmed to " A" -> "A".
      expect(result.data.name).toBe(" A");
    }
  });

  it("a whitespace-padded summary that is borderline-valid raw stays valid after building the payload", () => {
    const paddedSummary = " 123456789"; // 10 raw chars, 9 once trimmed
    const basicInfo = { name: "マイCRM", summary: paddedSummary, targetUsers: "" };

    expect(projectBasicInfoSchema.safeParse(basicInfo).success).toBe(true);
    const result = revalidateAsFullPayload(basicInfo);
    expect(result.success).toBe(true);
  });

  it("a whitespace-padded targetUsers that is borderline-valid raw stays valid after building the payload", () => {
    const targetUsers = "1234 "; // 5 raw chars, only 4 once trimmed
    const basicInfo = { name: "マイCRM", summary: "十分な長さのサービス概要です。", targetUsers };

    expect(projectBasicInfoSchema.safeParse(basicInfo).success).toBe(true);
    const result = revalidateAsFullPayload(basicInfo);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetUsers).toBe("1234 ");
    }
  });

  it("falls back to the template's recommended target users only when targetUsers is truly empty", () => {
    const withFallback = buildProjectPayload(
      { name: "マイCRM", summary: "概要", targetUsers: "" },
      "membership_content_affiliate",
      "会員制ビジネスのオーナー"
    );
    expect(withFallback.targetUsers).toBe("会員制ビジネスのオーナー");

    const withoutFallback = buildProjectPayload(
      { name: "マイCRM", summary: "概要", targetUsers: "1234 " },
      "membership_content_affiliate",
      "会員制ビジネスのオーナー"
    );
    expect(withoutFallback.targetUsers).toBe("1234 ");
  });
});
