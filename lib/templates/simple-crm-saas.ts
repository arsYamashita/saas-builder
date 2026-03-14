import { ProjectFormValues } from "@/types/project";

export const simpleCrmSaasPreset: Partial<ProjectFormValues> = {
  templateKey: "simple_crm_saas",
  brandTone: "professional",
  requiredFeatures: [
    "contact_management",
    "company_management",
    "deal_management",
    "activity_management",
    "admin_dashboard",
  ],
  managedData: ["contacts", "companies", "deals", "activities"],
  endUserCreatedData: [],
  roles: ["owner", "admin", "sales"],
  billingModel: "none",
  affiliateEnabled: false,
  visibilityRule: "sales_and_admin",
  mvpScope: [
    "auth",
    "tenant",
    "roles",
    "contact_crud",
    "company_crud",
    "deal_crud",
    "activity_crud",
  ],
  excludedInitialScope: [
    "advanced_analytics",
    "mobile_app",
    "multi_language",
    "email_automation",
    "calendar_sync",
    "payment_processing",
    "notification_system",
  ],
  stackPreference: "Next.js + Supabase + Stripe",
  priority: "high",
};
