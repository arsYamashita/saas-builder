# GitHub Actions Secrets 設定ガイド

CI パイプライン（`.github/workflows/ci.yml`）を安定稼働させるために必要な Secrets の一覧と設定方法。

---

## 必要な Secrets 一覧

| Secret 名 | 必須 | 用途 | 未設定時の影響 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **必須** | Supabase プロジェクト URL。Next.js ビルド・実行時に使用 | Playwright ジョブで Next.js 起動失敗（API が動かない） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **必須** | Supabase 匿名キー。クライアント側 API 呼び出しに使用 | 同上 |
| `SUPABASE_SERVICE_ROLE_KEY` | **必須** | Supabase 管理キー。サーバー側 API（builder, scoreboard 等）に使用 | Builder 系 API がエラーを返す |
| `TEST_USER_EMAIL` | 推奨 | Playwright 認証テスト用のテストユーザーメールアドレス | 認証済みテストがスキップされる（非認証テストは正常動作） |
| `TEST_USER_PASSWORD` | 推奨 | Playwright 認証テスト用のテストユーザーパスワード | 同上 |

### CI では不要な Secrets

以下は Playwright / typecheck / unit test では使用しないため、CI 上で未設定でも問題ない:

| Secret 名 | 理由 |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe API を直接呼ぶテストがない |
| `STRIPE_WEBHOOK_SECRET` | Webhook テストがない |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe UI テストがない |
| `CLAUDE_API_KEY` | AI 生成テストは unit test でモック済み |
| `GEMINI_API_KEY` | 同上 |

---

## 各 Secret の詳細

### NEXT_PUBLIC_SUPABASE_URL

- **取得場所**: Supabase Dashboard → Settings → API → Project URL
- **形式**: `https://<project-ref>.supabase.co`
- **注意**: ステージング用 Supabase プロジェクトを推奨（本番データを汚さない）

### NEXT_PUBLIC_SUPABASE_ANON_KEY

- **取得場所**: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`
- **形式**: `eyJ...` (JWT 形式)

### SUPABASE_SERVICE_ROLE_KEY

- **取得場所**: Supabase Dashboard → Settings → API → Project API keys → `service_role` `secret`
- **形式**: `eyJ...` (JWT 形式)
- **注意**: RLS をバイパスする強力なキー。テスト/ステージング環境専用を推奨

### TEST_USER_EMAIL / TEST_USER_PASSWORD

- **用途**: `tests/playwright/auth.setup.ts` でログインし、storageState を保存
- **テストユーザーの前提条件**:
  1. 上記の Supabase プロジェクトに登録済みであること
  2. メール確認が完了していること（Supabase Auth → Users で確認可能）
  3. `users` テーブルにも同 ID のレコードが必要
  4. CRUD テスト（logged-in 25 テスト中 19 テスト）を通すには `tenant_users` に `role='owner'` or `'admin'`、`status='active'` で登録が必要
  5. 詳細セットアップ手順: → `authenticated-test-prerequisites.md`
- **テストユーザーの作成方法**:
  ```bash
  # Supabase Dashboard → Authentication → Users → Add User
  # または Supabase CLI:
  supabase auth admin create-user \
    --email test-e2e@example.com \
    --password 'TestPassword123' \
    --email-confirm
  # その後 SQL でユーザー/テナント/メンバーシップを作成
  # → authenticated-test-prerequisites.md の「ワンライナーSQL」を参照
  ```

---

## GitHub Actions への設定方法

### 手順

1. GitHub リポジトリページを開く
2. **Settings** → **Secrets and variables** → **Actions** に移動
3. **New repository secret** をクリック
4. 各 Secret を登録:

```
Name: NEXT_PUBLIC_SUPABASE_URL
Value: https://xxxxx.supabase.co

Name: NEXT_PUBLIC_SUPABASE_ANON_KEY
Value: eyJ...

Name: SUPABASE_SERVICE_ROLE_KEY
Value: eyJ...

Name: TEST_USER_EMAIL
Value: test-e2e@example.com

Name: TEST_USER_PASSWORD
Value: TestPassword123
```

### 確認方法

設定後、PR を作成するか main に push して CI が走ることを確認:

```bash
# GitHub CLI で直近の workflow run を確認
gh run list --limit 5
gh run view <run-id>
```

---

## ローカルでの実行方法

### 前提

`.env.local` に Supabase 接続情報が設定済みであること（`.env.example` 参照）。

### テスト実行

```bash
# npm scripts（推奨）
npm run test:unit          # Unit テストのみ
npm run test:e2e           # Playwright 非認証テストのみ
npm run test:e2e:auth      # Playwright 認証済みテストのみ
npm run test:e2e:all       # Playwright 全テスト（setup + chromium + logged-in）
npm run test:cleanup       # e2e テストデータ一括削除

# 直接コマンド
npx playwright test --ui   # UI モードで確認
npx playwright show-report # レポート確認
```

### Unit テスト / Typecheck

```bash
npm run test:unit
npx tsc --noEmit
```

### e2e テストデータの cleanup

CRUD テストが残したデータ（`e2e_` prefix）を一括削除:

```bash
npx tsx scripts/cleanup-e2e-data.ts
```

Supabase 接続情報（`.env.local`）が必要。

---

## CI ジョブ構成

```
┌──────────┐    ┌─────────────┐
│ typecheck │    │ unit-tests  │
└────┬─────┘    └──────┬──────┘
     │                 │
     └────────┬────────┘
              │
     ┌────────▼────────┐
     │   playwright    │  ← Supabase secrets 必要
     │  (smoke tests)  │  ← TEST_USER_* 推奨
     └─────────────────┘
```

- **typecheck**: Secrets 不要（型チェックのみ）
- **unit-tests**: Secrets 不要（モックベース）
- **playwright**: Supabase secrets **必須**、TEST_USER_* は推奨（なくても非認証テストは動作）

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| Playwright ジョブで Next.js 起動失敗 | Supabase secrets 未設定 | 上記 3 つの Supabase secrets を設定 |
| 認証テストが全スキップ | TEST_USER_* 未設定 | TEST_USER_EMAIL / TEST_USER_PASSWORD を設定 |
| 認証テスト失敗（ログインできない） | テストユーザー未作成 or メール未確認 | Supabase Dashboard で確認 |
| typecheck / unit-tests は pass するが playwright だけ fail | Supabase 接続不可 | secrets の値が正しいか、Supabase プロジェクトがアクティブか確認 |
| `Error: page.goto: net::ERR_CONNECTION_REFUSED` | dev server 未起動 | CI では `webServer` が自動起動するはず。ローカルなら `npm run dev` を先に起動 |
