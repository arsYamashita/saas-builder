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

  // --- community_membership_saas ---
  {
    templateKey: "community_membership_saas",
    weight: 3,
    reason: "コンテンツアクセス制御 (public/members_only/rules_based) を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("content_access") || f.includes("access_control") || f.includes("visibility");
    },
  },
  {
    templateKey: "community_membership_saas",
    weight: 2,
    reason: "サブスク + 単品購入のハイブリッド課金",
    match: (i) => i.billingModel === "hybrid",
  },
  {
    templateKey: "community_membership_saas",
    weight: 2,
    reason: "タグベースのアクセス管理を含む",
    match: (i) => features(i).includes("tag"),
  },
  {
    templateKey: "community_membership_saas",
    weight: 1,
    reason: "コミュニティ・会員制の記述あり",
    match: (i) => {
      const t = text(i);
      return t.includes("コミュニティ") || t.includes("community") || t.includes("会員制") || t.includes("membership");
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
    reason: "連絡先・企業・活動管理を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("contact") || f.includes("company") || f.includes("activity");
    },
  },
  {
    templateKey: "simple_crm_saas",
    weight: 1,
    reason: "CRM・営業向けの記述あり",
    match: (i) => {
      const t = text(i);
      return t.includes("crm") || t.includes("営業") || t.includes("顧客管理") || t.includes("商談") || t.includes("案件") || t.includes("連絡先");
    },
  },
  {
    templateKey: "simple_crm_saas",
    weight: 1,
    reason: "課金・アフィリエイト不要のシンプル構成",
    match: (i) => i.billingModel === "none" && !i.affiliateEnabled,
  },

  // --- internal_admin_ops_saas ---
  {
    templateKey: "internal_admin_ops_saas",
    weight: 3,
    reason: "承認ワークフロー機能を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("approval") || f.includes("workflow");
    },
  },
  {
    templateKey: "internal_admin_ops_saas",
    weight: 2,
    reason: "作業依頼・タスク管理を含む",
    match: (i) => {
      const f = features(i);
      return f.includes("request") || f.includes("operation");
    },
  },
  {
    templateKey: "internal_admin_ops_saas",
    weight: 1,
    reason: "社内管理・バックオフィス向けの記述あり",
    match: (i) => {
      const t = text(i);
      return t.includes("社内") || t.includes("管理部") || t.includes("バックオフィス") || t.includes("承認") || t.includes("申請") || t.includes("internal") || t.includes("back office");
    },
  },
  {
    templateKey: "internal_admin_ops_saas",
    weight: 1,
    reason: "課金不要の内部ツール構成",
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
