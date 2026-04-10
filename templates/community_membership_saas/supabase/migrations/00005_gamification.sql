-- ============================================================
-- community_membership_saas v2 — Gamification Migration
-- ============================================================
--
-- 設計前提:
--   ポイントは append-only イベントログ (point_events) に蓄積し、
--   member_points.total_points はトリガーで維持するマテリアライズド集計。
--   レベルは level_configs の閾値から自動算出。
--   reactions テーブル (00003_forum.sql) が先行マイグレーション済み前提。
--
--   参照: ADR-003 (comunavi-v2-gap-analysis.md)
--
-- ============================================================

-- ────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────

-- 1-1. member_points
--   tenant ごとのユーザーポイント集計 (デノーマライズ)
CREATE TABLE member_points (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_points  INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

-- 1-2. point_events
--   ポイント付与/減算の不変イベントログ
CREATE TABLE point_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN (
                  'like_received', 'post_created', 'comment_created',
                  'lesson_completed', 'admin_adjustment'
                )),
  points        INTEGER NOT NULL,
  source_type   TEXT CHECK (source_type IN ('post', 'comment', 'lesson') OR source_type IS NULL),
  source_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1-3. level_configs
--   tenant ごとのレベル閾値定義
CREATE TABLE level_configs (
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  level         INTEGER NOT NULL,
  name          TEXT NOT NULL,
  min_points    INTEGER NOT NULL,
  rewards       JSONB,
  PRIMARY KEY (tenant_id, level)
);

-- ────────────────────────────────────────
-- 2. INDEXES
-- ────────────────────────────────────────

-- member_points: リーダーボード用
CREATE INDEX idx_mpoints_leaderboard  ON member_points(tenant_id, total_points DESC);

-- point_events: ユーザー別取得 + 時系列
CREATE INDEX idx_pevents_tenant_user  ON point_events(tenant_id, user_id);
CREATE INDEX idx_pevents_tenant_time  ON point_events(tenant_id, created_at DESC);

-- level_configs: tenant 検索
CREATE INDEX idx_lconfigs_tenant      ON level_configs(tenant_id);

-- ────────────────────────────────────────
-- 3. FUNCTIONS & TRIGGERS
-- ────────────────────────────────────────

-- 3-1. compute_level
--   指定 tenant のポイントから最高レベルを算出
CREATE OR REPLACE FUNCTION compute_level(p_tenant_id UUID, p_points INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_level INTEGER;
BEGIN
  SELECT level INTO v_level
  FROM level_configs
  WHERE tenant_id = p_tenant_id
    AND min_points <= p_points
  ORDER BY min_points DESC
  LIMIT 1;

  -- level_configs 未設定の場合はレベル 1 を返す
  RETURN COALESCE(v_level, 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- 3-2. update_member_points
--   point_events INSERT 後に member_points を upsert
CREATE OR REPLACE FUNCTION update_member_points()
RETURNS TRIGGER AS $$
DECLARE
  v_new_total INTEGER;
  v_new_level INTEGER;
BEGIN
  INSERT INTO member_points (tenant_id, user_id, total_points, level, updated_at)
  VALUES (NEW.tenant_id, NEW.user_id, NEW.points, 1, now())
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET
    total_points = member_points.total_points + NEW.points,
    updated_at   = now();

  -- 更新後の total_points を取得してレベルを再計算
  SELECT total_points INTO v_new_total
  FROM member_points
  WHERE tenant_id = NEW.tenant_id AND user_id = NEW.user_id;

  v_new_level := compute_level(NEW.tenant_id, v_new_total);

  UPDATE member_points
  SET level = v_new_level
  WHERE tenant_id = NEW.tenant_id AND user_id = NEW.user_id
    AND level IS DISTINCT FROM v_new_level;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_point_events_after_insert
  AFTER INSERT ON point_events
  FOR EACH ROW EXECUTE FUNCTION update_member_points();

-- 3-3. on_reaction_created
--   reactions テーブルへの INSERT 時、対象投稿/コメントの著者にポイント付与
CREATE OR REPLACE FUNCTION on_reaction_created()
RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
BEGIN
  -- 投稿またはコメントの著者を特定
  IF NEW.target_type = 'post' THEN
    SELECT author_id INTO v_author_id FROM posts WHERE id = NEW.target_id;
  ELSIF NEW.target_type = 'comment' THEN
    SELECT author_id INTO v_author_id FROM comments WHERE id = NEW.target_id;
  END IF;

  -- 著者が見つかった場合かつ自分自身へのいいねでない場合のみポイント付与
  IF v_author_id IS NOT NULL AND v_author_id != NEW.user_id THEN
    INSERT INTO point_events (tenant_id, user_id, event_type, points, source_type, source_id)
    VALUES (NEW.tenant_id, v_author_id, 'like_received', 1, NEW.target_type, NEW.target_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reactions_after_insert
  AFTER INSERT ON reactions
  FOR EACH ROW EXECUTE FUNCTION on_reaction_created();

-- 3-4. on_reaction_deleted
--   reactions テーブルからの DELETE 時、ポイントを減算
CREATE OR REPLACE FUNCTION on_reaction_deleted()
RETURNS TRIGGER AS $$
DECLARE
  v_author_id UUID;
BEGIN
  -- 投稿またはコメントの著者を特定
  IF OLD.target_type = 'post' THEN
    SELECT author_id INTO v_author_id FROM posts WHERE id = OLD.target_id;
  ELSIF OLD.target_type = 'comment' THEN
    SELECT author_id INTO v_author_id FROM comments WHERE id = OLD.target_id;
  END IF;

  -- 著者が見つかった場合かつ自分自身へのいいねでない場合のみポイント減算
  IF v_author_id IS NOT NULL AND v_author_id != OLD.user_id THEN
    INSERT INTO point_events (tenant_id, user_id, event_type, points, source_type, source_id)
    VALUES (OLD.tenant_id, v_author_id, 'like_received', -1, OLD.target_type, OLD.target_id);
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reactions_after_delete
  AFTER DELETE ON reactions
  FOR EACH ROW EXECUTE FUNCTION on_reaction_deleted();

-- 3-5. updated_at トリガー (member_points)
CREATE TRIGGER trg_mpoints_updated
  BEFORE UPDATE ON member_points
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────
-- 4. DEFAULT LEVEL CONFIGS
-- ────────────────────────────────────────

-- Skool 互換デフォルトレベルを tenant に初期投入する関数
-- コミュニティ作成時に呼び出す想定
CREATE OR REPLACE FUNCTION seed_default_level_configs(p_tenant_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO level_configs (tenant_id, level, name, min_points, rewards) VALUES
    (p_tenant_id, 1,     'Newcomer',    0, NULL),
    (p_tenant_id, 2,     'Active',      5, NULL),
    (p_tenant_id, 3,     'Contributor', 20, NULL),
    (p_tenant_id, 4,     'Regular',     65, NULL),
    (p_tenant_id, 5,     'Enthusiast', 155, NULL),
    (p_tenant_id, 6,     'Expert',     515, NULL),
    (p_tenant_id, 7,     'Leader',    2015, NULL),
    (p_tenant_id, 8,     'Legend',    8015, NULL),
    (p_tenant_id, 9,     'Champion', 33015, NULL)
  ON CONFLICT (tenant_id, level) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ────────────────────────────────────────
-- 5. RLS POLICIES
-- ────────────────────────────────────────

ALTER TABLE member_points  ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_configs  ENABLE ROW LEVEL SECURITY;

-- ─── member_points ───
-- SELECT: active メンバーはリーダーボード閲覧可
CREATE POLICY mpoints_select_member ON member_points
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT/UPDATE/DELETE: system managed (service_role のみ / トリガー経由)

-- ─── point_events ───
-- SELECT: 自分のイベントのみ閲覧可
CREATE POLICY pevents_select_own ON point_events
  FOR SELECT USING (
    user_id = auth.uid()
    AND is_tenant_member(tenant_id)
  );

-- INSERT/UPDATE/DELETE: system managed (service_role のみ / トリガー経由)

-- ─── level_configs ───
-- SELECT: active メンバーはレベル定義閲覧可
CREATE POLICY lconfigs_select_member ON level_configs
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: admin 以上
CREATE POLICY lconfigs_insert_admin ON level_configs
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

-- UPDATE: admin 以上
CREATE POLICY lconfigs_update_admin ON level_configs
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

-- DELETE: admin 以上
CREATE POLICY lconfigs_delete_admin ON level_configs
  FOR DELETE USING (has_role(tenant_id, 'admin'));
