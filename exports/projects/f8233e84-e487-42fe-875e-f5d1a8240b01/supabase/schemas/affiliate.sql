-- ============================================
-- AFFILIATE SYSTEM
-- ============================================

CREATE TABLE affiliate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.2000,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
  total_conversions INTEGER NOT NULL DEFAULT 0,
  total_clicks INTEGER NOT NULL DEFAULT 0,
  commission_balance BIGINT NOT NULL DEFAULT 0,
  total_commission_earned BIGINT NOT NULL DEFAULT 0,
  total_commission_paid BIGINT NOT NULL DEFAULT 0,
  bank_account_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id),
  UNIQUE(tenant_id, affiliate_code),
  CHECK(commission_rate >= 0 AND commission_rate <= 1)
);

CREATE TABLE affiliate_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  affiliate_profile_id UUID NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  visitor_fingerprint TEXT,
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  affiliate_profile_id UUID NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  subscription_event_id UUID REFERENCES subscription_events(id) ON DELETE SET NULL,
  amount BIGINT NOT NULL,
  commission_rate DECIMAL(5,4) NOT NULL,
  base_amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'cancelled', 'clawed_back')),
  clawback_reason TEXT,
  clawback_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payout_id UUID REFERENCES payouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(amount >= 0)
);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  affiliate_profile_id UUID NOT NULL REFERENCES affiliate_profiles(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  commission_count INTEGER NOT NULL,
  payout_method TEXT NOT NULL CHECK (payout_method IN ('bank_transfer', 'paypal', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reference_number TEXT,
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);