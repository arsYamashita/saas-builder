// ============================================================
// community_membership_saas v1 — Database Types
// ============================================================
// Migration SQL と 1:1 対応。Supabase codegen の代替。
// ============================================================

// ─── Enums ───

export type AppRole = "owner" | "admin" | "editor" | "member";
export type MembershipStatus = "active" | "inactive" | "suspended";
export type PlanStatus = "active" | "inactive" | "draft";
export type ContentStatus = "draft" | "published" | "archived";
export type VisibilityMode = "public" | "members_only" | "rules_based";
export type AccessRuleType = "plan_based" | "purchase_based" | "tag_based";
export type SubscriptionStatus =
  | "active"
  | "past_due"
  | "canceled"
  | "trialing"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";
export type PurchaseStatus = "pending" | "completed" | "refunded" | "failed";

// ─── Role Priority ───

export const ROLE_PRIORITY: Record<AppRole, number> = {
  owner: 100,
  admin: 80,
  editor: 60,
  member: 10,
};

export function hasRequiredRole(
  userRole: AppRole,
  requiredRole: AppRole
): boolean {
  return ROLE_PRIORITY[userRole] >= ROLE_PRIORITY[requiredRole];
}

// ─── Row Types ───

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan_type: string;
  status: string;
  stripe_account_id: string | null;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Membership = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: AppRole;
  status: MembershipStatus;
  joined_at: string;
};

export type MembershipPlan = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  stripe_price_id: string | null;
  stripe_price_id_yearly: string | null;
  price_amount: number | null;
  currency: string;
  features: string[];
  sort_order: number;
  status: PlanStatus;
  created_at: string;
  updated_at: string;
};

export type Subscription = {
  id: string;
  tenant_id: string;
  user_id: string;
  plan_id: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Content = {
  id: string;
  tenant_id: string;
  title: string;
  slug: string;
  body: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  content_type: string;
  status: ContentStatus;
  visibility_mode: VisibilityMode;
  price_amount: number | null;
  currency: string;
  stripe_price_id: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentAccessRule = {
  id: string;
  tenant_id: string;
  content_id: string;
  rule_type: AccessRuleType;
  plan_id: string | null;
  tag_id: string | null;
  created_at: string;
};

export type Purchase = {
  id: string;
  tenant_id: string;
  user_id: string;
  content_id: string;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount: number;
  currency: string;
  status: PurchaseStatus;
  purchased_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  created_at: string;
};

export type UserTag = {
  id: string;
  tenant_id: string;
  user_id: string;
  tag_id: string;
  assigned_at: string;
  assigned_by: string | null;
};

export type AuditLog = {
  id: string;
  tenant_id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  before_json: unknown;
  after_json: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};
