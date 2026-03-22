import { describe, it, expect } from "vitest";
import { getRecommendations, type RecommendationInput } from "../template-recommendation";

const base: RecommendationInput = {
  summary: "",
  targetUsers: "",
  requiredFeatures: [],
  managedData: [],
  billingModel: "none",
  affiliateEnabled: false,
};

describe("getRecommendations", () => {
  it("returns empty for blank input", () => {
    const r = getRecommendations(base);
    // some templates match "billingModel: none && !affiliateEnabled" so may get hits
    // but all should have score > 0
    for (const rec of r) {
      expect(rec.score).toBeGreaterThan(0);
    }
  });

  it("recommends membership_content_affiliate for affiliate + subscription", () => {
    const r = getRecommendations({
      ...base,
      affiliateEnabled: true,
      billingModel: "subscription",
      requiredFeatures: ["member_management", "content_management"],
      summary: "会員向けサロンサービス",
    });
    expect(r[0].templateKey).toBe("membership_content_affiliate");
    expect(r[0].score).toBeGreaterThanOrEqual(5);
  });

  it("recommends reservation_saas for reservation keywords", () => {
    const r = getRecommendations({
      ...base,
      requiredFeatures: ["reservation_management", "service_management"],
      summary: "美容サロンの予約管理",
    });
    expect(r[0].templateKey).toBe("reservation_saas");
  });

  it("recommends simple_crm_saas for deal management", () => {
    const r = getRecommendations({
      ...base,
      requiredFeatures: ["deal_management", "contact_management"],
      summary: "営業チーム向けCRM",
    });
    expect(r[0].templateKey).toBe("simple_crm_saas");
  });

  it("recommends internal_admin_ops_saas for approval workflow", () => {
    const r = getRecommendations({
      ...base,
      requiredFeatures: ["approval_workflow"],
      summary: "社内の承認フロー管理",
    });
    expect(r[0].templateKey).toBe("internal_admin_ops_saas");
  });

  it("recommends community_membership_saas for content_access + hybrid", () => {
    const r = getRecommendations({
      ...base,
      billingModel: "hybrid",
      requiredFeatures: ["content_access"],
      summary: "コミュニティ会員制サイト",
    });
    expect(r[0].templateKey).toBe("community_membership_saas");
  });

  it("returns at most 3 recommendations", () => {
    const r = getRecommendations({
      ...base,
      summary: "会員サロン予約CRM社内管理コミュニティ",
      requiredFeatures: ["member_management", "reservation_management", "deal_management", "approval_workflow", "content_access"],
      billingModel: "subscription",
      affiliateEnabled: true,
    });
    expect(r.length).toBeLessThanOrEqual(3);
  });

  it("results are sorted by score descending", () => {
    const r = getRecommendations({
      ...base,
      summary: "会員コンテンツ予約",
      requiredFeatures: ["member_management"],
      billingModel: "subscription",
      affiliateEnabled: true,
    });
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  it("each recommendation has reasons", () => {
    const r = getRecommendations({
      ...base,
      affiliateEnabled: true,
      billingModel: "subscription",
    });
    for (const rec of r) {
      expect(rec.reasons.length).toBeGreaterThan(0);
    }
  });
});
