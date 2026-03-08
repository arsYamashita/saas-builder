import { ProjectFormValues } from "@/types/project";

export const defaultProjectFormValues: ProjectFormValues = {
  name: "",
  summary: "",
  targetUsers: "",
  problemToSolve: "",
  referenceServices: "",
  brandTone: "modern",

  templateKey: "membership_content_affiliate",
  requiredFeatures: [
    "member_management",
    "content_management",
    "subscription_billing",
    "affiliate_links",
    "admin_dashboard",
  ],
  managedData: ["members", "contents", "plans", "commissions"],
  endUserCreatedData: ["profile", "comments"],
  roles: ["owner", "admin", "member"],
  billingModel: "subscription",
  affiliateEnabled: true,
  visibilityRule: "members_only",
  mvpScope: [
    "auth",
    "tenant",
    "roles",
    "content_crud",
    "subscription_billing",
    "affiliate_tracking",
  ],
  excludedInitialScope: [
    "advanced_analytics",
    "mobile_app",
    "multi_language",
    "automation_builder",
  ],

  stackPreference: "Next.js + Supabase + Stripe",
  notes: "",
  priority: "high",
};
