-- ============================================================
-- community_membership_saas v2 — Member Management Migration
-- ============================================================
--
-- 追加テーブル:
--   invites                 — 招待リンク / メール招待
--   membership_questions    — 入会審査用の質問
--   membership_applications — 入会申請 (審査モード時)
--
-- 既存テーブル変更:
--   users   — bio, headline, social_links を追加
--   tenants — join_mode を追加 (open / invite_only / application)
--
-- ============================================================

-- ────────────────────────────────────────
-- 1. ALTER EXISTING TABLES
-- ────────────────────────────────────────

-- users: プロフィール拡張
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS headline     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_links JSONB;

-- tenants: 参加方式の設定
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS join_mode TEXT NOT NULL DEFAULT 'open'
  CHECK (join_mode IN ('open', 'invite_only', 'application'));

-- ────────────────────────────────────────
-- 2. NEW TABLES
-- ────────────────────────────────────────

-- 2-1. invites
--   招待トークンによるメンバー招待。
--   invited_email が NULL の場合はオープンリンク招待 (誰でも使える)。
--   max_uses が NULL の場合は無制限。
CREATE TABLE invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token           TEXT UNIQUE NOT NULL,
  invited_email   TEXT,
  invited_role    app_role NOT NULL DEFAULT 'member',
  created_by      UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  accepted_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  max_uses        INTEGER,
  use_count       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- max_uses が設定されている場合、use_count が超過しないことを保証
  CONSTRAINT chk_invites_use_count CHECK (max_uses IS NULL OR use_count <= max_uses)
);

-- 2-2. membership_questions
--   入会審査モード (join_mode = 'application') 時に申請者へ表示する質問。
--   sort_order で表示順を制御。
CREATE TABLE membership_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question_text   TEXT NOT NULL,
  is_required     BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-3. membership_applications
--   入会申請レコード。answers は [{question_id, answer}] 形式の JSONB。
--   status: pending → approved / rejected
CREATE TABLE membership_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  answers         JSONB NOT NULL,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────
-- 3. INDEXES
-- ────────────────────────────────────────

-- invites
CREATE INDEX idx_invites_tenant          ON invites(tenant_id);
CREATE INDEX idx_invites_tenant_expires  ON invites(tenant_id, expires_at);
CREATE INDEX idx_invites_email           ON invites(invited_email) WHERE invited_email IS NOT NULL;

-- membership_questions
CREATE INDEX idx_mq_tenant_sort         ON membership_questions(tenant_id, sort_order);

-- membership_applications
CREATE INDEX idx_ma_tenant_status       ON membership_applications(tenant_id, status);
CREATE INDEX idx_ma_user                ON membership_applications(user_id);

-- ────────────────────────────────────────
-- 4. ENABLE RLS
-- ────────────────────────────────────────

ALTER TABLE invites                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_questions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_applications  ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────
-- 5. RLS POLICIES
-- ────────────────────────────────────────
-- 命名規則: {table}_{operation}_{scope}
-- has_role / is_tenant_member は 00002_rls.sql で定義済み

-- ─── invites ───
-- SELECT: admin 以上
CREATE POLICY invites_select_admin ON invites
  FOR SELECT USING (has_role(tenant_id, 'admin'));

-- INSERT: admin 以上
CREATE POLICY invites_insert_admin ON invites
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

-- UPDATE (accept): 認証済みユーザー (トークンで検索して受諾する)
CREATE POLICY invites_update_authenticated ON invites
  FOR UPDATE USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: admin 以上
CREATE POLICY invites_delete_admin ON invites
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── membership_questions ───
-- SELECT: 認証済みユーザー全員 (申請フォーム表示に必要)
CREATE POLICY mq_select_authenticated ON membership_questions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- INSERT: admin 以上
CREATE POLICY mq_insert_admin ON membership_questions
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

-- UPDATE: admin 以上
CREATE POLICY mq_update_admin ON membership_questions
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

-- DELETE: admin 以上
CREATE POLICY mq_delete_admin ON membership_questions
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── membership_applications ───
-- SELECT: 自分の申請 + admin 以上は tenant 全件
CREATE POLICY ma_select_own ON membership_applications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY ma_select_admin ON membership_applications
  FOR SELECT USING (has_role(tenant_id, 'admin'));

-- INSERT: 認証済みユーザー (申請する本人)
CREATE POLICY ma_insert_authenticated ON membership_applications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE (審査): admin 以上
CREATE POLICY ma_update_admin ON membership_applications
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));
