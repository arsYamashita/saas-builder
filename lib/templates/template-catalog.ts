/**
 * Template Catalog — UI-facing metadata for template selection.
 *
 * This is separate from template-registry.ts which handles prompt routing.
 * Catalog entries provide human-readable descriptions for the New Project form.
 */

export interface TemplateCatalogEntry {
  templateKey: string;
  label: string;
  shortDescription: string;
  targetUsers: string;
  coreEntities: string[];
  includesBilling: boolean;
  includesAffiliate: boolean;
  statusBadge: "GREEN" | "DRAFT";
  recommendedFor: string;
}

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  {
    templateKey: "membership_content_affiliate",
    label: "会員サイト + コンテンツ販売 + アフィリエイト",
    shortDescription:
      "会員管理、コンテンツ販売、サブスクリプション課金、アフィリエイト追跡を備えたSaaS",
    targetUsers: "オンラインサロン運営者、コンテンツクリエイター",
    coreEntities: ["members", "contents", "plans", "commissions"],
    includesBilling: true,
    includesAffiliate: true,
    statusBadge: "GREEN",
    recommendedFor: "会員制サービスやコンテンツ販売を始めたい方",
  },
  {
    templateKey: "reservation_saas",
    label: "予約管理SaaS",
    shortDescription:
      "サービス管理、予約管理、顧客管理を備えた店舗向け予約SaaS",
    targetUsers: "美容サロン、店舗オーナー、小規模サービス事業者",
    coreEntities: ["services", "reservations", "customers", "staff_members"],
    includesBilling: false,
    includesAffiliate: false,
    statusBadge: "GREEN",
    recommendedFor: "予約ベースのサービス業を運営している方",
  },
  {
    templateKey: "simple_crm_saas",
    label: "シンプルCRM SaaS",
    shortDescription:
      "顧客管理、案件管理、タスク管理を備えたシンプルなCRM",
    targetUsers: "中小企業の営業チーム、マネージャー",
    coreEntities: ["customers", "deals", "tasks"],
    includesBilling: false,
    includesAffiliate: false,
    statusBadge: "GREEN",
    recommendedFor: "営業プロセスをシンプルに管理したい方",
  },
];

/** Get catalog entry by templateKey. Returns undefined if not found. */
export function getCatalogEntry(
  templateKey: string
): TemplateCatalogEntry | undefined {
  return TEMPLATE_CATALOG.find((e) => e.templateKey === templateKey);
}
