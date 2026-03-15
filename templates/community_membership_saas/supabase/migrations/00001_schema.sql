-- ============================================================
-- community_membership_saas v1 — Schema Migration
-- ============================================================
--
-- 設計前提:
--   v1 は 1 user = 1 tenant (マルチテナント構造だが移籍は非対応)
--   content visibility: public | members_only | rules_based
--   access rules: plan_based | purchase_based | tag_based (OR 評価)
--   v1 非対応: AND 条件, 否定条件, drip, scheduled release
--
-- ============================================================

-- ────────────────────────────────────────
-- 1. ENUM TYPES
-- ────────────────────────────────────────

CREATE TYPE app_role AS ENUM ('owner', 'admin', 'editor', 'member');
CREATE TYPE membership_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE plan_status AS ENUM ('active', 'inactive', 'draft');
CREATE TYPE content_status AS ENUM ('draft', 'published', 'archived');

-- contents.visibility_mode: コンテンツ自体の公開範囲
CREATE TYPE visibility_mode AS ENUM ('public', 'members_only', 'rules_based');

-- content_access_rules.rule_type: rules_based 時の条件種別
CREATE TYPE access_rule_type AS ENUM ('plan_based', 'purchase_based', 'tag_based');

CREATE TYPE subscription_status AS ENUM (
  'active', 'past_due', 'canceled', 'trialing',
  'incomplete', 'incomplete_expired', 'unpaid', 'paused'
);
CREATE TYPE purchase_status AS ENUM ('pending', 'completed', 'refunded', 'failed');

-- ────────────────────────────────────────
-- 2. TABLES
-- ────────────────────────────────────────

-- 2-1. tenants
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan_type     TEXT NOT NULL DEFAULT 'starter',
  status        TEXT NOT NULL DEFAULT 'active',
  stripe_account_id TEXT,                        -- future: Stripe Connect
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-2. users
--   グローバルプロフィール (auth.users と 1:1)
--   v1 では 1 user = 1 tenant。multi-tenant 移籍は v2 以降。
CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-3. memberships
--   tenant ごとの role / status を管理する。
--   v1 では 1 user に対して最大 1 件の active membership を想定。
CREATE TABLE memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          app_role NOT NULL DEFAULT 'member',
  status        membership_status NOT NULL DEFAULT 'active',
  invited_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- 2-4. membership_plans
CREATE TABLE membership_plans (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  description            TEXT,
  stripe_price_id        TEXT,              -- monthly
  stripe_price_id_yearly TEXT,              -- optional yearly
  price_amount           INTEGER,           -- display price in smallest unit
  currency               TEXT NOT NULL DEFAULT 'jpy',
  features               JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  status                 plan_status NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-5. subscriptions  (Stripe = SoT)
CREATE TABLE subscriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id                 UUID REFERENCES membership_plans(id) ON DELETE SET NULL,
  stripe_subscription_id  TEXT UNIQUE NOT NULL,
  stripe_customer_id      TEXT NOT NULL,
  status                  subscription_status NOT NULL DEFAULT 'active',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
  canceled_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-6. contents
--   visibility_mode で公開範囲を決定:
--     public       → 誰でも (未認証含む)
--     members_only → active member なら全員
--     rules_based  → content_access_rules の OR 評価
CREATE TABLE contents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  body            TEXT,
  excerpt         TEXT,
  cover_image_url TEXT,
  content_type    TEXT NOT NULL DEFAULT 'article',   -- article / video / audio / file
  status          content_status NOT NULL DEFAULT 'draft',
  visibility_mode visibility_mode NOT NULL DEFAULT 'members_only',
  price_amount    INTEGER,                           -- for purchase_based (smallest unit)
  currency        TEXT NOT NULL DEFAULT 'jpy',
  stripe_price_id TEXT,                              -- for purchase_based checkout
  published_at    TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- 2-7. content_access_rules
--   visibility_mode = 'rules_based' のときのみ参照される。
--   同一 content_id に複数行 → OR 評価 (いずれか 1 つ満たせばアクセス可)。
--   rule_type ごとの参照先:
--     plan_based     → plan_id NOT NULL
--     tag_based      → tag_id  NOT NULL
--     purchase_based → purchases テーブルで判定 (plan_id / tag_id 不要)
CREATE TABLE content_access_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  content_id    UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  rule_type     access_rule_type NOT NULL,
  plan_id       UUID REFERENCES membership_plans(id) ON DELETE CASCADE,
  tag_id        UUID,  -- FK added after tags table
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- rule_type と参照先の整合性チェック
  CONSTRAINT chk_rule_plan CHECK (rule_type != 'plan_based'     OR plan_id IS NOT NULL),
  CONSTRAINT chk_rule_tag  CHECK (rule_type != 'tag_based'      OR tag_id  IS NOT NULL),
  CONSTRAINT chk_rule_purchase CHECK (rule_type != 'purchase_based' OR (plan_id IS NULL AND tag_id IS NULL))
);

-- 2-8. purchases  (one-time, Stripe = SoT)
CREATE TABLE purchases (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id                  UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  stripe_payment_intent_id    TEXT UNIQUE,
  stripe_checkout_session_id  TEXT,
  amount                      INTEGER NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'jpy',
  status                      purchase_status NOT NULL DEFAULT 'pending',
  purchased_at                TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-9. tags
CREATE TABLE tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  color         TEXT,   -- hex e.g. '#3B82F6'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- 2-10. user_tags
CREATE TABLE user_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id        UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (tenant_id, user_id, tag_id)
);

-- FK: content_access_rules.tag_id → tags
ALTER TABLE content_access_rules
  ADD CONSTRAINT fk_content_access_rules_tag
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

-- 2-11. audit_logs  (immutable, service_role insert only)
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT NOT NULL,
  before_json     JSONB,
  after_json      JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────
-- 3. INDEXES
-- ────────────────────────────────────────

CREATE INDEX idx_memberships_tenant   ON memberships(tenant_id);
CREATE INDEX idx_memberships_user     ON memberships(user_id);
CREATE INDEX idx_memberships_active   ON memberships(tenant_id, user_id) WHERE status = 'active';

CREATE INDEX idx_plans_tenant         ON membership_plans(tenant_id);
CREATE INDEX idx_plans_stripe         ON membership_plans(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

CREATE INDEX idx_subs_tenant          ON subscriptions(tenant_id);
CREATE INDEX idx_subs_user            ON subscriptions(user_id);
CREATE INDEX idx_subs_stripe          ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subs_customer        ON subscriptions(stripe_customer_id);

CREATE INDEX idx_contents_tenant      ON contents(tenant_id);
CREATE INDEX idx_contents_published   ON contents(tenant_id, status, visibility_mode) WHERE status = 'published';
CREATE INDEX idx_contents_slug        ON contents(tenant_id, slug);

CREATE INDEX idx_car_content          ON content_access_rules(content_id);
CREATE INDEX idx_car_tenant           ON content_access_rules(tenant_id);
CREATE INDEX idx_car_plan             ON content_access_rules(plan_id)  WHERE plan_id IS NOT NULL;
CREATE INDEX idx_car_tag              ON content_access_rules(tag_id)   WHERE tag_id IS NOT NULL;

CREATE INDEX idx_purchases_tenant     ON purchases(tenant_id);
CREATE INDEX idx_purchases_user       ON purchases(user_id);
CREATE INDEX idx_purchases_content    ON purchases(content_id);
CREATE INDEX idx_purchases_stripe     ON purchases(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX idx_tags_tenant          ON tags(tenant_id);
CREATE INDEX idx_utags_tenant         ON user_tags(tenant_id);
CREATE INDEX idx_utags_user           ON user_tags(user_id);
CREATE INDEX idx_utags_tag            ON user_tags(tag_id);

CREATE INDEX idx_audit_tenant         ON audit_logs(tenant_id);
CREATE INDEX idx_audit_resource       ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created        ON audit_logs(created_at DESC);

-- ────────────────────────────────────────
-- 4. TRIGGERS — updated_at auto-update
-- ────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated       BEFORE UPDATE ON tenants          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_users_updated         BEFORE UPDATE ON users            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_plans_updated         BEFORE UPDATE ON membership_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_contents_updated      BEFORE UPDATE ON contents         FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_purchases_updated     BEFORE UPDATE ON purchases        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
