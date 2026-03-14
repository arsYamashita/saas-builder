-- ============================================================
-- community_membership_saas v1 — Seed Data
-- ============================================================
-- dev/test 用の初期データ。本番では使用しない。
-- 前提: auth.users に seed ユーザーが存在すること
--   (Supabase Dashboard or CLI で事前作成)
-- ============================================================

-- ──── 1. Tenant ────
INSERT INTO tenants (id, name, slug, plan_type, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Demo Community', 'demo', 'starter', 'active');

-- ──── 2. Plans ────
INSERT INTO membership_plans (id, tenant_id, name, description, price_amount, currency, sort_order, status) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Free',    'Basic access to public content', 0,    'jpy', 0, 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Pro',     'All members-only content',       980,  'jpy', 1, 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   'Premium', 'Full access + exclusive content', 2980, 'jpy', 2, 'active');

-- ──── 3. Tags ────
INSERT INTO tags (id, tenant_id, name, slug, color) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'VIP',        'vip',        '#EAB308'),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Early Bird', 'early-bird', '#22C55E');

-- ──── 4. Contents (sample) ────
INSERT INTO contents (id, tenant_id, title, slug, body, content_type, status, visibility_mode, published_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'Welcome',              'welcome',
   'Welcome to our community! This is a public article.',
   'article', 'published', 'public', now()),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Members Only Guide',   'members-guide',
   'This guide is available to all members.',
   'article', 'published', 'members_only', now()),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   'Pro Exclusive Video',  'pro-video',
   'This video is only for Pro plan subscribers.',
   'video',   'published', 'rules_based', now()),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
   'Premium Workshop',     'premium-workshop',
   'One-time purchase workshop content.',
   'video',   'published', 'rules_based', now()),
  ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001',
   'Draft Article',        'draft-article',
   'This is still being written.',
   'article', 'draft',     'members_only', NULL);

-- ──── 5. Content Access Rules ────
-- Pro plan → pro-video
INSERT INTO content_access_rules (tenant_id, content_id, rule_type, plan_id) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'plan_based',
   'b0000000-0000-0000-0000-000000000002');

-- Premium plan → pro-video (Premium includes Pro content)
INSERT INTO content_access_rules (tenant_id, content_id, rule_type, plan_id) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'plan_based',
   'b0000000-0000-0000-0000-000000000003');

-- purchase_based → premium-workshop
INSERT INTO content_access_rules (tenant_id, content_id, rule_type) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000004', 'purchase_based');

-- ──── NOTE ────
-- users / memberships は auth.users 作成後に挿入する必要がある。
-- テスト用:
--   1. Supabase Dashboard → Auth → Users → Add User
--   2. 以下の SQL を user ID を差し替えて実行:
--
-- INSERT INTO users (id, email, display_name) VALUES
--   ('<OWNER_UID>',  'owner@example.com',  'Owner User'),
--   ('<ADMIN_UID>',  'admin@example.com',  'Admin User'),
--   ('<EDITOR_UID>', 'editor@example.com', 'Editor User'),
--   ('<MEMBER_UID>', 'member@example.com', 'Member User');
--
-- INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
--   ('a0000000-0000-0000-0000-000000000001', '<OWNER_UID>',  'owner',  'active'),
--   ('a0000000-0000-0000-0000-000000000001', '<ADMIN_UID>',  'admin',  'active'),
--   ('a0000000-0000-0000-0000-000000000001', '<EDITOR_UID>', 'editor', 'active'),
--   ('a0000000-0000-0000-0000-000000000001', '<MEMBER_UID>', 'member', 'active');
