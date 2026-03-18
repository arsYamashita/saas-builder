/**
 * Domain Classifier — Keyword-based business domain classification
 *
 * Pure function (no AI). Classifies ideas into predefined SaaS domains.
 */

import type { AnalyzedIdea } from "../core/types";

export type SaaSDomain =
  | "crm"
  | "ecommerce"
  | "reservation"
  | "membership"
  | "community"
  | "education"
  | "finance"
  | "support"
  | "analytics"
  | "internal_ops"
  | "creator_economy"
  | "marketplace";

// ── Domain Keyword Mappings ──────────────────────────────

const DOMAIN_KEYWORDS: Record<SaaSDomain, (string | RegExp)[]> = {
  crm: [
    "crm",
    "customer",
    "sales",
    "lead",
    "prospect",
    "relationship",
    "顧客",
    "営業",
    "リード",
  ],
  ecommerce: [
    "ecommerce",
    "shop",
    "store",
    "checkout",
    "cart",
    "product",
    "shopping",
    "ec",
    "オンラインショップ",
    "ストア",
    "商品",
  ],
  reservation: [
    "booking",
    "reservation",
    "appointment",
    "schedule",
    "calendar",
    "slot",
    "予約",
    "カレンダー",
    "スケジュール",
  ],
  membership: [
    "membership",
    "subscription",
    "member",
    "recurring",
    "subscriber",
    "メンバーシップ",
    "会員",
    "購読",
  ],
  community: [
    "community",
    "forum",
    "social",
    "network",
    "group",
    "collaboration",
    "コミュニティ",
    "フォーラム",
    "ソーシャル",
  ],
  education: [
    "course",
    "training",
    "learning",
    "education",
    "student",
    "lesson",
    "teaching",
    "講座",
    "学習",
    "教育",
  ],
  finance: [
    "payment",
    "invoice",
    "accounting",
    "billing",
    "finance",
    "expense",
    "revenue",
    "支払い",
    "会計",
    "請求",
  ],
  support: [
    "support",
    "help",
    "ticket",
    "issue",
    "customer service",
    "helpdesk",
    "サポート",
    "チケット",
    "カスタマーサービス",
  ],
  analytics: [
    "analytics",
    "metrics",
    "dashboard",
    "reporting",
    "data",
    "insight",
    "analysis",
    "分析",
    "レポート",
    "ダッシュボード",
  ],
  internal_ops: [
    "project management",
    "task",
    "workflow",
    "internal",
    "team",
    "collaboration",
    "プロジェクト管理",
    "タスク",
    "ワークフロー",
  ],
  creator_economy: [
    "creator",
    "influencer",
    "content",
    "monetization",
    "fan",
    "patron",
    "クリエイター",
    "インフルエンサー",
    "コンテンツ",
  ],
  marketplace: [
    "marketplace",
    "seller",
    "buyer",
    "vendor",
    "platform",
    "transaction",
    "マーケットプレイス",
    "出品者",
    "購入者",
  ],
};

// ── Classification Function ──────────────────────────────

export function classifyDomain(
  text: string
): SaaSDomain | null {
  const lowerText = text.toLowerCase();

  const scores: Record<SaaSDomain, number> = {
    crm: 0,
    ecommerce: 0,
    reservation: 0,
    membership: 0,
    community: 0,
    education: 0,
    finance: 0,
    support: 0,
    analytics: 0,
    internal_ops: 0,
    creator_economy: 0,
    marketplace: 0,
  };

  // Count matches for each domain
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword instanceof RegExp) {
        if (keyword.test(lowerText)) {
          scores[domain as SaaSDomain]++;
        }
      } else {
        const count = (lowerText.match(new RegExp(keyword, "gi")) || []).length;
        scores[domain as SaaSDomain] += count;
      }
    }
  }

  // Find domain with highest score
  let maxScore = 0;
  let bestDomain: SaaSDomain | null = null;

  for (const [domain, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestDomain = domain as SaaSDomain;
    }
  }

  return maxScore > 0 ? bestDomain : null;
}

// ── Get all matching domains (for multi-domain ideas) ──────

export function getMatchingDomains(text: string): SaaSDomain[] {
  const lowerText = text.toLowerCase();

  const scores: Record<SaaSDomain, number> = {
    crm: 0,
    ecommerce: 0,
    reservation: 0,
    membership: 0,
    community: 0,
    education: 0,
    finance: 0,
    support: 0,
    analytics: 0,
    internal_ops: 0,
    creator_economy: 0,
    marketplace: 0,
  };

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const keyword of keywords) {
      if (keyword instanceof RegExp) {
        if (keyword.test(lowerText)) {
          scores[domain as SaaSDomain]++;
        }
      } else {
        const count = (lowerText.match(new RegExp(keyword, "gi")) || []).length;
        scores[domain as SaaSDomain] += count;
      }
    }
  }

  return Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain as SaaSDomain);
}
