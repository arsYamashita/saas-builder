// ============================================================
// community_membership_saas v2 — Database Types
// ============================================================
// Migration SQL と 1:1 対応。Supabase codegen の代替。
// v1: 00001 + 00002 (schema + RLS)
// v2: 00003 (forum) + 00004 (classroom) + 00005 (gamification) + 00006 (member_mgmt)
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

// v2 enums
export type ReactionTargetType = "post" | "comment";
export type PointEventType =
  | "like_received"
  | "post_created"
  | "comment_created"
  | "lesson_completed"
  | "admin_adjustment";
export type JoinMode = "open" | "invite_only" | "application";
export type ApplicationStatus = "pending" | "approved" | "rejected";

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

// ─── v1 Row Types ───

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan_type: string;
  status: string;
  stripe_account_id: string | null;
  join_mode: JoinMode;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  headline: string | null;
  social_links: Record<string, string> | null;
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

// ─── v2 Row Types: Forum (00003) ───

export type Category = {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  emoji: string | null;
  created_at: string;
};

/** ProseMirror JSON document format */
export type RichTextBody = Record<string, unknown>;

export type Post = {
  id: string;
  tenant_id: string;
  category_id: string;
  author_id: string;
  title: string;
  body: RichTextBody;
  is_pinned: boolean;
  is_locked: boolean;
  like_count: number;
  comment_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Comment = {
  id: string;
  tenant_id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  body: RichTextBody;
  like_count: number;
  created_at: string;
  updated_at: string;
};

export type Reaction = {
  id: string;
  tenant_id: string;
  user_id: string;
  target_type: ReactionTargetType;
  target_id: string;
  reaction_type: string;
  created_at: string;
};

// ─── v2 Row Types: Classroom (00004) ───

export type Course = {
  id: string;
  tenant_id: string;
  title: string;
  slug: string;
  description: string | null;
  cover_image_url: string | null;
  status: ContentStatus;
  visibility_mode: VisibilityMode;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseModule = {
  id: string;
  course_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type CourseLesson = {
  id: string;
  module_id: string;
  tenant_id: string;
  title: string;
  slug: string;
  body: RichTextBody | null;
  video_url: string | null;
  video_duration_seconds: number | null;
  transcript: string | null;
  sort_order: number;
  is_preview: boolean;
  drip_days: number | null;
  unlock_level: number | null;
  created_at: string;
  updated_at: string;
};

export type CourseAccessRule = {
  id: string;
  tenant_id: string;
  course_id: string;
  rule_type: AccessRuleType;
  plan_id: string | null;
  tag_id: string | null;
  created_at: string;
};

export type UserLessonProgress = {
  id: string;
  tenant_id: string;
  user_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  last_position_seconds: number | null;
  created_at: string;
  updated_at: string;
};

// ─── v2 Row Types: Gamification (00005) ───

export type MemberPoints = {
  id: string;
  tenant_id: string;
  user_id: string;
  total_points: number;
  level: number;
  updated_at: string;
};

export type PointEvent = {
  id: string;
  tenant_id: string;
  user_id: string;
  event_type: PointEventType;
  points: number;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
};

export type LevelConfig = {
  tenant_id: string;
  level: number;
  name: string;
  min_points: number;
  rewards: { unlock_course_ids?: string[] } | null;
};

// ─── v2 Row Types: Member Management (00006) ───

export type Invite = {
  id: string;
  tenant_id: string;
  token: string;
  invited_email: string | null;
  invited_role: AppRole;
  created_by: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  max_uses: number | null;
  use_count: number;
  created_at: string;
};

export type MembershipQuestion = {
  id: string;
  tenant_id: string;
  question_text: string;
  is_required: boolean;
  sort_order: number;
  created_at: string;
};

export type MembershipApplication = {
  id: string;
  tenant_id: string;
  user_id: string;
  status: ApplicationStatus;
  answers: { question_id: string; answer: string }[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

// ─── Skool-compatible Level Thresholds ───

export const DEFAULT_LEVEL_THRESHOLDS: { level: number; name: string; min_points: number }[] = [
  { level: 1, name: "Newcomer", min_points: 0 },
  { level: 2, name: "Active", min_points: 5 },
  { level: 3, name: "Contributor", min_points: 20 },
  { level: 4, name: "Regular", min_points: 65 },
  { level: 5, name: "Enthusiast", min_points: 155 },
  { level: 6, name: "Expert", min_points: 515 },
  { level: 7, name: "Leader", min_points: 2015 },
  { level: 8, name: "Legend", min_points: 8015 },
  { level: 9, name: "Champion", min_points: 33015 },
];
