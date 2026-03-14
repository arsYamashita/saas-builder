import type { RegisteredTemplateKey } from "@/lib/templates/template-registry";

export type ProjectStatus =
  | "draft"
  | "blueprint_ready"
  | "generating"
  | "generated"
  | "preview"
  | "deployed"
  | "error";

/**
 * Template key — derived from registry + non-registry placeholders.
 * Adding a template to TEMPLATE_KEYS in template-registry.ts
 * automatically includes it here.
 */
export type TemplateKey = RegisteredTemplateKey | "online_salon" | "custom";

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
  | "editor"
  | "staff"
  | "member"
  | "affiliate_manager"
  | "sales"
  | "operator";

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

