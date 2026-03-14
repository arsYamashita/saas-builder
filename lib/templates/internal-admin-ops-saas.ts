import { ProjectFormValues } from "@/types/project";

export const internalAdminOpsSaasPreset: Partial<ProjectFormValues> = {
  templateKey: "internal_admin_ops_saas",
  brandTone: "professional",
  requiredFeatures: [
    "request_management",
    "approval_workflow",
    "category_management",
    "admin_dashboard",
  ],
  managedData: [
    "tenants",
    "operation_requests",
    "approvals",
    "categories",
    "audit_logs",
  ],
  endUserCreatedData: ["comments"],
  roles: ["owner", "admin", "staff"],
  billingModel: "none",
  affiliateEnabled: false,
  visibilityRule: "staff_and_admin",
  mvpScope: [
    "auth",
    "tenant",
    "roles",
    "request_crud",
    "approval_workflow",
    "category_crud",
    "audit_log",
  ],
  excludedInitialScope: [
    "advanced_analytics",
    "mobile_app",
    "multi_language",
    "email_notification",
    "file_attachment",
    "sla_tracking",
    "calendar_integration",
  ],
  stackPreference: "Next.js + Supabase + Stripe",
  priority: "high",
};
