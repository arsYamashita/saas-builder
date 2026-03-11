# CI 初回実行チェックリスト

GitHub Actions CI を初めて有効化する際の手順。

---

## 前提

- GitHub リポジトリに push 済み
- Supabase プロジェクト（ステージング推奨）が稼働中
- テストユーザーが作成済み（→ `authenticated-test-prerequisites.md`）

---

## Step 1: GitHub Secrets 設定

Repository → Settings → Secrets and variables → Actions → New repository secret

| Secret | 必須 | 設定値 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **必須** | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **必須** | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | **必須** | `eyJ...` |
| `TEST_USER_EMAIL` | 推奨 | `test-e2e@example.com` |
| `TEST_USER_PASSWORD` | 推奨 | `(パスワード)` |

設定確認:

```bash
# Secrets が正しく登録されたか確認（値は表示されない）
gh secret list
```

詳細: → `github-actions-secrets.md`

## Step 2: CI トリガー

```bash
git checkout -b ci/initial-test
git commit --allow-empty -m "ci: trigger initial workflow run"
git push -u origin ci/initial-test
gh pr create --title "CI initial run" --body "Testing CI pipeline"
```

## Step 3: 結果確認

```bash
gh run list --limit 5
gh run view <run-id>
# ログを見る:
gh run view <run-id> --log-failed
```

### 成功判定

| ジョブ | 成功条件 |
|---|---|
| **TypeScript Check** | exit 0（エラー行なし） |
| **Unit Tests** | 142 tests passed, 0 failed |
| **Playwright Smoke Tests** | 下記参照 |

**Playwright 成功パターン**:

| Secrets 状態 | 期待結果 |
|---|---|
| Supabase 3 つ + TEST_USER_* 2 つ全設定 | **44 passed** (setup 1 + chromium 18 + logged-in 25) |
| Supabase 3 つのみ（TEST_USER_* なし） | **19 passed**, 25 skipped (chromium 18 + setup 1 のみ実行) |
| Supabase secrets なし | **playwright ジョブ全体が fail**（Next.js 起動不可） |

## Step 4: 失敗時の切り分け

以下の順で確認する:

### 4-1. typecheck が失敗

```
原因: 型エラー
確認: ログの "error TS" 行
対処: ローカルで npx tsc --noEmit を実行して同じエラーを再現
```

### 4-2. unit-tests が失敗

```
原因: テストコードの問題（外部依存なし）
確認: ログのスタックトレース
対処: ローカルで npm run test:unit を実行
特徴: Supabase secrets は不要なので環境起因ではない
```

### 4-3. playwright — Next.js 起動失敗

```
症状: "Error: page.goto: net::ERR_CONNECTION_REFUSED" が大量
原因: Supabase secrets 未設定 or 値が不正 → Next.js dev server が起動できない
確認: ログの最初の方に build/起動エラーがないか
対処: Secrets の値が正しいか gh secret list で確認
```

### 4-4. playwright — auth.setup.ts 失敗

```
症状: setup プロジェクトが fail
原因: TEST_USER_* の認証情報でログインできない
確認:
  - TEST_USER_EMAIL / TEST_USER_PASSWORD が Secrets に登録されているか
  - Supabase Dashboard → Authentication → Users でメール確認済みか
  - パスワードが一致するか
対処: テストユーザーを再作成
```

### 4-5. playwright — logged-in テストが全 skip

```
症状: 25 skipped
原因: TEST_USER_EMAIL / TEST_USER_PASSWORD が Secrets に未登録
確認: gh secret list で TEST_USER_EMAIL が表示されるか
対処: Secrets に追加
注意: これは「エラー」ではなく「未設定」。非認証テスト 19 が pass していれば部分成功
```

### 4-6. playwright — CRUD テスト失敗

```
症状: content-crud / plans-crud の特定テストが fail
原因:
  a. tenant_users にレコードがない（"Active tenant membership not found"）
  b. role が admin 未満（"Forbidden"）
  c. users テーブルにレコードがない（"User profile not found"）
確認: playwright-report アーティファクトをダウンロードしてスクリーンショット確認
対処: authenticated-test-prerequisites.md の「ワンライナーSQL」を実行
```

### 4-7. playwright — 特定テストが flaky

```
症状: 再実行すると pass する
原因: タイムアウト or dev server の初期化遅延
確認: CI は retries: 2 で設定済み。2 回リトライしても fail するなら本物のバグ
対処: テストの timeout を延長するか、waitForURL のパターンを見直す
```

## Step 5: アーティファクト確認

```bash
# workflow run のアーティファクトをダウンロード
gh run download <run-id> -n playwright-report

# ローカルでレポートを開く
npx playwright show-report playwright-report
```

14 日間保存。スクリーンショット・トレースが含まれる（on-first-retry）。

## Step 6: Cleanup

```bash
# テストデータ掃除（CRUD テスト失敗時のみ必要）
npm run test:cleanup
```

### いつ cleanup するか

| 状況 | cleanup 必要 |
|---|---|
| 全テスト pass | **不要**（テスト自身が delete する） |
| CRUD テストが途中で fail | **要**（create はしたが delete されていない） |
| CI 定期実行（毎日） | 週 1 程度で十分 |
| ローカルで繰り返しテスト | 都度 or 気になったら |

## Step 7: ブランチ保護ルール（推奨）

CI が安定したら → `branch-protection.md` 参照
