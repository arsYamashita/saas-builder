export type TenantStatus = 'active' | 'suspended' | 'canceled';
export type TenantUserRole = 'owner' | 'admin' | 'member';
export type TenantUserStatus = 'active' | 'suspended' | 'removed';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused' | 'expired';
export type ContentStatus = 'draft' | 'published' | 'archived';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'canceled';
export type PayoutRequestStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';
export type PlanInterval = 'month' | 'year';

export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  owner_id: string;
  stripe_account_id: string | null;
  status: TenantStatus;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantUserRole;
  status: TenantUserStatus;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  stripe_product_id: string;
  stripe_price_id: string;
  amount: number;
  currency: string;
  interval: PlanInterval;
  commission_rate: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  user_id: string;
  plan_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface StripeEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  tenant_id: string | null;
  processed: boolean;
  payload: Record<string, any>;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface Content {
  id: string;
  tenant_id: string;
  author_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string | null;
  status: ContentStatus;
  published_at: string | null;
  view_count: number;
  comment_count: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  tenant_id: string;
  content_id: string;
  user_id: string;
  body: string;
  is_edited: boolean;
  is_deleted: boolean;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentAccessRule {
  id: string;
  tenant_id: string;
  content_id: string;
  plan_id: string | null;
  is_public: boolean;
  created_at: string;
}

export interface AffiliateCode {
  id: string;
  tenant_id: string;
  user_id: string;
  code: string;
  is_active: boolean;
  click_count: number;
  conversion_count: number;
  total_commission: number;
  created_at: string;
  updated_at: string;
}

export interface AffiliateClick {
  id: string;
  tenant_id: string;
  affiliate_code_id: string;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
  landing_page: string | null;
  session_id: string | null;
  clicked_at: string;
}

export interface AffiliateConversion {
  id: string;
  tenant_id: string;
  affiliate_code_id: string;
  affiliate_user_id: string;
  referred_user_id: string;
  subscription_id: string;
  plan_id: string;
  click_id: string | null;
  converted_at: string;
  created_at: string;
}

export interface Commission {
  id: string;
  tenant_id: string;
  affiliate_user_id: string;
  conversion_id: string;
  plan_id: string;
  subscription_amount: number;
  commission_rate: number;
  amount: number;
  status: CommissionStatus;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  payment_method: string | null;
  payment_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutRequest {
  id: string;
  tenant_id: string;
  affiliate_user_id: string;
  amount: number;
  commission_ids: string[];
  status: PayoutRequestStatus;
  bank_info: Record<string, any>;
  approved_by: string | null;
  approved_at: string | null;
  completed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  changes: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}