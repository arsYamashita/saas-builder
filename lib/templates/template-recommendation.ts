/**
 * Rule-based template recommendation.
 *
 * Scores each template based on keyword matches in user input.
 * No AI calls — pure string matching + boolean checks.
 */

export interface RecommendationInput {
  summary: string;
  targetUsers: string;
  requiredFeatures: string[];
  managedData: string[];
  billingModel: string;
  affiliateEnabled: boolean;
}

export interface TemplateRecommendation {
  templateKey: string;
  score: number;
  reasons: string[];
}

interface Rule {
  templateKey: string;
  weight: number;
  reason: string;
  match: (input: RecommendationInput) => boolean;
}

const text = (input: RecommendationInput): string =>
  `${input.summary} ${input.targetUsers}`.toLowerCase();

const features = (input: RecommendationInput): string =>
  [...input.requiredFeatures, ...input.managedData].join(" ").toLowerCase();

const RULES: Rule[] = [
  // --- membership_content_affiliate ---
  {
    templateKey: "membership_content_affiliate",
    weight: 3,
    reason: "アフィリエイト機能が有効",
    match: (i) => i.affiliateEnabled,
  },
  {
    templateKey: "membership_content_affiliate",
    weight: 2,
    reason: "サブスクリプション課金を利用",
    match: (i) => i.billingModel === "subscription" || i.billingModel === "hybrid",
  },
  {
    templateKey: "membership_content_affiliate",
    weight: 2,
    reason: "会員管理・コンテンツ管理を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("member") || f.includes("content");
    },
  },
  {
    templateKey: "membership_content_affiliate",
    weight: 1,
    reason: "サロン・会員制サービス向けの記述あり",
    match: (i) => {
      const t = text(i);
      return t.includes("サロン") || t.includes("会員") || t.includes("コンテンツ") || t.includes("salon") || t.includes("membership");
    },
  },

  // --- reservation_saas ---
  {
    templateKey: "reservation_saas",
    weight: 3,
    reason: "予約管理機能を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("reservation") || f.includes("booking");
    },
  },
  {
    templateKey: "reservation_saas",
    weight: 2,
    reason: "サービス管理機能を含む",
    match: (i) => features(i).includes("service_management"),
  },
  {
    templateKey: "reservation_saas",
    weight: 1,
    reason: "予約・店舗向けの記述あり",
    match: (i) => {
      const t = text(i);
      return t.includes("予約") || t.includes("店舗") || t.includes("美容") || t.includes("reservation") || t.includes("booking");
    },
  },

  // --- simple_crm_saas ---
  {
    templateKey: "simple_crm_saas",
    weight: 3,
    reason: "案件管理機能を含む",
    match: (i) => features(i).includes("deal"),
  },
  {
    templateKey: "simple_crm_saas",
    weight: 2,
    reason: "顧客管理・タスク管理を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("customer") && f.includes("task");
    },
  },
  {
    templateKey: "simple_crm_saas",
    weight: 1,
    reason: "CRM・営業向けの記述あり",
    match: (i) => {
      const t = text(i);
      return t.includes("crm") || t.includes("営業") || t.includes("顧客管理") || t.includes("商談") || t.includes("案件");
    },
  },
  {
    templateKey: "simple_crm_saas",
    weight: 1,
    reason: "課金・アフィリエイト不要のシンプル構成",
    match: (i) => i.billingModel === "none" && !i.affiliateEnabled,
  },
];

/**
 * Returns up to 3 template recommendations sorted by score (descending).
 * Only templates with score > 0 are returned.
 */
export function getRecommendations(
  input: RecommendationInput
): TemplateRecommendation[] {
  const scores: Record<string, { score: number; reasons: string[] }> = {};

  for (const rule of RULES) {
    if (rule.match(input)) {
      if (!scores[rule.templateKey]) {
        scores[rule.templateKey] = { score: 0, reasons: [] };
      }
      scores[rule.templateKey].score += rule.weight;
      scores[rule.templateKey].reasons.push(rule.reason);
    }
  }

  return Object.entries(scores)
    .filter(([, v]) => v.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([templateKey, v]) => ({
      templateKey,
      score: v.score,
      reasons: v.reasons,
    }));
}
