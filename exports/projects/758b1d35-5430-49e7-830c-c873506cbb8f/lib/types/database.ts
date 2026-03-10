export type SubscriptionStatus = 'active' | 'past_due' | 'canceled';
export type PlanType = 'starter' | 'growth' | 'enterprise';
export type UserRole = 'owner' | 'admin' | 'member';
export type SubscriptionInterval = 'monthly' | 'yearly';
export type MemberSubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing' | 'unpaid';
export type ContentType = 'post' | 'video' | 'document';
export type ContentStatus = 'draft' | 'published';
export type ConversionStatus = 'pending' | 'paid';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  stripe_customer_id: string | null;
  subscription_status: SubscriptionStatus;
  plan_type: PlanType;
  commission_rate: number;
  branding_logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  tenant_id: string;
  role: UserRole;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  price: number;
  interval: SubscriptionInterval;
  stripe_price_id: string;
  stripe_product_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tenant_id: string;
  plan_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  status: MemberSubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface Content {
  id: string;
  tenant_id: string;
  author_id: string | null;
  title: string;
  body: string;
  content_type: ContentType;
  status: ContentStatus;
  published_at: string | null;
  cover_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  content_id: string;
  user_id: string;
  tenant_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface AffiliateLink {
  id: string;
  user_id: string;
  tenant_id: string;
  code: string;
  clicks: number;
  created_at: string;
}

export interface AffiliateConversion {
  id: string;
  affiliate_link_id: string;
  subscription_id: string;
  tenant_id: string;
  commission_amount: number;
  status: ConversionStatus;
  converted_at: string;
  paid_at: string | null;
  created_at: string;
}

export interface AffiliateClick {
  id: string;
  affiliate_link_id: string;
  tenant_id: string;
  visitor_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  referer: string | null;
  clicked_at: string;
  expires_at: string;
}

export interface StripeWebhookEvent {
  id: string;
  stripe_event_id: string;
  event_type: string;
  payload: Record<string, any>;
  processed: boolean;
  processing_error: string | null;
  received_at: string;
  processed_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Tenant, 'id' | 'created_at' | 'updated_at'>>;
      };
      user_roles: {
        Row: UserRole;
        Insert: Omit<UserRole, 'id' | 'created_at'>;
        Update: Partial<Omit<UserRole, 'id' | 'created_at'>>;
      };
      subscription_plans: {
        Row: SubscriptionPlan;
        Insert: Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Subscription, 'id' | 'created_at' | 'updated_at'>>;
      };
      contents: {
        Row: Content;
        Insert: Omit<Content, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Content, 'id' | 'created_at' | 'updated_at'>>;
      };
      comments: {
        Row: Comment;
        Insert: Omit<Comment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Comment, 'id' | 'created_at' | 'updated_at'>>;
      };
      affiliate_links: {
        Row: AffiliateLink;
        Insert: Omit<AffiliateLink, 'id' | 'created_at'>;
        Update: Partial<Omit<AffiliateLink, 'id' | 'created_at'>>;
      };
      affiliate_conversions: {
        Row: AffiliateConversion;
        Insert: Omit<AffiliateConversion, 'id' | 'created_at'>;
        Update: Partial<Omit<AffiliateConversion, 'id' | 'created_at'>>;
      };
      affiliate_clicks: {
        Row: AffiliateClick;
        Insert: Omit<AffiliateClick, 'id'>;
        Update: Partial<Omit<AffiliateClick, 'id'>>;
      };
      stripe_webhook_events: {
        Row: StripeWebhookEvent;
        Insert: Omit<StripeWebhookEvent, 'id'>;
        Update: Partial<Omit<StripeWebhookEvent, 'id'>>;
      };
    };
  };
}