-- ============================================================
-- community_membership_saas v2 — Seed Data
-- ============================================================
-- dev/test 用の初期データ。本番では使用しない。
-- 前提: auth.users に seed ユーザーが存在すること
--   (Supabase Dashboard or CLI で事前作成)
-- ============================================================

-- ──── 1. Tenant ────
INSERT INTO tenants (id, name, slug, plan_type, status, join_mode) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Demo Community', 'demo', 'starter', 'active', 'open');

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
INSERT INTO content_access_rules (tenant_id, content_id, rule_type, plan_id) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'plan_based',
   'b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000003', 'plan_based',
   'b0000000-0000-0000-0000-000000000003');

INSERT INTO content_access_rules (tenant_id, content_id, rule_type) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000004', 'purchase_based');

-- ============================================================
-- v2 Seed Data
-- ============================================================

-- ──── 6. Forum Categories ────
INSERT INTO categories (id, tenant_id, name, slug, description, sort_order, emoji) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   '自己紹介',    'introductions', 'コミュニティに自己紹介しましょう！', 0, '👋'),
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   '質問・相談',  'questions',     '何でも気軽に質問してください',       1, '❓'),
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   '成果報告',    'wins',          '成果やマイルストーンをシェアしましょう', 2, '🏆'),
  ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
   '雑談',        'general',       '自由にトピックを立ててOK',            3, '💬');

-- ──── 7. Courses ────
INSERT INTO courses (id, tenant_id, title, slug, description, status, visibility_mode, sort_order) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'スタートガイド', 'start-guide',
   'コミュニティの使い方を学ぶ入門コース。誰でもアクセスできます。',
   'published', 'members_only', 0),
  ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   '上級テクニック', 'advanced-techniques',
   'Pro プラン限定の上級コース。レベル3でアンロック。',
   'published', 'rules_based', 1);

-- Course access rule: advanced requires Pro plan
INSERT INTO course_access_rules (tenant_id, course_id, rule_type, plan_id) VALUES
  ('a0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000002', 'plan_based',
   'b0000000-0000-0000-0000-000000000002');

-- ──── 8. Course Modules ────
INSERT INTO course_modules (id, course_id, tenant_id, title, description, sort_order) VALUES
  -- Start Guide modules
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'はじめに', 'コミュニティの概要と目標', 0),
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   '基本操作', '投稿・コメント・いいねの使い方', 1),
  -- Advanced modules
  ('f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   '戦略編', '成功する戦略の立て方', 0);

-- ──── 9. Course Lessons ────
INSERT INTO course_lessons (id, module_id, tenant_id, title, slug, body, sort_order, is_preview, drip_days, unlock_level) VALUES
  -- Start Guide > はじめに
  ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'ようこそ！コミュニティへ', 'welcome-lesson',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"このコミュニティへようこそ！ここでは、あなたの成長をサポートする仲間と出会えます。"}]}]}',
   0, true, NULL, NULL),
  ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000001',
   'コミュニティのルール', 'community-rules',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"互いを尊重し、建設的なフィードバックを心がけましょう。"}]}]}',
   1, false, NULL, NULL),
  -- Start Guide > 基本操作
  ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   '投稿の書き方', 'how-to-post',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"カテゴリを選んで、タイトルと本文を入力するだけ。画像やリンクも埋め込めます。"}]}]}',
   0, false, NULL, NULL),
  ('f2000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000002',
   'a0000000-0000-0000-0000-000000000001',
   'ポイントとレベルの仕組み', 'points-and-levels',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"いいねをもらうとポイントが貯まり、レベルアップ！レベルが上がるとコースがアンロックされます。"}]}]}',
   1, false, NULL, NULL),
  -- Advanced > 戦略編 (drip + level lock)
  ('f2000000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   '成功者の共通パターン', 'success-patterns',
   '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"トップメンバーに共通する行動パターンを分析しました。"}]}]}',
   0, false, 7, 3);

-- ──── 10. Level Configs (Skool-compatible defaults) ────
INSERT INTO level_configs (tenant_id, level, name, min_points, rewards) VALUES
  ('a0000000-0000-0000-0000-000000000001', 1, 'ニューカマー',    0,     NULL),
  ('a0000000-0000-0000-0000-000000000001', 2, 'アクティブ',      5,     NULL),
  ('a0000000-0000-0000-0000-000000000001', 3, 'コントリビューター', 20,    '{"unlock_course_ids":["f0000000-0000-0000-0000-000000000002"]}'),
  ('a0000000-0000-0000-0000-000000000001', 4, 'レギュラー',      65,    NULL),
  ('a0000000-0000-0000-0000-000000000001', 5, 'エンスージアスト', 155,   NULL),
  ('a0000000-0000-0000-0000-000000000001', 6, 'エキスパート',    515,   NULL),
  ('a0000000-0000-0000-0000-000000000001', 7, 'リーダー',        2015,  NULL),
  ('a0000000-0000-0000-0000-000000000001', 8, 'レジェンド',      8015,  NULL),
  ('a0000000-0000-0000-0000-000000000001', 9, 'チャンピオン',    33015, NULL);

-- ──── 11. Membership Questions (for application mode) ────
INSERT INTO membership_questions (id, tenant_id, question_text, is_required, sort_order) VALUES
  ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'このコミュニティに参加したい理由を教えてください', true, 0),
  ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'あなたの専門分野や興味のある領域は？', true, 1),
  ('70000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
   'SNSアカウントやポートフォリオURL（任意）', false, 2);

-- ──── NOTE ────
-- users / memberships は auth.users 作成後に挿入する必要がある。
-- テスト用:
--   1. Supabase Dashboard → Auth → Users → Add User
--   2. 以下の SQL を user ID を差し替えて実行:
--
-- INSERT INTO users (id, email, display_name, bio, headline) VALUES
--   ('<OWNER_UID>',  'owner@example.com',  'Owner User',  'コミュニティの創設者', 'Founder & CEO'),
--   ('<ADMIN_UID>',  'admin@example.com',  'Admin User',  '運営チームメンバー',   'Community Manager'),
--   ('<EDITOR_UID>', 'editor@example.com', 'Editor User', 'コンテンツ担当',       'Content Creator'),
--   ('<MEMBER_UID>', 'member@example.com', 'Member User', 'コミュニティメンバー', '学習中');
--
-- INSERT INTO memberships (tenant_id, user_id, role, status) VALUES
--   ('a0000000-0000-0000-0000-000000000001', '<OWNER_UID>',  'owner',  'active'),
--   ('a0000000-0000-0000-0000-000000000001', '<ADMIN_UID>',  'admin',  'active'),
--   ('a0000000-0000-0000-0000-000000000001', '<EDITOR_UID>', 'editor', 'active'),
--   ('a0000000-0000-0000-0000-000000000001', '<MEMBER_UID>', 'member', 'active');
--
-- ──── Sample Posts (run after users are created) ────
--
-- INSERT INTO posts (tenant_id, category_id, author_id, title, body, published_at) VALUES
--   ('a0000000-0000-0000-0000-000000000001',
--    'e0000000-0000-0000-0000-000000000001', '<OWNER_UID>',
--    'はじめまして！Demo Community へようこそ 🎉',
--    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"このコミュニティは、同じ志を持つ仲間が集まる場所です。自己紹介を投稿して、まずは仲間と繋がりましょう！"}]},{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"💡 ヒント："},{"type":"text","text":"いいねをもらうとポイントが貯まり、レベルアップできます。レベルが上がると限定コースがアンロック！"}]}]}',
--    now());
