-- Performance indexes
CREATE INDEX idx_salons_slug ON salons(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_salons_status ON salons(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_salons_stripe_account ON salons(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(tenant_id, role);

CREATE INDEX idx_plans_tenant ON plans(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_plans_active ON plans(tenant_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_plans_tier ON plans(tenant_id, tier_level) WHERE deleted_at IS NULL;

CREATE INDEX idx_members_tenant ON members(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_members_user ON members(user_id);
CREATE INDEX idx_members_status ON members(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_members_stripe_customer ON members(stripe_customer_id);
CREATE INDEX idx_members_stripe_subscription ON members(stripe_subscription_id);
CREATE INDEX idx_members_referred_by ON members(referred_by) WHERE referred_by IS NOT NULL;
CREATE INDEX idx_members_first_payment ON members(first_payment_at) WHERE first_payment_at IS NOT NULL;

CREATE INDEX idx_subscription_events_tenant ON subscription_events(tenant_id);
CREATE INDEX idx_subscription_events_member ON subscription_events(member_id);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
CREATE INDEX idx_subscription_events_created ON subscription_events(created_at DESC);

CREATE INDEX idx_contents_tenant ON contents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_slug ON contents(tenant_id, slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_status ON contents(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_tier ON contents(tenant_id, required_tier_level) WHERE deleted_at IS NULL;
CREATE INDEX idx_contents_published ON contents(published_at DESC) WHERE status = 'published';

CREATE INDEX idx_content_views_content ON content_views(content_id);
CREATE INDEX idx_content_views_user ON content_views(user_id);
CREATE INDEX idx_content_views_tenant_date ON content_views(tenant_id, viewed_at);

CREATE INDEX idx_comments_content ON comments(content_id) WHERE status = 'published';
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

CREATE INDEX idx_affiliate_profiles_tenant ON affiliate_profiles(tenant_id);
CREATE INDEX idx_affiliate_profiles_user ON affiliate_profiles(user_id);
CREATE INDEX idx_affiliate_profiles_code ON affiliate_profiles(tenant_id, affiliate_code);
CREATE INDEX idx_affiliate_profiles_status ON affiliate_profiles(tenant_id, status);

CREATE INDEX idx_affiliate_clicks_profile ON affiliate_clicks(affiliate_profile_id);
CREATE INDEX idx_affiliate_clicks_clicked_at ON affiliate_clicks(clicked_at DESC);

CREATE INDEX idx_commissions_tenant ON commissions(tenant_id);
CREATE INDEX idx_commissions_affiliate ON commissions(affiliate_profile_id);
CREATE INDEX idx_commissions_member ON commissions(member_id);
CREATE INDEX idx_commissions_status ON commissions(status);
CREATE INDEX idx_commissions_payout ON commissions(payout_id) WHERE payout_id IS NOT NULL;

CREATE INDEX idx_payouts_tenant ON payouts(tenant_id);
CREATE INDEX idx_payouts_affiliate ON payouts(affiliate_profile_id);
CREATE INDEX idx_payouts_status ON payouts(status);

CREATE INDEX idx_platform_invoices_salon ON platform_invoices(salon_id);
CREATE INDEX idx_platform_invoices_stripe ON platform_invoices(stripe_invoice_id);

CREATE INDEX idx_webhook_events_stripe_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX idx_webhook_events_processed ON stripe_webhook_events(processed, created_at);

CREATE INDEX idx_analytics_tenant_date ON analytics_daily_stats(tenant_id, date DESC);
CREATE INDEX idx_analytics_metric ON analytics_daily_stats(tenant_id, metric_type, date DESC);