import { describe, it, expect } from "vitest";
import { buildReviewSummary } from "../project-review-summary";

describe("buildReviewSummary", () => {
  it("returns all expected items", () => {
    const s = buildReviewSummary({
      templateKey: "reservation_saas",
      name: "My App",
      summary: "A reservation app",
      problemToSolve: "Booking chaos",
      targetUsers: "Salon owners",
      managedData: ["reservations", "customers"],
      requiredFeatures: ["reservation_management"],
      billingModel: "subscription",
      affiliateEnabled: false,
    });
    expect(s.items.length).toBe(9);
  });

  it("marks empty fields", () => {
    const s = buildReviewSummary({ name: "", templateKey: "" });
    const nameItem = s.items.find((i) => i.label === "サービス名");
    expect(nameItem!.empty).toBe(true);
    expect(nameItem!.value).toBe("未入力");
  });

  it("uses template label when provided", () => {
    const s = buildReviewSummary({ templateKey: "reservation_saas" }, "予約SaaS");
    const tplItem = s.items.find((i) => i.label === "テンプレート");
    expect(tplItem!.value).toBe("予約SaaS");
  });

  it("translates billing model", () => {
    const s = buildReviewSummary({ billingModel: "subscription" });
    const item = s.items.find((i) => i.label === "課金方式");
    expect(item!.value).toBe("サブスクリプション");
  });

  it("formats affiliate as 有効/無効", () => {
    const sOn = buildReviewSummary({ affiliateEnabled: true });
    const sOff = buildReviewSummary({ affiliateEnabled: false });
    expect(sOn.items.find((i) => i.label === "アフィリエイト")!.value).toBe("有効");
    expect(sOff.items.find((i) => i.label === "アフィリエイト")!.value).toBe("無効");
  });

  it("formats arrays as comma-separated", () => {
    const s = buildReviewSummary({ managedData: ["a", "b", "c"] });
    const item = s.items.find((i) => i.label === "管理データ");
    expect(item!.value).toBe("a, b, c");
  });

  it("handles empty array as 未入力", () => {
    const s = buildReviewSummary({ managedData: [] });
    const item = s.items.find((i) => i.label === "管理データ");
    expect(item!.empty).toBe(true);
  });
});
