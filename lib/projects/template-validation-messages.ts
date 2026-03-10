/**
 * Template-aware guidance messages.
 * Not validation — just light hints about what's useful for each template.
 */

export interface TemplateGuidance {
  title: string;
  messages: string[];
}

export function getTemplateGuidance(
  templateKey: string,
  form: Record<string, unknown>
): TemplateGuidance | null {
  switch (templateKey) {
    case "membership_content_affiliate":
      return mcaGuidance(form);
    case "reservation_saas":
      return rsvGuidance(form);
    case "simple_crm_saas":
      return crmGuidance(form);
    default:
      return null;
  }
}

function mcaGuidance(form: Record<string, unknown>): TemplateGuidance {
  const messages: string[] = [];

  if (!hasText(form.summary, "会員") && !hasText(form.summary, "コンテンツ")) {
    messages.push("サービス概要に会員向けサービスやコンテンツの内容を書くと生成精度が上がります");
  }
  if (form.billingModel !== "subscription" && form.billingModel !== "hybrid") {
    messages.push("このテンプレは月額課金を前提としています。課金方式の確認をおすすめします");
  }
  if (!form.affiliateEnabled) {
    messages.push("紹介制度（アフィリエイト）を有効にすると、テンプレの機能をフル活用できます");
  }

  return {
    title: "会員サイト + コンテンツ販売テンプレ向けのヒント",
    messages,
  };
}

function rsvGuidance(form: Record<string, unknown>): TemplateGuidance {
  const messages: string[] = [];

  if (!hasText(form.summary, "予約") && !hasText(form.summary, "サービス")) {
    messages.push("サービス概要に予約対象やサービス内容を書くと生成精度が上がります");
  }
  if (!hasText(form.targetUsers, "店舗") && !hasText(form.targetUsers, "サロン") && !hasText(form.targetUsers, "オーナー")) {
    messages.push("ターゲットユーザーに店舗やサービス提供者の情報があると具体的な画面が生成されます");
  }
  if (!includesAny(form.requiredFeatures, ["customer_management"])) {
    messages.push("顧客管理機能を追加すると、予約と顧客の紐付けが生成されます");
  }

  return {
    title: "予約 SaaS テンプレ向けのヒント",
    messages,
  };
}

function crmGuidance(form: Record<string, unknown>): TemplateGuidance {
  const messages: string[] = [];

  if (!hasText(form.summary, "顧客") && !hasText(form.summary, "営業") && !hasText(form.summary, "CRM")) {
    messages.push("サービス概要に顧客管理や営業の目的を書くと生成精度が上がります");
  }
  if (!includesAny(form.requiredFeatures, ["deal_management"])) {
    messages.push("案件管理機能を追加すると、商談パイプラインが生成されます");
  }
  if (!includesAny(form.requiredFeatures, ["task_management"])) {
    messages.push("タスク管理機能を追加すると、ToDo や期限管理が生成されます");
  }

  return {
    title: "シンプル CRM テンプレ向けのヒント",
    messages,
  };
}

function hasText(value: unknown, keyword: string): boolean {
  return typeof value === "string" && value.includes(keyword);
}

function includesAny(value: unknown, keys: string[]): boolean {
  if (!Array.isArray(value)) return false;
  return keys.some((k) => value.includes(k));
}
