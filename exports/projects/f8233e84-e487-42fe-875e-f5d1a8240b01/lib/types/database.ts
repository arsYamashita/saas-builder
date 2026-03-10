export type SalonStatus = 'active' | 'suspended' | 'cancelled';
export type PlatformPlan = 'starter' | 'growth' | 'pro';
export type UserRole = 'owner' | 'admin' | 'member';
export type SubscriptionInterval = 'month' | 'year';
export type MemberStatus = 'active' | 'suspended' | 'cancelled' | 'pending' | 'past_due';
export type SubscriptionEventType = 'created' | 'updated' | 'cancelled' | 'renewed' | 'payment_succeeded' | 'payment_failed' | 'refunded';
export type ContentType = 'article' | 'video' | 'file';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type CommentStatus = 'published' | 'hidden' | 'deleted';
export type AffiliateStatus = 'pending' | 'active' | 'suspended' | 'rejected';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled' | 'clawed_back';
export type PayoutMethod = 'bank_transfer' | 'paypal' | 'manual';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
export type AccountType = 'platform' | 'connect';
export type MetricType = 'members' | 'revenue' | 'content_views' | 'affiliate_clicks' | 'affiliate_conversions';

export interface Salon {
  id: string;
  slug: string;
  name: string;
  stripe_account_id: string | null;
  stripe_connect_onboarded: boolean;
  status: SalonStatus;
  platform_plan: PlatformPlan;
  platform_stripe_subscription_id: string | null;
  member_limit: number;
  current_member_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  stripe_price_id: string;
  stripe_product_id: string;
  price: number;
  interval: SubscriptionInterval;
  tier_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Member {
  id: string;
  tenant_id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  current_plan_id: string | null;
  status: MemberStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  referred_by: string | null;
  referral_cookie_attributed_at: string | null;
  first_payment_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SubscriptionEvent {
  id: string;
  tenant_id: string;
  member_id: string;
  event_type: SubscriptionEventType;
  stripe_event_id: string;
  plan_id: string | null;
  amount: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface Content {
  id: string;
  tenant_id: string;
  author_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  content_type: ContentType;
  media_url: string | null;
  required_tier_level: number;
  status: ContentStatus;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ContentView {
  id: string;
  tenant_id: string;
  content_id: string;
  user_id: string;
  viewed_at: string;
  view_duration_seconds: number | null;
}

export interface Comment {
  id: string;
  tenant_id: string;
  content_id: string;
  user_id: string;
  body: string;
  parent_comment_id: string | null;
  status: CommentStatus;
  created_at: string;
  updated_at: string;
}

export interface AffiliateProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  affiliate_code: string;
  commission_rate: number;
  status: AffiliateStatus;
  total_conversions: number;
  total_clicks: number;
  commission_balance: number;
  total_commission_earned: number;
  total_commission_paid: number;
  bank_account_details: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliateClick {
  id: string;
  tenant_id: string;
  affiliate_profile_id: string;
  visitor_fingerprint: string | null;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  clicked_at: string;
}

export interface Commission {
  id: string;
  tenant_id: string;
  affiliate_profile_id: string;
  member_id: string;
  subscription_event_id: string | null;
  amount: number;
  commission_rate: number;
  base_amount: number;
  status: CommissionStatus;
  clawback_reason: string | null;
  clawback_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payout_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payout {
  id: string;
  tenant_id: string;
  affiliate_profile_id: string;
  amount: number;
  commission_count: number;
  payout_method: PayoutMethod;
  status: PayoutStatus;
  reference_number: string | null;
  notes: string | null;
  requested_at: string;
  processed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformInvoice {
  id: string;
  salon_id: string;
  stripe_invoice_id: string;
  stripe_subscription_id: string;
  amount: number;
  status: InvoiceStatus;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  created_at: string;
}

export interface StripeWebhookEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  account_type: AccountType;
  stripe_account_id: string | null;
  payload: Record<string, any>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
}

export interface AnalyticsDailyStat {
  id: string;
  tenant_id: string;
  date: string;
  metric_type: MetricType;
  value: number;
  metadata: Record<string, any> | null;
  created_at: string;
}