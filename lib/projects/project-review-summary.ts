/**
 * Builds a review-friendly summary from form state.
 * Used to display a pre-submit review section.
 */

export interface ReviewItem {
  label: string;
  value: string;
  empty: boolean;
}

export interface ReviewSummary {
  items: ReviewItem[];
}

const BILLING_LABELS: Record<string, string> = {
  subscription: "サブスクリプション",
  one_time: "買い切り",
  hybrid: "ハイブリッド",
  none: "なし",
};

export function buildReviewSummary(
  form: Record<string, unknown>,
  templateLabel?: string
): ReviewSummary {
  const items: ReviewItem[] = [
    item("テンプレート", templateLabel || (form.templateKey as string)),
    item("サービス名", form.name as string),
    item("サービス概要", form.summary as string),
    item("解決したい課題", form.problemToSolve as string),
    item("ターゲットユーザー", form.targetUsers as string),
    item("管理データ", formatArray(form.managedData)),
    item("必要な機能", formatArray(form.requiredFeatures)),
    item("課金方式", BILLING_LABELS[(form.billingModel as string) ?? ""] ?? (form.billingModel as string)),
    item("アフィリエイト", form.affiliateEnabled ? "有効" : "無効"),
  ];

  return { items };
}

function item(label: string, value: unknown): ReviewItem {
  const s = typeof value === "string" ? value.trim() : "";
  return { label, value: s || "未入力", empty: !s };
}

function formatArray(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";
  return value.join(", ");
}
