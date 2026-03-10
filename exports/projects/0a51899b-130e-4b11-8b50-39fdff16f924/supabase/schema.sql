-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLES
-- =====================================================

-- Salons (Tenant Root)
CREATE TABLE salons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  settings JSONB DEFAULT '{
    "theme": "default",
    "affiliate_rate": 20,
    "approval_mode": "auto",
    "timezone": "Asia/Tokyo"
  }'::jsonb,
  stripe_account_id VARCHAR(255),
  stripe_account_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_salons_slug ON salons(slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_salons_owner_id ON salons(owner_id);
CREATE INDEX idx_salons_stripe_account_id ON salons(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- Plans
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price INTEGER NOT NULL CHECK (price >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  interval VARCHAR(20) NOT NULL CHECK (interval IN ('month', 'year')),
  stripe_price_id VARCHAR(255),
  stripe_product_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  features JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_salon_id ON plans(salon_id);
CREATE INDEX idx_plans_active ON plans(salon_id, is_active) WHERE is_active = true;
CREATE INDEX idx_plans_stripe_price_id ON plans(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

-- Salon Members (Tenant Membership + Subscription)
CREATE TABLE salon_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  subscription_status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (
    subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid')
  ),
  subscription_id VARCHAR(255),
  customer_id VARCHAR(255),
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  affiliate_code VARCHAR(50) UNIQUE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_salon_user UNIQUE(salon_id, user_id)
);

CREATE INDEX idx_salon_members_salon_id ON salon_members(salon_id);
CREATE INDEX idx_salon_members_user_id ON salon_members(user_id);
CREATE INDEX idx_salon_members_subscription_id ON salon_members(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_salon_members_affiliate_code ON salon_members(affiliate_code) WHERE affiliate_code IS NOT NULL;
CREATE INDEX idx_salon_members_active ON salon_members(salon_id, subscription_status) 
  WHERE subscription_status IN ('active', 'trialing');

-- Content
CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  required_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb,
  slug VARCHAR(255),
  thumbnail_url TEXT,
  excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contents_salon_id ON contents(salon_id);
CREATE INDEX idx_contents_author_id ON contents(author_id);
CREATE INDEX idx_contents_status_published ON contents(salon_id, status, published_at DESC) 
  WHERE status = 'published';
CREATE INDEX idx_contents_required_plan ON contents(required_plan_id) WHERE required_plan_id IS NOT NULL;
CREATE INDEX idx_contents_tags ON contents USING gin(tags);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_content_id ON comments(content_id, created_at DESC);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent ON comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX idx_comments_active ON comments(content_id) WHERE is_deleted = false;

-- Affiliate Conversions
CREATE TABLE affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  referrer_member_id UUID NOT NULL REFERENCES salon_members(id) ON DELETE RESTRICT,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subscription_id VARCHAR(255) NOT NULL,
  commission_amount INTEGER NOT NULL CHECK (commission_amount >= 0),
  commission_rate INTEGER NOT NULL,
  commission_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    commission_status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled')
  ),
  converted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_affiliate_salon_id ON affiliate_conversions(salon_id);
CREATE INDEX idx_affiliate_referrer ON affiliate_conversions(referrer_member_id, commission_status);
CREATE INDEX idx_affiliate_subscription ON affiliate_conversions(subscription_id);
CREATE INDEX idx_affiliate_status ON affiliate_conversions(salon_id, commission_status);

-- Affiliate Clicks (Tracking)
CREATE TABLE affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  referrer_member_id UUID NOT NULL REFERENCES salon_members(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  referrer_url TEXT,
  converted BOOLEAN DEFAULT false,
  conversion_id UUID REFERENCES affiliate_conversions(id) ON DELETE SET NULL
);

CREATE INDEX idx_affiliate_clicks_referrer ON affiliate_clicks(referrer_member_id, clicked_at DESC);
CREATE INDEX idx_affiliate_clicks_salon ON affiliate_clicks(salon_id, clicked_at DESC);
CREATE INDEX idx_affiliate_clicks_conversion ON affiliate_clicks(conversion_id) WHERE conversion_id IS NOT NULL;

-- Webhook Events (Stripe Event Log)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  salon_id UUID REFERENCES salons(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_type ON webhook_events(event_type, processed);
CREATE INDEX idx_webhook_events_salon_id ON webhook_events(salon_id) WHERE salon_id IS NOT NULL;
CREATE INDEX idx_webhook_events_unprocessed ON webhook_events(created_at) WHERE processed = false;

-- Activity Log (Audit Trail)
CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  salon_id UUID REFERENCES salons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_salon ON activity_logs(salon_id, created_at DESC);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);

-- User Profiles (Extended User Data)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  avatar_url TEXT,
  bio TEXT,
  website_url TEXT,
  twitter_handle VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Salons: Members can read their salons, owners can manage
CREATE POLICY "Users can read salons they are members of"
  ON salons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.salon_id = salons.id
        AND salon_members.user_id = auth.uid()
        AND salon_members.left_at IS NULL
    )
  );

CREATE POLICY "Owners can update their salons"
  ON salons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.salon_id = salons.id
        AND salon_members.user_id = auth.uid()
        AND salon_members.role = 'owner'
    )
  );

CREATE POLICY "Authenticated users can create salons"
  ON salons FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Plans: Readable by members, manageable by owners
CREATE POLICY "Members can read plans from their salons"
  ON plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.salon_id = plans.salon_id
        AND salon_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage plans"
  ON plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.salon_id = plans.salon_id
        AND salon_members.user_id = auth.uid()
        AND salon_members.role = 'owner'
    )
  );

-- Salon Members: Read own, owners/admins can manage
CREATE POLICY "Users can read members from their salons"
  ON salon_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salon_members AS sm
      WHERE sm.salon_id = salon_members.salon_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners and admins can manage members"
  ON salon_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM salon_members AS sm
      WHERE sm.salon_id = salon_members.salon_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
  );

-- Contents: Read based on plan tier, write by owner/admin
CREATE POLICY "Members can read published content from their salons"
  ON contents FOR SELECT
  USING (
    status = 'published'
    AND (
      required_plan_id IS NULL
      OR EXISTS (
        SELECT 1 FROM salon_members sm
        LEFT JOIN plans p ON sm.plan_id = p.id
        LEFT JOIN plans required_p ON contents.required_plan_id = required_p.id
        WHERE sm.salon_id = contents.salon_id
          AND sm.user_id = auth.uid()
          AND sm.subscription_status IN ('active', 'trialing')
          AND (p.price >= required_p.price OR sm.role IN ('owner', 'admin'))
      )
    )
  );

CREATE POLICY "Owners and admins can manage content"
  ON contents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.salon_id = contents.salon_id
        AND salon_members.user_id = auth.uid()
        AND salon_members.role IN ('owner', 'admin')
    )
  );

-- Comments: Members can CRUD own, admins can delete any
CREATE POLICY "Members can read comments from accessible content"
  ON comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contents
      JOIN salon_members ON salon_members.salon_id = contents.salon_id
      WHERE contents.id = comments.content_id
        AND salon_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can insert comments on accessible content"
  ON comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM contents
      JOIN salon_members ON salon_members.salon_id = contents.salon_id
      WHERE contents.id = comments.content_id
        AND salon_members.user_id = auth.uid()
        AND salon_members.subscription_status IN ('active', 'trialing')
    )
  );

CREATE POLICY "Users can update their own comments"
  ON comments FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments, admins can delete any"
  ON comments FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM contents c
      JOIN salon_members sm ON sm.salon_id = c.salon_id
      WHERE c.id = comments.content_id
        AND sm.user_id = auth.uid()
        AND sm.role IN ('owner', 'admin')
    )
  );

-- Affiliate Conversions: Referrers can read own, owners can manage
CREATE POLICY "Referrers can read their own conversions"
  ON affiliate_conversions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.id = affiliate_conversions.referrer_member_id
        AND salon_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage all conversions"
  ON affiliate_conversions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM salon_members
      WHERE salon_members.salon_id = affiliate_conversions.salon_id
        AND salon_members.user_id = auth.uid()
        AND salon_members.role = 'owner'
    )
  );

-- User Profiles: Users manage own
CREATE POLICY "Users can read all profiles"
  ON user_profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can manage own profile"
  ON user_profiles FOR ALL
  USING (id = auth.uid());

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER update_salons_updated_at BEFORE UPDATE ON salons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_salon_members_updated_at BEFORE UPDATE ON salon_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contents_updated_at BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generate affiliate code on member insert
CREATE OR REPLACE FUNCTION generate_affiliate_code()
RETURNS TRIGGER AS $
BEGIN
  IF NEW.affiliate_code IS NULL THEN
    NEW.affiliate_code := 'AFF-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER set_affiliate_code BEFORE INSERT ON salon_members
  FOR EACH ROW EXECUTE FUNCTION generate_affiliate_code();

-- Create user profile on signup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $
BEGIN
  INSERT INTO user_profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_user_profile();