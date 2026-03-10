# Builder UI Flow Checklist

New Project → Project Detail → Generate → Progress → Summary の一連フローを手動確認するためのチェックリスト。

## A. New Project 画面 (`/projects/new`)

### かんたん入力
- [ ] 5問の intake questions が表示される
- [ ] 「どんなサービスを作りたいですか？」に入力 → form.summary / form.problemToSolve が更新される
- [ ] 「主なユーザーは誰ですか？」に入力 → form.targetUsers が更新される
- [ ] 「中心になるデータは何ですか？」で選択 → form.managedData / form.requiredFeatures が更新される
- [ ] 「月額課金は必要ですか？」で「はい」 → form.billingModel が subscription になる
- [ ] 「紹介制度は必要ですか？」で「はい」 → form.affiliateEnabled が true になる

### おすすめテンプレート
- [ ] intake 回答後に recommendation が青背景で表示される
- [ ] 1位〜3位がスコア順で出る
- [ ] 「選択」ボタンで templateKey が切り替わる
- [ ] template 選択で catalog summary card が表示される

### 下書きプレビュー + 下書きを作る
- [ ] intake 回答後にamber 背景のプレビューが表示される（埋まる項目一覧）
- [ ] 「下書きを作る」ボタンが有効になっている
- [ ] ボタン押下 → 空欄のみ埋まる（既存入力は上書きされない）
- [ ] 「N件の項目を自動入力しました」が表示される
- [ ] 全項目が埋まっている場合はボタンが disabled

### AIで整える
- [ ] 詳細設定を開く → 「基本情報（詳細）」セクションに「AIで整える」ボタンが表示される
- [ ] summary / problemToSolve / targetUsers に値がある状態でボタン押下
- [ ] 「整形中...」が表示され、完了後に整形された文が form に反映される
- [ ] 空欄のみの場合はボタンが disabled
- [ ] API エラー時は赤文字でエラー表示

### 作成前レビュー
- [ ] submit ボタンの上にレビューセクションが表示される
- [ ] テンプレート / サービス名 / サービス概要 / ターゲットユーザー / 管理データ / 必要な機能 / 課金方式 / アフィリエイト が表示される
- [ ] 空欄の項目は「未入力」とイタリックで表示される

### Validation Summary
- [ ] 全項目 OK → 緑「このまま作成できます」
- [ ] name 空欄 → 赤「作成前に確認してください」
- [ ] summary 空欄（name はある） → 黄「入力を推奨する項目があります」
- [ ] template guidance がテンプレに応じて indigo で表示される
  - MCA: 課金・アフィリエイトのヒント
  - RSV: 予約・店舗のヒント
  - CRM: 顧客・案件のヒント

### プロジェクトを作成
- [ ] サービス名を入力して「プロジェクトを作成」→ project detail に遷移
- [ ] name 未入力で submit → Zod エラーが表示され、詳細設定が開く

## B. Project Detail 画面 (`/projects/{id}`)

### Blueprint Preview
- [ ] Generate Blueprint ボタンが表示される
- [ ] Blueprint 未生成時は「まだ Blueprint は生成されていません。」
- [ ] Generate Blueprint 押下 → blueprint 生成
- [ ] Product Summary が青背景カードで表示される（name / problem / target / category / billing / affiliate）
- [ ] Entities / Roles / Screens が件数付きで一覧表示される
- [ ] 「Raw JSON を表示」で折りたたみ展開できる

### Blueprint Diff
- [ ] Blueprint が1件のみ → Diff セクションは表示されない
- [ ] Blueprint を再生成（2件以上） → Diff セクションが表示される
- [ ] added entities / removed entities が緑/赤バッジで出る
- [ ] product field の変更が `from → to` で出る
- [ ] 差分がない場合は「前回との差分はありません」

### Full Generate
- [ ] 「Generate Full Template」ボタンが押せる
- [ ] 押下で generation が開始される

### Generation Progress
- [ ] 生成中に青背景の progress セクションが表示される
- [ ] プログレスバーが completedCount/totalCount で進む
- [ ] 各ステップ（Blueprint / Implementation / Schema / API Design / File Split / Export）の status が更新される
- [ ] running ステップは `animate-pulse` で表示される
- [ ] completed → 緑バッジ、failed → 赤バッジ + エラー表示
- [ ] 完了後に progress セクションが消える

### Quality Progress
- [ ] Quality Gate ボタン押下 or Full Generate 完了後に自動実行
- [ ] orange 背景の progress セクションが表示される
- [ ] 各チェック（install / lint / typecheck / playwright）の status が更新される
- [ ] failed 時は stderr プレビューがインライン表示される
- [ ] passed → 緑、failed → 赤

### Generated Project Summary
- [ ] Generation / Quality の status バッジが表示される
- [ ] Blueprints / Impl Runs / Files の件数カードが表示される
- [ ] Pages / API Routes / Components / Tests / Lib/Utils / Other の内訳カードが表示される
- [ ] Category breakdown が折りたたみで表示される

### Generated Files
- [ ] ファイル一覧が表示される
- [ ] 各ファイルの file_path / file_category / language / version が見える
- [ ] content_text がコードブロックで表示される

## C. テンプレ別の最低確認

各テンプレで以下を1回通す:

### membership_content_affiliate
- [ ] intake: 「会員向けコンテンツサービス」→ core_domain: members_content → needs_billing: はい → needs_affiliate: はい
- [ ] recommendation 1位が MCA になる
- [ ] guidance に課金・アフィリエイトのヒントが出ない（条件充足済み）
- [ ] 作成 → Blueprint → Full Generate が通る

### reservation_saas
- [ ] intake: 「美容サロンの予約システム」→ core_domain: reservations → needs_billing: いいえ → needs_affiliate: いいえ
- [ ] recommendation 1位が RSV になる
- [ ] guidance に予約・店舗のヒントが出る
- [ ] 作成 → Blueprint → Full Generate が通る

### simple_crm_saas
- [ ] intake: 「営業チームの顧客管理」→ core_domain: customers_deals → needs_billing: いいえ → needs_affiliate: いいえ
- [ ] recommendation 1位が CRM になる
- [ ] guidance に顧客・案件のヒントが出る
- [ ] 作成 → Blueprint → Full Generate が通る

## D. Fail 判定条件

以下のいずれかが発生したら fail:

- [ ] UI セクションが表示されない（JS エラー等）
- [ ] ボタン押下で form state が更新されない
- [ ] polling で progress が更新されない
- [ ] helper が空配列や undefined を返してクラッシュ
- [ ] 既存の MCA / RSV / CRM baseline regression が壊れる
- [ ] typecheck エラーが発生する

## E. 推奨確認順

1. `npm run dev` でローカル起動
2. `/projects/new` にアクセス
3. セクション A を上から順に確認
4. project 作成 → project detail に遷移
5. セクション B を上から順に確認
6. セクション C のテンプレ別確認（最低1テンプレ）
7. `npx tsc --noEmit` でtypecheck
8. 必要なら既存 regression script を実行

## F. 確認後の推奨コミット手順

```bash
# 1. typecheck
npx tsc --noEmit

# 2. 変更確認
git status
git diff --stat

# 3. コミット
git add -A
git commit -m "Add Builder UI flow: intake → recommendation → draft → rewrite → review → validation → blueprint preview → diff → generation/quality progress → project summary"

# 4. タグ（任意）
git tag builder-ui-flow-v1
```
