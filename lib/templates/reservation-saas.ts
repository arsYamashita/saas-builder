import { ProjectFormValues } from "@/types/project";

export const reservationSaasPreset: Partial<ProjectFormValues> = {
  templateKey: "reservation_saas",
  brandTone: "professional",
  requiredFeatures: [
    "service_management",
    "reservation_management",
    "customer_management",
    "admin_dashboard",
  ],
  managedData: ["services", "reservations", "customers"],
  endUserCreatedData: ["profile", "reservation_requests"],
  roles: ["owner", "admin", "staff"],
  billingModel: "none",
  affiliateEnabled: false,
  visibilityRule: "staff_and_admin",
  mvpScope: [
    "auth",
    "tenant",
    "roles",
    "service_crud",
    "reservation_crud",
    "customer_crud",
  ],
  excludedInitialScope: [
    "advanced_analytics",
    "mobile_app",
    "multi_language",
    "calendar_sync",
    "payment_processing",
    "notification_system",
  ],
  stackPreference: "Next.js + Supabase + Stripe",
  priority: "high",
};
