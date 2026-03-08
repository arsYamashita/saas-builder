export type ProjectStatus =
  | "draft"
  | "blueprint_ready"
  | "generating"
  | "generated"
  | "preview"
  | "deployed"
  | "error";

export type TemplateKey =
  | "membership_content_affiliate"
  | "reservation_saas"
  | "online_salon"
  | "custom";

export type BillingModel = "subscription" | "one_time" | "hybrid" | "none";

export type BrandTone =
  | "modern"
  | "minimal"
  | "luxury"
  | "friendly"
  | "professional"
  | "playful";

export type ProjectRole =
  | "owner"
  | "admin"
  | "staff"
  | "member"
  | "affiliate_manager";

export type ProjectFormValues = {
  name: string;
  summary: string;
  targetUsers: string;
  problemToSolve: string;
  referenceServices: string;
  brandTone: BrandTone;

  templateKey: TemplateKey;
  requiredFeatures: string[];
  managedData: string[];
  endUserCreatedData: string[];
  roles: ProjectRole[];
  billingModel: BillingModel;
  affiliateEnabled: boolean;
  visibilityRule: string;
  mvpScope: string[];
  excludedInitialScope: string[];

  stackPreference: string;
  notes: string;
  priority: "low" | "medium" | "high";
};

export type Project = {
  id: string;
  tenant_id: string;
  name: string;
  industry: string;
  template_key: string;
  status: ProjectStatus;
  description: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type GeneratedModule = {
  id: string;
  project_id: string;
  module_type: string;
  module_key: string;
  status: "pending" | "generating" | "completed" | "error";
  source_blueprint_version: number;
  output_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateConfig = {
  key: string;
  name: string;
  description: string;
  domain_tables: string[];
  domain_screens: string[];
};

export const TEMPLATES: Record<string, TemplateConfig> = {
  membership_content_affiliate: {
    key: "membership_content_affiliate",
    name: "会員サイト + コンテンツ販売 + アフィリエイト",
    description:
      "会員サイト / コンテンツ販売 / 月額課金 / 紹介制度 を持つSaaSテンプレ",
    domain_tables: ["contents", "membership_plans"],
    domain_screens: [
      "/content",
      "/content/new",
      "/content/[id]",
      "/plans",
      "/plans/new",
      "/members",
      "/members/[id]",
    ],
  },
};
