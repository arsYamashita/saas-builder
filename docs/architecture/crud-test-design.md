# CRUD Playwright テスト設計メモ

認証済み状態でのデータ操作（CRUD）テストの設計方針。

## 前提条件

### 認証

- `auth.setup.ts` の storageState を使用（`logged-in` プロジェクト）
- テストユーザーはテナントに所属し `admin` ロールが必要
  - `/content`, `/plans` は `requireTenantRole("admin")` を使用

### テストデータ戦略

**採用: Create → Update → verify 方式**

DELETE エンドポイント実装済み。テスト内で Create → Update → Delete の完全サイクルを実行。

- `uniqueName()` で衝突しない一意なテスト名を生成（`e2e_content_<timestamp>_<rand>`）
- テスト自身が作成したデータを最後に削除するため、残存データは最小限
- テスト失敗時の残存データは `scripts/cleanup-e2e-data.ts` で一括掃除可能

### テストユーザーの初期状態

```
テストユーザー:
  - email: TEST_USER_EMAIL
  - role: admin (テナントメンバーシップ)
  - テナント: 1つ以上所属
  - 既存コンテンツ: 0 でも可（create テストが最初に走る）
  - 既存プラン: 0 でも可
```

## 実装済みテスト

### Content CRUD (`content-crud.auth.spec.ts`)

```
test.describe.serial("Content CRUD flow"):
  1. /content にログイン済みでアクセスできる
  2. "New Content" リンクで /content/new に遷移できる
  3. タイトル・本文を入力して「作成する」→ /content にリダイレクト → 一覧に反映
  4. 作成したアイテムが一覧に存在する（独立確認）
  5. Edit リンクで編集画面に遷移 → タイトル変更 →「更新する」→ 一覧に反映
  6. 更新後のタイトルが一覧に存在し、旧タイトルが消えている
  7. Delete ボタンで削除 → confirm → 一覧から消える
  8. 削除済みコンテンツが一覧に存在しないことを独立確認
```

**フォームセレクタ**:
- `page.getByRole("textbox").first()` — title input
- `page.locator("textarea")` — body textarea
- `page.getByRole("button", { name: "作成する" })` — submit (new)
- `page.getByRole("button", { name: "更新する" })` — submit (edit)

> 注: フォームは `<label>` に `htmlFor` がないため `getByLabel` は使用不可。位置ベースセレクタを使用。

### Plans CRUD (`plans-crud.auth.spec.ts`)

```
test.describe.serial("Plans CRUD flow"):
  1. /plans にログイン済みでアクセスできる
  2. "New Plan" リンクで /plans/new に遷移できる
  3. プラン名・説明を入力して「作成する」→ /plans にリダイレクト → 一覧に反映
  4. 作成したプランが一覧に存在する（独立確認）
  5. Edit リンクで編集画面に遷移 → 名前変更 →「更新する」→ 一覧に反映
  6. 更新後の名前が一覧に存在し、旧名前が消えている
  7. Delete ボタンで削除 → confirm → 一覧から消える
  8. 削除済みプランが一覧に存在しないことを独立確認
```

**フォームセレクタ**:
- `page.getByRole("textbox").first()` — name input
- `page.getByRole("textbox").nth(1)` — description input
- `page.getByRole("button", { name: "作成する" })` — submit (new)
- `page.getByRole("button", { name: "更新する" })` — submit (edit)

## 共通ヘルパー (`tests/playwright/helpers/test-data.ts`)

```typescript
uniqueName(prefix: string): string  // 一意なテスト名を生成
hasAuthCredentials(): boolean       // TEST_USER_* の存在チェック
```

## CI での前提条件

認証済み CRUD テストを CI で実行するには:

1. **GitHub Secrets** が設定済みであること（→ `docs/runbooks/github-actions-secrets.md`）
2. **テストユーザーが Supabase 上に存在すること**:
   - メール確認済み
   - テナントに `admin` ロールで所属
3. **テナントデータの初期状態**:
   - コンテンツ・プランが 0 件でもテストは通る
   - 既存データがあっても `uniqueName` 衝突は実質発生しない

### 不安定要因

| 要因 | リスク | 対策 |
|---|---|---|
| テストユーザー未作成 | テスト全スキップ | Supabase Dashboard で事前作成 |
| テナント未所属 | content/plans で 403 | テナント + メンバーシップを事前作成 |
| テスト残存データの蓄積 | 一覧が長くなる | 定期手動掃除 or cleanup スクリプト |
| ネットワーク遅延 | タイムアウト | timeout 設定で吸収（10-15s） |
| 並列実行でのデータ競合 | CI は workers:1 | serial 実行で回避 |

## 今後の拡張

- Visibility / Published 切り替えテスト
- Content type 切り替えテスト
- Plan status 切り替えテスト
- エラーケース（空タイトルで保存 → バリデーションエラー表示）
