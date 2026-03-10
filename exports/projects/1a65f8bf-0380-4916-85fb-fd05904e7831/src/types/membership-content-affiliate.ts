export type TenantRole = 'owner' | 'admin' | 'member';

export type SubscriptionStatus = 
  | 'active' 
  | 'canceled' 
  | 'past_due' 
  | 'trialing' 
  | 'incomplete' 
  | 'incomplete_expired' 
  | 'unpaid';

export type ContentStatus = 'draft' | 'published' | 'archived';

export type AffiliateConversionStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export type BillingInterval = 'month' | 'year';

export type PlatformPlanTier = 'starter' | 'growth' | 'pro';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  stripe_account_id: string | null;
  affiliate_commission_rate: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  billing_interval: BillingInterval;
  stripe_price_id: string;
  stripe_product_id: string;
  is_active: boolean;
  trial_days: number;
  features: string[];
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  user_id: string;
  plan_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionEvent {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  stripe_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
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
  status: ContentStatus;
  allowed_plan_ids: string[];
  attachment_urls: string[];
  published_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface ContentView {
  id: string;
  tenant_id: string;
  content_id: string;
  user_id: string;
  viewed_at: string;
}

export interface AffiliateLink {
  id: string;
  tenant_id: string;
  user_id: string;
  referral_code: string;
  is_active: boolean;
  click_count: number;
  created_at: string;
  updated_at: string;
}

export interface AffiliateClick {
  id: string;
  tenant_id: string;
  affiliate_link_id: string;
  clicked_at: string;
  ip_address: string | null;
  user_agent: string | null;
  referrer: string | null;
}

export interface AffiliateConversion {
  id: string;
  tenant_id: string;
  affiliate_link_id: string;
  referred_user_id: string;
  subscription_id: string;
  commission_rate: number;
  commission_amount: number;
  status: AffiliateConversionStatus;
  converted_at: string;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSubscription {
  id: string;
  tenant_id: string;
  plan_tier: PlatformPlanTier;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: string;
  member_limit: number;
  current_period_end: string;
  created_at: string;
  updated_at: string;
}