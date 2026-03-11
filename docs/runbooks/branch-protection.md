# Branch Protection 設定ガイド

CI が安定稼働した後に `main` ブランチを保護する設定。

---

## 必須ステータスチェック

CI の 3 ジョブを必須にする:

| ジョブ名（GitHub Actions 表示名） | 内容 |
|---|---|
| `TypeScript Check` | `npx tsc --noEmit` |
| `Unit Tests` | `npm run test:unit` (vitest) |
| `Playwright Smoke Tests` | `npx playwright test` |

## 設定手順

### GitHub UI

1. Repository → **Settings** → **Branches**
2. **Add branch protection rule** をクリック
3. Branch name pattern: `main`
4. 以下にチェック:
   - [x] **Require a pull request before merging**
     - [x] Require approvals: 1（任意）
   - [x] **Require status checks to pass before merging**
     - [x] **Require branches to be up to date before merging**
     - Status checks を検索して追加:
       - `TypeScript Check`
       - `Unit Tests`
       - `Playwright Smoke Tests`
   - [x] **Do not allow bypassing the above settings**（推奨）
5. **Create** をクリック

### GitHub CLI

```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["TypeScript Check","Unit Tests","Playwright Smoke Tests"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null
```

## 推奨オプション設定

| 設定 | 推奨値 | 理由 |
|---|---|---|
| Require approvals | 1 | 1 人チーム以外ではレビュー必須 |
| Require up to date | ON | マージ前に最新 main との整合を保証 |
| Include administrators | ON | 管理者もルールを回避できない |
| Allow force pushes | OFF | 履歴改変を防止 |
| Allow deletions | OFF | ブランチ削除を防止 |

## 段階的導入

1. **Phase 1**: `TypeScript Check` + `Unit Tests` のみ必須
   - Playwright は Supabase 依存があるため、Secrets 設定前は fail する可能性
2. **Phase 2**: Secrets 設定 + テストユーザー作成後に `Playwright Smoke Tests` も必須化
3. **Phase 3**: approval 必須化（チーム拡大時）
