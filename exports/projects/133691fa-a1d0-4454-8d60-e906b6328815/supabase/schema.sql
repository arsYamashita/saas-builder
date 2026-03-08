-- ============================================
-- TENANTS & USERS
-- ============================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  stripe_account_id VARCHAR(255) UNIQUE,
  stripe_account_status VARCHAR(50) DEFAULT 'pending',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_stripe_account ON tenants(stripe_account_id);

-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ============================================

CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(tenant_id, role);

-- ============================================
-- SUBSCRIPTION MANAGEMENT
-- ============================================

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  currency VARCHAR(3) DEFAULT 'USD',
  interval VARCHAR(20) NOT NULL CHECK (interval IN ('month', 'year')),
  stripe_product_id VARCHAR(255) NOT NULL,
  stripe_price_id VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscription_plans_tenant ON subscription_plans(tenant_id);
CREATE INDEX idx_subscription_plans_active ON subscription_plans(tenant_id, is_active);
CREATE INDEX idx_subscription_plans_stripe_price ON subscription_plans(stripe_price_id);

-- ============================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid')),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMP WITH TIME ZONE,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  affiliate_link_id UUID REFERENCES affiliate_links(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(tenant_id, status);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_affiliate ON subscriptions(affiliate_link_id);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

-- ============================================
-- CONTENT MANAGEMENT
-- ============================================

CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  excerpt TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_contents_tenant ON contents(tenant_id);
CREATE INDEX idx_contents_author ON contents(author_id);
CREATE INDEX idx_contents_published ON contents(tenant_id, published_at) WHERE published_at IS NOT NULL;
CREATE INDEX idx_contents_slug ON contents(tenant_id, slug);

-- ============================================

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_content ON comments(content_id, created_at);
CREATE INDEX idx_comments_user ON comments(user_id);

-- ============================================
-- AFFILIATE SYSTEM
-- ============================================

CREATE TABLE affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(100) NOT NULL,
  commission_rate DECIMAL(5, 2) NOT NULL DEFAULT 10.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  total_commission DECIMAL(10, 2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX idx_affiliate_links_tenant ON affiliate_links(tenant_id);
CREATE INDEX idx_affiliate_links_user ON affiliate_links(user_id);
CREATE INDEX idx_affiliate_links_code ON affiliate_links(tenant_id, code);
CREATE INDEX idx_affiliate_links_active ON affiliate_links(tenant_id, is_active);

-- ============================================

CREATE TABLE affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id UUID NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  clicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_affiliate_clicks_link ON affiliate_clicks(affiliate_link_id, clicked_at);

-- ============================================

CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id UUID NOT NULL REFERENCES affiliate_links(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) DEFAULT 'USD',
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(subscription_id)
);

CREATE INDEX idx_commissions_affiliate_link ON commissions(affiliate_link_id);
CREATE INDEX idx_commissions_subscription ON commissions(subscription_id);
CREATE INDEX idx_commissions_status ON commissions(affiliate_link_id, status);

-- ============================================
-- WEBHOOK & EVENT TRACKING
-- ============================================

CREATE TABLE stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_stripe_events_event_id ON stripe_events(stripe_event_id);
CREATE INDEX idx_stripe_events_tenant ON stripe_events(tenant_id);
CREATE INDEX idx_stripe_events_processed ON stripe_events(processed, created_at);
CREATE INDEX idx_stripe_events_type ON stripe_events(event_type);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_tenant_role(p_tenant_id UUID, p_user_id UUID)
RETURNS VARCHAR AS $$
  SELECT role FROM tenant_users
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE POLICY tenant_isolation_policy ON tenants
  FOR ALL
  USING (
    id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY subscription_plans_isolation ON subscription_plans
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY contents_read_policy ON contents
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
    )
    AND (published_at IS NOT NULL OR author_id = auth.uid())
  );

CREATE POLICY contents_write_policy ON contents
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contents_updated_at BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_affiliate_links_updated_at BEFORE UPDATE ON affiliate_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_commissions_updated_at BEFORE UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- MATERIALIZED VIEW FOR ANALYTICS
-- ============================================

CREATE MATERIALIZED VIEW subscription_metrics AS
SELECT
  s.tenant_id,
  COUNT(*) FILTER (WHERE s.status = 'active') as active_subscriptions,
  COUNT(*) FILTER (WHERE s.status = 'trialing') as trial_subscriptions,
  COUNT(*) FILTER (WHERE s.status = 'canceled') as canceled_subscriptions,
  SUM(sp.price) FILTER (WHERE s.status = 'active' AND sp.interval = 'month') as mrr,
  SUM(sp.price / 12) FILTER (WHERE s.status = 'active' AND sp.interval = 'year') as annual_mrr_contribution,
  COUNT(DISTINCT s.user_id) as unique_subscribers
FROM subscriptions s
JOIN subscription_plans sp ON s.plan_id = sp.id
GROUP BY s.tenant_id;

CREATE UNIQUE INDEX idx_subscription_metrics_tenant ON subscription_metrics(tenant_id);

CREATE OR REPLACE FUNCTION refresh_subscription_metrics()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY subscription_metrics;
END;
$$ LANGUAGE plpgsql;