-- Enable RLS
ALTER TABLE salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily_stats ENABLE ROW LEVEL SECURITY;

-- Salons: Users can only access salons they belong to
CREATE POLICY salon_isolation ON salons
  FOR ALL
  USING (
    id IN (
      SELECT tenant_id FROM tenant_users 
      WHERE user_id = auth.uid()
    )
  );

-- Tenant Users: Users can see members of their salons
CREATE POLICY tenant_user_isolation ON tenant_users
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users 
      WHERE user_id = auth.uid()
    )
  );

-- Plans: Scoped to tenant
CREATE POLICY plan_isolation ON plans
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users 
      WHERE user_id = auth.uid()
    )
  );

-- Members: Scoped to tenant
CREATE POLICY member_isolation ON members
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users 
      WHERE user_id = auth.uid()
    )
  );

-- Contents: Read based on tier, write based on role
CREATE POLICY content_read ON contents
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT m.tenant_id FROM members m
      JOIN plans p ON m.current_plan_id = p.id
      WHERE m.user_id = auth.uid()
        AND m.status = 'active'
        AND p.tier_level >= contents.required_tier_level
        AND contents.status = 'published'
    )
    OR
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY content_write ON contents
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY content_update ON contents
  FOR UPDATE
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Affiliate Profiles: Users can see their own and salon owners can see all
CREATE POLICY affiliate_profile_isolation ON affiliate_profiles
  FOR ALL
  USING (
    user_id = auth.uid()
    OR
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- Commissions: Affiliates see their own, owners see all
CREATE POLICY commission_isolation ON commissions
  FOR ALL
  USING (
    affiliate_profile_id IN (
      SELECT id FROM affiliate_profiles WHERE user_id = auth.uid()
    )
    OR
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid()
        AND role = 'owner'
    )
  );