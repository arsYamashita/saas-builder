# 認証済み Playwright テスト 実行前提ガイド

## 概要

`logged-in` プロジェクトの 25 テスト（+ setup 1 + chromium 18 = 合計 44）を実行するための前提条件と手順。

---

## クイックスタート（最短手順）

既に Supabase プロジェクトが稼働中で `.env.local` に接続情報がある前提:

```bash
# 1. テストユーザーを作成（Supabase Dashboard or CLI）
supabase auth admin create-user \
  --email test-e2e@example.com \
  --password 'TestPassword123' \
  --email-confirm

# 2. Supabase SQL Editor でワンライナー SQL を実行（→ 下記「ワンライナーセットアップ SQL」）
#    users + tenants + tenant_users を一括作成

# 3. 環境変数を .env.local に追記
echo 'TEST_USER_EMAIL=test-e2e@example.com' >> .env.local
echo 'TEST_USER_PASSWORD=TestPassword123' >> .env.local

# 4. テスト実行
npm run test:e2e:all       # 全 Playwright（setup 1 + chromium 18 + logged-in 25 = 44）
# または
npm run test:e2e:auth      # logged-in のみ

# 5. テストデータ掃除（失敗時のみ必要）
npm run test:cleanup
```

**期待結果**: 44 passed, 0 skipped, 0 failed

### よくある失敗と対処

| エラー | 原因 | 修正 |
|---|---|---|
| 25 tests skipped | `TEST_USER_*` 未設定 | `.env.local` を確認 |
| auth.setup.ts タイムアウト | ログイン失敗 | Supabase Dashboard で Users → メール確認済みか |
| "User profile not found" | `users` テーブル未作成 | ワンライナー SQL を実行 |
| "Active tenant membership not found" | `tenant_users` 未作成 | ワンライナー SQL を実行 |
| "Forbidden" | `role` が `member` 等 | `tenant_users.role` を `owner` に変更 |

---

## テスト分類

### カテゴリ A: 認証のみ（テナント不要）— 6 テスト

| ファイル | テスト数 | 必要条件 |
|---|---|---|
| `dashboard.auth.spec.ts` | 2 | ログイン可能（※ dashboard は `requireCurrentUser()` を使うため `users` テーブルにレコード必要） |
| `billing.auth.spec.ts` | 2 | ログイン可能（middleware のみ） |
| `builder.auth.spec.ts` | 2 | ログイン可能（builder は認証不要だが auth 状態でも動くことを確認） |

### カテゴリ B: テナント admin 必須 — 19 テスト

| ファイル | テスト数 | 必要条件 |
|---|---|---|
| `content.auth.spec.ts` | 3 | `tenant_users` に `role='admin'` + `status='active'` |
| `content-crud.auth.spec.ts` | 8 | 同上 |
| `plans-crud.auth.spec.ts` | 8 | 同上 |

### seed データ

- コンテンツ / プランの初期データ: **不要**。CRUD テストは自ら create → update → delete する。
- Stripe 連携: **不要**。

---

## 必要なデータベースレコード

認証テストが通るには、以下の 4 つのレコードが揃っている必要がある:

```
┌─────────────────┐
│  auth.users     │ ← Supabase Auth (自動管理)
│  id, email      │
└────────┬────────┘
         │ id を共有
┌────────▼────────┐
│  users          │ ← アプリ側ユーザーテーブル
│  id, email,     │
│  display_name   │
└────────┬────────┘
         │ user_id
┌────────▼────────┐     ┌──────────────┐
│  tenant_users   │────→│  tenants     │
│  user_id,       │     │  id, name,   │
│  tenant_id,     │     │  slug,       │
│  role='admin',  │     │  owner_user_id│
│  status='active'│     └──────────────┘
└─────────────────┘
```

### テーブル別の必須カラム

#### `tenants`

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | uuid | PK (auto) | |
| `name` | text | NOT NULL | テナント名 |
| `slug` | text | UNIQUE NOT NULL | URL用スラッグ |
| `owner_user_id` | uuid | NOT NULL | オーナーのユーザーID |
| `plan_type` | text | default 'starter' | |
| `status` | text | default 'active' | |

#### `users`

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | uuid | PK | auth.users.id と同一 |
| `email` | text | UNIQUE NOT NULL | |
| `display_name` | text | nullable | |
| `auth_provider` | text | nullable | |

#### `tenant_users`（⚠ `tenant_memberships` ではない）

| カラム | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | uuid | PK (auto) | |
| `tenant_id` | uuid | FK → tenants(id) | |
| `user_id` | uuid | FK → users(id) | |
| `role` | text | NOT NULL | `'owner'` or `'admin'` |
| `status` | text | default 'active' | **必ず `'active'`** |
| `joined_at` | timestamptz | nullable | |

**UNIQUE 制約**: `(tenant_id, user_id)` — 同じテナントに同じユーザーは 1 件のみ。

**ロール優先度**: owner(100) > admin(80) > affiliate_manager(70) > staff(60) > member(10)
`requireTenantRole("admin")` は admin 以上（owner, admin）で pass する。

---

## セットアップ手順

### Step 1: Supabase にテストユーザーを作成

```bash
# Dashboard: Authentication → Users → Add User
# または CLI:
supabase auth admin create-user \
  --email test-e2e@example.com \
  --password 'TestPassword123' \
  --email-confirm
```

要件:
- メール確認済み（`--email-confirm` or Dashboard で "Confirm email"）
- パスワード: 8 文字以上

### Step 2: users テーブルにレコードを作成

**注意**: signup API を使えば自動作成されるが、手動セットアップの場合は SQL が必要。

```sql
-- auth.users.id を確認
SELECT id FROM auth.users WHERE email = 'test-e2e@example.com';
-- → 結果の UUID をメモ（以降 <USER_ID> として参照）

-- users テーブルに挿入
INSERT INTO users (id, email, display_name, auth_provider)
VALUES (
  '<USER_ID>'::uuid,
  'test-e2e@example.com',
  'E2E Test User',
  'email'
);
```

### Step 3: テナントを作成

```sql
INSERT INTO tenants (id, name, slug, owner_user_id, plan_type, status)
VALUES (
  gen_random_uuid(),
  'E2E Test Tenant',
  'e2e-test',
  '<USER_ID>'::uuid,
  'starter',
  'active'
)
RETURNING id;
-- → 結果の UUID をメモ（以降 <TENANT_ID> として参照）
```

### Step 4: テナントメンバーシップを作成

```sql
INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at)
VALUES (
  '<TENANT_ID>'::uuid,
  '<USER_ID>'::uuid,
  'owner',
  'active',
  now()
);
```

### Step 5: 環境変数を設定

```bash
# .env.local に追記
TEST_USER_EMAIL=test-e2e@example.com
TEST_USER_PASSWORD=TestPassword123
```

### Step 6: テスト実行

```bash
# 全テスト
npx playwright test

# logged-in テストのみ
npx playwright test --project=logged-in

# CRUD テストのみ
npx playwright test --project=logged-in -g "CRUD"
```

---

## ワンライナーセットアップ SQL

Step 1 で `supabase auth admin create-user` 済みの前提で、Step 2〜4 を 1 回で実行:

```sql
DO $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid;
BEGIN
  -- auth.users から ID を取得
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'test-e2e@example.com';
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth.users に test-e2e@example.com が見つかりません';
  END IF;

  -- users テーブルに挿入（既存なら skip）
  INSERT INTO users (id, email, display_name, auth_provider)
  VALUES (v_user_id, 'test-e2e@example.com', 'E2E Test User', 'email')
  ON CONFLICT (id) DO NOTHING;

  -- テナント作成
  v_tenant_id := gen_random_uuid();
  INSERT INTO tenants (id, name, slug, owner_user_id, plan_type, status)
  VALUES (v_tenant_id, 'E2E Test Tenant', 'e2e-test-' || substr(v_tenant_id::text, 1, 8), v_user_id, 'starter', 'active')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_tenant_id;

  -- メンバーシップ作成
  INSERT INTO tenant_users (tenant_id, user_id, role, status, joined_at)
  VALUES (v_tenant_id, v_user_id, 'owner', 'active', now())
  ON CONFLICT ON CONSTRAINT idx_tenant_users_unique_membership DO NOTHING;

  RAISE NOTICE 'Done: user_id=%, tenant_id=%', v_user_id, v_tenant_id;
END;
$$;
```

---

## 最終チェックリスト

テストが pass するための条件:

- [ ] Supabase の `auth.users` にテストユーザーが存在し、メール確認済み
- [ ] `users` テーブルに同じ `id` のレコードが存在する
- [ ] `tenants` テーブルにテナントが存在する（`slug` 付き、`status='active'`）
- [ ] `tenant_users` に `role='owner'` or `'admin'`、`status='active'` のレコードが存在する
- [ ] `.env.local` に `TEST_USER_EMAIL` と `TEST_USER_PASSWORD` が設定済み
- [ ] `npm run dev` でローカルサーバーが起動可能（Supabase 接続可能）
- [ ] `npx playwright test --project=logged-in` で 25 テストが pass

---

## FK 制約による削除失敗の条件

### membership_plans の DELETE

`subscriptions` テーブルの `price_id` は `billing_prices(id)` を参照しており、`membership_plans` への直接 FK は存在しない。
ただし `membership_plans.price_id` が text 型で Stripe Price ID を保持するため、アプリレベルの参照整合性はある。

現状の DB スキーマ上、**membership_plans の DELETE で FK 制約違反は発生しない**。

### contents の DELETE

`contents` テーブルには他テーブルからの FK 参照がない。**DELETE は常に成功する**。

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 全 logged-in テストが skip | `TEST_USER_*` 未設定 | `.env.local` に追記 |
| auth.setup.ts でログイン失敗 | ユーザー未作成 / パスワード不一致 / メール未確認 | Supabase Dashboard → Authentication → Users で確認 |
| dashboard で "User profile not found" | `users` テーブルにレコードなし | Step 2 の SQL を実行 |
| content/plans で "Active tenant membership not found" | `tenant_users` にレコードなし or `status != 'active'` | Step 3-4 の SQL を実行 |
| content/plans で "Forbidden" | `tenant_users.role` の優先度が不足 | `role` を `'admin'` 以上に変更 |
| storageState で認証切れ | セッション期限切れ | `.auth/user.json` を削除して `npx playwright test` を再実行 |
