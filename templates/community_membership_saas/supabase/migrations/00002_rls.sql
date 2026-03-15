-- ============================================================
-- community_membership_saas v1 — RLS Policies
-- ============================================================
-- 設計方針:
--   1. API routes は createAdminClient() (service_role) を使用 → RLS bypass
--   2. RLS は defense-in-depth: クライアント直接アクセスに対する安全弁
--   3. tenant 分離を最優先 (cross-tenant read を完全遮断)
--   4. content access control の細粒度判定は API 層で実施
--      RLS では「tenant member なら published は読める」レベルに留める
-- ============================================================

-- ────────────────────────────────────────
-- 1. HELPER FUNCTIONS
-- ────────────────────────────────────────

-- 現在ユーザーが指定 tenant の active メンバーかどうか
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM memberships
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 現在ユーザーの role が required 以上かどうか
-- priority: owner(100) > admin(80) > editor(60) > member(10)
CREATE OR REPLACE FUNCTION has_role(p_tenant_id UUID, p_required app_role)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_priority INTEGER;
  v_required_priority INTEGER;
BEGIN
  SELECT CASE role
    WHEN 'owner'  THEN 100
    WHEN 'admin'  THEN 80
    WHEN 'editor' THEN 60
    WHEN 'member' THEN 10
    ELSE 0
  END INTO v_user_priority
  FROM memberships
  WHERE tenant_id = p_tenant_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_user_priority IS NULL THEN RETURN false; END IF;

  v_required_priority := CASE p_required
    WHEN 'owner'  THEN 100
    WHEN 'admin'  THEN 80
    WHEN 'editor' THEN 60
    WHEN 'member' THEN 10
    ELSE 0
  END;

  RETURN v_user_priority >= v_required_priority;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ────────────────────────────────────────
-- 2. ENABLE RLS
-- ────────────────────────────────────────

ALTER TABLE tenants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships          ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_plans     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contents             ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_access_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs           ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────
-- 3. POLICIES
-- ────────────────────────────────────────
-- 命名規則: {table}_{operation}_{scope}
--   operation: select / insert / update / delete
--   scope: own / member / admin / editor / public

-- ─── tenants ───
-- SELECT: 所属メンバーのみ
CREATE POLICY tenants_select_member ON tenants
  FOR SELECT USING (is_tenant_member(id));

-- UPDATE: owner のみ
CREATE POLICY tenants_update_owner ON tenants
  FOR UPDATE USING (has_role(id, 'owner'))
  WITH CHECK (has_role(id, 'owner'));

-- INSERT/DELETE: service_role のみ (RLS bypass)

-- ─── users ───
-- SELECT: 自分自身 + 同一 tenant のメンバー
CREATE POLICY users_select_own ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY users_select_tenant ON users
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM memberships m1
      JOIN memberships m2 ON m1.tenant_id = m2.tenant_id
      WHERE m1.user_id = auth.uid() AND m1.status = 'active'
        AND m2.user_id = users.id   AND m2.status = 'active'
    )
  );

-- UPDATE: 自分自身のみ
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─── memberships ───
-- SELECT: 同一 tenant メンバー
CREATE POLICY memberships_select_member ON memberships
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: admin 以上
CREATE POLICY memberships_insert_admin ON memberships
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

-- UPDATE: admin 以上 (role escalation は API 層でガード)
CREATE POLICY memberships_update_admin ON memberships
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

-- DELETE: admin 以上
CREATE POLICY memberships_delete_admin ON memberships
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── membership_plans ───
-- SELECT: active プランは誰でも (公開料金ページ用) + tenant メンバーは全件
CREATE POLICY plans_select_public ON membership_plans
  FOR SELECT USING (status = 'active');

CREATE POLICY plans_select_member ON membership_plans
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT/UPDATE/DELETE: admin 以上
CREATE POLICY plans_insert_admin ON membership_plans
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY plans_update_admin ON membership_plans
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY plans_delete_admin ON membership_plans
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── subscriptions ───
-- SELECT: 自分の subscription + admin 以上は tenant 全件
CREATE POLICY subs_select_own ON subscriptions
  FOR SELECT USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE POLICY subs_select_admin ON subscriptions
  FOR SELECT USING (has_role(tenant_id, 'admin'));

-- INSERT/UPDATE/DELETE: service_role のみ (Stripe webhook 経由)

-- ─── contents ───
-- SELECT:
--   公開 published → 誰でも (未認証含む)
--   members_only published → tenant メンバー
--   plan/purchase/tag_based published → tenant メンバー (細粒度は API 層)
--   draft/archived → editor 以上
CREATE POLICY contents_select_public ON contents
  FOR SELECT USING (status = 'published' AND visibility_mode = 'public');

CREATE POLICY contents_select_member ON contents
  FOR SELECT USING (
    status = 'published'
    AND visibility_mode IN ('members_only', 'rules_based')
    AND is_tenant_member(tenant_id)
  );

CREATE POLICY contents_select_editor ON contents
  FOR SELECT USING (has_role(tenant_id, 'editor'));

-- INSERT/UPDATE/DELETE: editor 以上
CREATE POLICY contents_insert_editor ON contents
  FOR INSERT WITH CHECK (has_role(tenant_id, 'editor'));

CREATE POLICY contents_update_editor ON contents
  FOR UPDATE USING (has_role(tenant_id, 'editor'))
  WITH CHECK (has_role(tenant_id, 'editor'));

CREATE POLICY contents_delete_editor ON contents
  FOR DELETE USING (has_role(tenant_id, 'editor'));

-- ─── content_access_rules ───
-- SELECT/INSERT/UPDATE/DELETE: editor 以上
CREATE POLICY car_select_editor ON content_access_rules
  FOR SELECT USING (has_role(tenant_id, 'editor'));

CREATE POLICY car_insert_editor ON content_access_rules
  FOR INSERT WITH CHECK (has_role(tenant_id, 'editor'));

CREATE POLICY car_update_editor ON content_access_rules
  FOR UPDATE USING (has_role(tenant_id, 'editor'))
  WITH CHECK (has_role(tenant_id, 'editor'));

CREATE POLICY car_delete_editor ON content_access_rules
  FOR DELETE USING (has_role(tenant_id, 'editor'));

-- ─── purchases ───
-- SELECT: 自分の購入 + admin 以上は tenant 全件
CREATE POLICY purchases_select_own ON purchases
  FOR SELECT USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE POLICY purchases_select_admin ON purchases
  FOR SELECT USING (has_role(tenant_id, 'admin'));

-- INSERT/UPDATE: service_role のみ (Stripe checkout/webhook 経由)

-- ─── tags ───
-- SELECT: tenant メンバー
CREATE POLICY tags_select_member ON tags
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT/UPDATE/DELETE: admin 以上
CREATE POLICY tags_insert_admin ON tags
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY tags_update_admin ON tags
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY tags_delete_admin ON tags
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── user_tags ───
-- SELECT: 自分のタグ + admin 以上は tenant 全件
CREATE POLICY utags_select_own ON user_tags
  FOR SELECT USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

CREATE POLICY utags_select_admin ON user_tags
  FOR SELECT USING (has_role(tenant_id, 'admin'));

-- INSERT/DELETE: admin 以上
CREATE POLICY utags_insert_admin ON user_tags
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY utags_delete_admin ON user_tags
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── audit_logs ───
-- SELECT: admin 以上
CREATE POLICY audit_select_admin ON audit_logs
  FOR SELECT USING (has_role(tenant_id, 'admin'));

-- INSERT: service_role のみ (API 経由)
-- UPDATE/DELETE: 不可 (immutable)
