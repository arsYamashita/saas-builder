-- ============================================================
-- community_membership_saas v2 — Classroom / Courses Migration
-- ============================================================
--
-- 設計前提:
--   course -> module -> lesson の 3 階層構造
--   access control は content_access_rules と同パターン (course_access_rules)
--   drip / level-unlock は lesson 単位で設定、判定は API 層で実施
--   video resume position は user_lesson_progress で保持
--   既存 enum (content_status, visibility_mode, access_rule_type) を再利用
--
-- ============================================================

-- ────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────

-- 1-1. courses
--   テナントごとのコース。status / visibility_mode は contents と同じ enum を再利用。
CREATE TABLE courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  status          content_status NOT NULL DEFAULT 'draft',
  visibility_mode visibility_mode NOT NULL DEFAULT 'members_only',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- 1-2. course_modules
--   コース内のモジュール (セクション)。並び順は sort_order で管理。
CREATE TABLE course_modules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1-3. course_lessons
--   レッスン本体。body は ProseMirror JSON (posts と同形式)。
--   drip_days: NULL=即時公開、N=参加 N 日後にアンロック
--   unlock_level: NULL=レベル制限なし、N=レベル N 以上でアンロック
--   is_preview: true ならコース未購入でもプレビュー可能
CREATE TABLE course_lessons (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id               UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  slug                    TEXT NOT NULL,
  body                    JSONB,
  video_url               TEXT,
  video_duration_seconds  INTEGER,
  transcript              TEXT,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  is_preview              BOOLEAN NOT NULL DEFAULT false,
  drip_days               INTEGER,
  unlock_level            INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1-4. course_access_rules
--   content_access_rules と同パターン。course 単位でアクセスルールを設定。
--   visibility_mode = 'rules_based' のときのみ参照される。
--   同一 course_id に複数行 → OR 評価。
CREATE TABLE course_access_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  rule_type     access_rule_type NOT NULL,
  plan_id       UUID REFERENCES membership_plans(id) ON DELETE CASCADE,
  tag_id        UUID REFERENCES tags(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- rule_type と参照先の整合性チェック (content_access_rules と同一制約)
  CONSTRAINT chk_course_rule_plan CHECK (rule_type != 'plan_based'     OR plan_id IS NOT NULL),
  CONSTRAINT chk_course_rule_tag  CHECK (rule_type != 'tag_based'      OR tag_id  IS NOT NULL),
  CONSTRAINT chk_course_rule_purchase CHECK (rule_type != 'purchase_based' OR (plan_id IS NULL AND tag_id IS NULL))
);

-- 1-5. user_lesson_progress
--   レッスン単位の進捗。completed_at は完了時刻、last_position_seconds は動画再開位置。
CREATE TABLE user_lesson_progress (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id             UUID NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  completed             BOOLEAN NOT NULL DEFAULT false,
  completed_at          TIMESTAMPTZ,
  last_position_seconds INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, lesson_id)
);

-- ────────────────────────────────────────
-- 2. INDEXES
-- ────────────────────────────────────────

-- courses
CREATE INDEX idx_courses_tenant       ON courses(tenant_id);
CREATE INDEX idx_courses_slug         ON courses(tenant_id, slug);
CREATE INDEX idx_courses_published    ON courses(tenant_id, status, sort_order) WHERE status = 'published';

-- course_modules
CREATE INDEX idx_cmod_course          ON course_modules(course_id);
CREATE INDEX idx_cmod_sort            ON course_modules(course_id, sort_order);

-- course_lessons
CREATE INDEX idx_clesson_module       ON course_lessons(module_id);
CREATE INDEX idx_clesson_sort         ON course_lessons(module_id, sort_order);

-- course_access_rules
CREATE INDEX idx_crule_course         ON course_access_rules(course_id);
CREATE INDEX idx_crule_plan           ON course_access_rules(rule_type, plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX idx_crule_tag            ON course_access_rules(rule_type, tag_id)  WHERE tag_id IS NOT NULL;

-- user_lesson_progress
CREATE INDEX idx_ulp_user_lesson      ON user_lesson_progress(user_id, lesson_id);
CREATE INDEX idx_ulp_tenant_user      ON user_lesson_progress(tenant_id, user_id);

-- ────────────────────────────────────────
-- 3. TRIGGERS — updated_at auto-update
-- ────────────────────────────────────────
-- set_updated_at() は 00001_schema.sql で定義済み

CREATE TRIGGER trg_courses_updated          BEFORE UPDATE ON courses              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_course_lessons_updated   BEFORE UPDATE ON course_lessons       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ulp_updated              BEFORE UPDATE ON user_lesson_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────
-- 4. RLS — Row Level Security
-- ────────────────────────────────────────
-- 設計方針:
--   courses / modules / lessons の SELECT: published は tenant メンバーに公開、editor+ は全件
--   courses の INSERT/UPDATE/DELETE: admin 以上
--   course_access_rules: admin 以上のみ全操作
--   user_lesson_progress: 自分の進捗のみ読み書き
--   drip / level-unlock の細粒度判定は API 層で実施 (RLS は tenant member チェックのみ)

ALTER TABLE courses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lessons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_access_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_lesson_progress ENABLE ROW LEVEL SECURITY;

-- ─── courses ───
-- SELECT: public published は誰でも、members_only/rules_based published は tenant メンバー、editor+ は全件
CREATE POLICY courses_select_public ON courses
  FOR SELECT USING (status = 'published' AND visibility_mode = 'public');

CREATE POLICY courses_select_member ON courses
  FOR SELECT USING (
    status = 'published'
    AND visibility_mode IN ('members_only', 'rules_based')
    AND is_tenant_member(tenant_id)
  );

CREATE POLICY courses_select_editor ON courses
  FOR SELECT USING (has_role(tenant_id, 'editor'));

-- INSERT/UPDATE/DELETE: admin 以上
CREATE POLICY courses_insert_admin ON courses
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY courses_update_admin ON courses
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY courses_delete_admin ON courses
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── course_modules ───
-- SELECT: 親 course の visibility を継承 (published course の module は tenant メンバーに公開)
CREATE POLICY cmod_select_member ON course_modules
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM courses c
      WHERE c.id = course_modules.course_id
        AND c.status = 'published'
        AND (
          c.visibility_mode = 'public'
          OR is_tenant_member(c.tenant_id)
        )
    )
  );

CREATE POLICY cmod_select_editor ON course_modules
  FOR SELECT USING (has_role(tenant_id, 'editor'));

-- INSERT/UPDATE/DELETE: admin 以上
CREATE POLICY cmod_insert_admin ON course_modules
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY cmod_update_admin ON course_modules
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY cmod_delete_admin ON course_modules
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── course_lessons ───
-- SELECT: 親 course が published かつ tenant メンバー (drip/level は API 層で判定)
CREATE POLICY clesson_select_member ON course_lessons
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM course_modules cm
      JOIN courses c ON c.id = cm.course_id
      WHERE cm.id = course_lessons.module_id
        AND c.status = 'published'
        AND (
          c.visibility_mode = 'public'
          OR is_tenant_member(c.tenant_id)
        )
    )
  );

CREATE POLICY clesson_select_editor ON course_lessons
  FOR SELECT USING (has_role(tenant_id, 'editor'));

-- INSERT/UPDATE/DELETE: admin 以上
CREATE POLICY clesson_insert_admin ON course_lessons
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY clesson_update_admin ON course_lessons
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY clesson_delete_admin ON course_lessons
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── course_access_rules ───
-- SELECT/INSERT/UPDATE/DELETE: admin 以上のみ
CREATE POLICY crule_select_admin ON course_access_rules
  FOR SELECT USING (has_role(tenant_id, 'admin'));

CREATE POLICY crule_insert_admin ON course_access_rules
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY crule_update_admin ON course_access_rules
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

CREATE POLICY crule_delete_admin ON course_access_rules
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── user_lesson_progress ───
-- SELECT: 自分の進捗のみ
CREATE POLICY ulp_select_own ON user_lesson_progress
  FOR SELECT USING (user_id = auth.uid() AND is_tenant_member(tenant_id));

-- INSERT: 自分の進捗のみ
CREATE POLICY ulp_insert_own ON user_lesson_progress
  FOR INSERT WITH CHECK (user_id = auth.uid() AND is_tenant_member(tenant_id));

-- UPDATE: 自分の進捗のみ
CREATE POLICY ulp_update_own ON user_lesson_progress
  FOR UPDATE USING (user_id = auth.uid() AND is_tenant_member(tenant_id))
  WITH CHECK (user_id = auth.uid() AND is_tenant_member(tenant_id));

-- DELETE: 不可 (進捗は削除させない)
