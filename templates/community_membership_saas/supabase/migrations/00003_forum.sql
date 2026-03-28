-- ============================================================
-- community_membership_saas v2 — Forum Migration
-- ============================================================
--
-- 設計前提:
--   Community Forum (P1): カテゴリ付きスレッド型掲示板
--   posts.body は ProseMirror JSON (TipTap エディタ対応)
--   reactions はポリモーフィック (post / comment 共用)
--   denormalized counter は DB トリガーで自動更新
--   1-level threaded comments (parent_id は 1 階層のみ)
--
-- ============================================================

-- ────────────────────────────────────────
-- 1. ALTER EXISTING TABLES
-- ────────────────────────────────────────

-- users: プロフィール拡張
ALTER TABLE users ADD COLUMN bio         TEXT;
ALTER TABLE users ADD COLUMN headline    TEXT;
ALTER TABLE users ADD COLUMN social_links JSONB;

-- tenants: 参加モード
ALTER TABLE tenants ADD COLUMN join_mode TEXT NOT NULL DEFAULT 'open'
  CONSTRAINT chk_tenants_join_mode CHECK (join_mode IN ('open', 'invite_only', 'application'));

-- ────────────────────────────────────────
-- 2. NEW TABLES
-- ────────────────────────────────────────

-- 2-1. categories
--   tenant ごとのフォーラムカテゴリ。slug は tenant 内で一意。
CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  description   TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  emoji         TEXT,                           -- カテゴリアイコン
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

-- 2-2. posts
--   フォーラム投稿。body は ProseMirror JSON 形式。
--   like_count / comment_count は denormalized counter (トリガーで更新)。
CREATE TABLE posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            JSONB NOT NULL,                -- ProseMirror JSON
  is_pinned       BOOLEAN NOT NULL DEFAULT false,
  is_locked       BOOLEAN NOT NULL DEFAULT false, -- true = 新規コメント不可
  like_count      INTEGER NOT NULL DEFAULT 0,
  comment_count   INTEGER NOT NULL DEFAULT 0,
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-3. comments
--   投稿へのコメント。parent_id で 1 階層のスレッド返信を表現。
CREATE TABLE comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  post_id       UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES comments(id) ON DELETE CASCADE,  -- 1-level threaded
  author_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          JSONB NOT NULL,
  like_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2-4. reactions
--   ポリモーフィックいいね/リアクション (post・comment 共用)。
--   target_id は FK を張らない (target_type に応じて参照先が異なる)。
CREATE TABLE reactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL,
  target_id       UUID NOT NULL,
  reaction_type   TEXT NOT NULL DEFAULT 'like',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_reactions_target_type CHECK (target_type IN ('post', 'comment')),
  UNIQUE (tenant_id, user_id, target_type, target_id, reaction_type)
);

-- ────────────────────────────────────────
-- 3. INDEXES
-- ────────────────────────────────────────

CREATE INDEX idx_categories_tenant         ON categories(tenant_id);

CREATE INDEX idx_posts_tenant              ON posts(tenant_id);
CREATE INDEX idx_posts_category            ON posts(category_id);
CREATE INDEX idx_posts_author              ON posts(author_id);
CREATE INDEX idx_posts_tenant_published    ON posts(tenant_id, published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX idx_comments_post             ON comments(post_id);
CREATE INDEX idx_comments_author           ON comments(author_id);
CREATE INDEX idx_comments_parent           ON comments(parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX idx_reactions_target          ON reactions(target_type, target_id);
CREATE INDEX idx_reactions_user            ON reactions(user_id);

-- ────────────────────────────────────────
-- 4. TRIGGERS — updated_at (既存の set_updated_at() を再利用)
-- ────────────────────────────────────────

CREATE TRIGGER trg_posts_updated    BEFORE UPDATE ON posts    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_comments_updated BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ────────────────────────────────────────
-- 5. TRIGGERS — denormalized counters
-- ────────────────────────────────────────

-- 5-1. posts.like_count (reaction INSERT/DELETE on target_type='post')
CREATE OR REPLACE FUNCTION update_post_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.target_type = 'post' THEN
    UPDATE posts SET like_count = like_count + 1
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' AND OLD.target_type = 'post' THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reaction_post_like
  AFTER INSERT OR DELETE ON reactions
  FOR EACH ROW EXECUTE FUNCTION update_post_like_count();

-- 5-2. comments.like_count (reaction INSERT/DELETE on target_type='comment')
CREATE OR REPLACE FUNCTION update_comment_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.target_type = 'comment' THEN
    UPDATE comments SET like_count = like_count + 1
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' AND OLD.target_type = 'comment' THEN
    UPDATE comments SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reaction_comment_like
  AFTER INSERT OR DELETE ON reactions
  FOR EACH ROW EXECUTE FUNCTION update_comment_like_count();

-- 5-3. posts.comment_count (comment INSERT/DELETE)
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0)
    WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comment_count
  AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();

-- ────────────────────────────────────────
-- 6. ENABLE RLS
-- ────────────────────────────────────────

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions   ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────
-- 7. RLS POLICIES
-- ────────────────────────────────────────
-- 命名規則: {table}_{operation}_{scope}
--   operation: select / insert / update / delete
--   scope: own / member / admin / editor / public
-- ヘルパー関数 is_tenant_member(), has_role() は 00002_rls.sql で定義済み

-- ─── categories ───
-- SELECT: active メンバー
CREATE POLICY categories_select_member ON categories
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: admin 以上
CREATE POLICY categories_insert_admin ON categories
  FOR INSERT WITH CHECK (has_role(tenant_id, 'admin'));

-- UPDATE: admin 以上
CREATE POLICY categories_update_admin ON categories
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

-- DELETE: admin 以上
CREATE POLICY categories_delete_admin ON categories
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── posts ───
-- SELECT: published は active メンバーが閲覧可 / editor 以上は全件
CREATE POLICY posts_select_member ON posts
  FOR SELECT USING (
    published_at IS NOT NULL
    AND is_tenant_member(tenant_id)
  );

CREATE POLICY posts_select_editor ON posts
  FOR SELECT USING (has_role(tenant_id, 'editor'));

-- INSERT: active メンバー
CREATE POLICY posts_insert_member ON posts
  FOR INSERT WITH CHECK (
    is_tenant_member(tenant_id)
    AND author_id = auth.uid()
  );

-- UPDATE: 著者本人 or admin 以上
CREATE POLICY posts_update_own ON posts
  FOR UPDATE USING (
    author_id = auth.uid()
    AND is_tenant_member(tenant_id)
  )
  WITH CHECK (
    author_id = auth.uid()
    AND is_tenant_member(tenant_id)
  );

CREATE POLICY posts_update_admin ON posts
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

-- DELETE: admin 以上
CREATE POLICY posts_delete_admin ON posts
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── comments ───
-- SELECT: active メンバー
CREATE POLICY comments_select_member ON comments
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: active メンバー (自分の author_id のみ)
CREATE POLICY comments_insert_member ON comments
  FOR INSERT WITH CHECK (
    is_tenant_member(tenant_id)
    AND author_id = auth.uid()
  );

-- UPDATE: 著者本人 or admin 以上
CREATE POLICY comments_update_own ON comments
  FOR UPDATE USING (
    author_id = auth.uid()
    AND is_tenant_member(tenant_id)
  )
  WITH CHECK (
    author_id = auth.uid()
    AND is_tenant_member(tenant_id)
  );

CREATE POLICY comments_update_admin ON comments
  FOR UPDATE USING (has_role(tenant_id, 'admin'))
  WITH CHECK (has_role(tenant_id, 'admin'));

-- DELETE: 著者本人 or admin 以上
CREATE POLICY comments_delete_own ON comments
  FOR DELETE USING (
    author_id = auth.uid()
    AND is_tenant_member(tenant_id)
  );

CREATE POLICY comments_delete_admin ON comments
  FOR DELETE USING (has_role(tenant_id, 'admin'));

-- ─── reactions ───
-- SELECT: active メンバー
CREATE POLICY reactions_select_member ON reactions
  FOR SELECT USING (is_tenant_member(tenant_id));

-- INSERT: active メンバー (自分の user_id のみ)
CREATE POLICY reactions_insert_member ON reactions
  FOR INSERT WITH CHECK (
    is_tenant_member(tenant_id)
    AND user_id = auth.uid()
  );

-- DELETE: 自分のリアクションのみ
CREATE POLICY reactions_delete_own ON reactions
  FOR DELETE USING (
    user_id = auth.uid()
    AND is_tenant_member(tenant_id)
  );
