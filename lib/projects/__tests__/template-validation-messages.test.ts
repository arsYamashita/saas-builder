import { describe, it, expect } from "vitest";
import { getTemplateGuidance } from "../template-validation-messages";

describe("getTemplateGuidance", () => {
  it("returns null for unknown template", () => {
    expect(getTemplateGuidance("unknown_template", {})).toBeNull();
  });

  it("mca: warns when summary lacks keywords", () => {
    const g = getTemplateGuidance("membership_content_affiliate", { summary: "テスト" });
    expect(g!.messages.length).toBeGreaterThan(0);
  });

  it("mca: no summary warning when keywords present", () => {
    const g = getTemplateGuidance("membership_content_affiliate", {
      summary: "会員向けコンテンツ配信",
      billingModel: "subscription",
      affiliateEnabled: true,
    });
    expect(g!.messages.find((m) => m.includes("サービス概要"))).toBeUndefined();
  });

  it("mca: warns about billing when not subscription", () => {
    const g = getTemplateGuidance("membership_content_affiliate", {
      summary: "会員サービス",
      billingModel: "none",
      affiliateEnabled: true,
    });
    expect(g!.messages.find((m) => m.includes("課金"))).toBeDefined();
  });

  it("rsv: warns when summary lacks reservation keywords", () => {
    const g = getTemplateGuidance("reservation_saas", { summary: "テスト" });
    expect(g!.messages.find((m) => m.includes("予約対象"))).toBeDefined();
  });

  it("rsv: no warning when summary has 予約", () => {
    const g = getTemplateGuidance("reservation_saas", {
      summary: "予約管理システム",
      targetUsers: "店舗オーナー",
      requiredFeatures: ["customer_management"],
    });
    expect(g!.messages.find((m) => m.includes("予約対象"))).toBeUndefined();
  });

  it("crm: warns when deal_management not in features", () => {
    const g = getTemplateGuidance("simple_crm_saas", {
      summary: "顧客管理",
      requiredFeatures: [],
    });
    expect(g!.messages.find((m) => m.includes("案件管理"))).toBeDefined();
  });

  it("iao: warns about approval workflow keywords", () => {
    const g = getTemplateGuidance("internal_admin_ops_saas", { summary: "テスト" });
    expect(g!.messages.find((m) => m.includes("申請・承認"))).toBeDefined();
  });

  it("cms: warns about community keywords", () => {
    const g = getTemplateGuidance("community_membership_saas", { summary: "テスト" });
    expect(g!.messages.find((m) => m.includes("コミュニティ"))).toBeDefined();
  });

  it("all templates return title", () => {
    const keys = [
      "membership_content_affiliate",
      "reservation_saas",
      "community_membership_saas",
      "simple_crm_saas",
      "internal_admin_ops_saas",
    ];
    for (const key of keys) {
      const g = getTemplateGuidance(key, {});
      expect(g!.title).toBeTruthy();
    }
  });
});
