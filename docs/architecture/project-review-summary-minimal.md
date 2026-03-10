# Project Review Summary — Minimal Design

## なぜ review section が必要か

intake / draft builder / AI rewrite で form が自動的に埋まるようになった。
submit 前に「今何が入っているか」を一覧で確認できないと、
意図しない値でプロジェクトを作成してしまうリスクがある。

## 今回の scope

- form state の主要項目を submit ボタンの直前に一覧表示
- モーダルやタブは使わない。単純な review card
- 空欄は「未入力」とイタリックで表示
- template label は catalog から取得
- form が変われば自動で表示も変わる（React の再レンダリング）

## 表示項目

| 項目 | form field |
|------|-----------|
| テンプレート | templateKey (catalog label) |
| サービス名 | name |
| サービス概要 | summary |
| 解決したい課題 | problemToSolve |
| ターゲットユーザー | targetUsers |
| 管理データ | managedData |
| 必要な機能 | requiredFeatures |
| 課金方式 | billingModel |
| アフィリエイト | affiliateEnabled |

## 将来の拡張候補

- **Validation summary**: Zod の検証結果をレビューに統合
- **Diff against draft**: draft builder 適用前後の差分表示
- **Confirm modal**: submit 前に明示的な確認ダイアログ
- **Collapsible**: 長い項目は折りたたみ表示

## まだやらないこと

- validation 結果の統合
- 差分表示
- 確認モーダル
- 折りたたみ UI
