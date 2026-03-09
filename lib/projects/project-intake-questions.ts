/**
 * Fixed intake questions for the New Project form.
 *
 * Each question maps to one or more ProjectFormValues fields.
 * Answers are used to pre-fill form fields and improve template recommendations.
 */

export interface IntakeQuestion {
  id: string;
  question: string;
  helpText: string;
  type: "text" | "select" | "boolean";
  options?: { value: string; label: string }[];
  /** Which form fields this answer influences */
  targetFields: string[];
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: "business_type",
    question: "どんなサービスを作りたいですか？",
    helpText: "1〜2文で簡単に教えてください",
    type: "text",
    targetFields: ["summary", "problemToSolve"],
  },
  {
    id: "main_users",
    question: "主なユーザーは誰ですか？",
    helpText: "例: 美容サロンのオーナー、中小企業の営業チーム",
    type: "text",
    targetFields: ["targetUsers"],
  },
  {
    id: "core_domain",
    question: "中心になるデータは何ですか？",
    helpText: "サービスの核となる管理対象を選んでください",
    type: "select",
    options: [
      { value: "members_content", label: "会員・コンテンツ" },
      { value: "reservations", label: "予約・サービス" },
      { value: "customers_deals", label: "顧客・案件・タスク" },
      { value: "other", label: "その他" },
    ],
    targetFields: ["managedData", "requiredFeatures"],
  },
  {
    id: "needs_billing",
    question: "月額課金（サブスクリプション）は必要ですか？",
    helpText: "ユーザーから定期的に料金を徴収する場合",
    type: "boolean",
    targetFields: ["billingModel"],
  },
  {
    id: "needs_affiliate",
    question: "紹介制度（アフィリエイト）は必要ですか？",
    helpText: "ユーザーが他のユーザーを紹介して報酬を得る仕組み",
    type: "boolean",
    targetFields: ["affiliateEnabled"],
  },
];

export interface IntakeAnswers {
  business_type: string;
  main_users: string;
  core_domain: string;
  needs_billing: boolean;
  needs_affiliate: boolean;
}

export const DEFAULT_INTAKE_ANSWERS: IntakeAnswers = {
  business_type: "",
  main_users: "",
  core_domain: "",
  needs_billing: false,
  needs_affiliate: false,
};

/**
 * Convert intake answers into partial form values.
 * These are suggestions — the form is still source of truth.
 */
export function intakeToFormHints(answers: IntakeAnswers): Record<string, unknown> {
  const hints: Record<string, unknown> = {};

  if (answers.business_type) {
    hints.summary = answers.business_type;
    hints.problemToSolve = answers.business_type;
  }

  if (answers.main_users) {
    hints.targetUsers = answers.main_users;
  }

  if (answers.core_domain === "members_content") {
    hints.managedData = ["members", "contents", "plans", "commissions"];
    hints.requiredFeatures = [
      "member_management",
      "content_management",
      "subscription_billing",
      "affiliate_links",
      "admin_dashboard",
    ];
  } else if (answers.core_domain === "reservations") {
    hints.managedData = ["services", "reservations", "customers"];
    hints.requiredFeatures = [
      "service_management",
      "reservation_management",
      "customer_management",
      "admin_dashboard",
    ];
  } else if (answers.core_domain === "customers_deals") {
    hints.managedData = ["customers", "deals", "tasks"];
    hints.requiredFeatures = [
      "customer_management",
      "deal_management",
      "task_management",
      "admin_dashboard",
    ];
  }

  hints.billingModel = answers.needs_billing ? "subscription" : "none";
  hints.affiliateEnabled = answers.needs_affiliate;

  return hints;
}
