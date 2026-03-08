import { ProjectFormValues } from "@/types/project";

export const simpleCrmSaasPreset: Partial<ProjectFormValues> = {
  templateKey: "simple_crm_saas",
  brandTone: "professional",
  requiredFeatures: [
    "customer_management",
    "deal_management",
    "task_management",
    "admin_dashboard",
  ],
  managedData: ["customers", "deals", "tasks"],
  endUserCreatedData: ["notes"],
  roles: ["owner", "admin", "staff"],
  billingModel: "none",
  affiliateEnabled: false,
  visibilityRule: "staff_and_admin",
  mvpScope: [
    "auth",
    "tenant",
    "roles",
    "customer_crud",
    "deal_crud",
    "task_crud",
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
