# Validation Summary — Minimal Design

## なぜ validation summary が必要か

draft builder や AI rewrite で form が埋まるようになったが、
必須項目（name など）が空のまま submit するケースがある。
submit 前に不足項目を視覚的に示すことで、エラー後の修正を減らす。

## review section との違い

| | Review Section | Validation Summary |
|---|---|---|
| 目的 | 入力内容の確認 | 不足項目の警告 |
| 表示 | 全項目の値一覧 | 不足項目のみ |
| 色 | グレー（neutral） | 赤/黄/緑 |
| 常時表示 | はい | はい |

## 今回の scope

- form state の主要6項目をチェック
- required（name, templateKey）が欠けていれば赤表示
- 推奨項目（summary, targetUsers, requiredFeatures, managedData）が欠けていれば黄表示
- 全項目 OK なら緑で「このまま作成できます」

## チェック項目

| 項目 | required | メッセージ |
|------|----------|-----------|
| name | yes | サービス名を入力してください |
| templateKey | yes | テンプレートを選択してください |
| summary | no | サービス概要があると生成精度が上がります |
| targetUsers | no | ターゲットユーザーの入力を推奨します |
| requiredFeatures | no | 機能が未選択です |
| managedData | no | 管理データが未選択です |

## isReady の判定

- required 項目がすべて入力済み → `isReady: true`
- required が1つでも欠けている → `isReady: false`
- 推奨項目が欠けていても `isReady: true`（黄表示）

## 将来の拡張候補

- **Clickable jump links**: 不足項目をクリックで該当フォームにスクロール
- **Schema-aware validation**: Zod schema から自動でチェック項目を生成
- **Per-template validation**: テンプレごとに必須項目を変える
- **Submit blocking**: isReady=false の場合に submit ボタンを disabled

## まだやらないこと

- jump links
- Zod 連携
- テンプレ別 validation
- submit blocking（Zod が最終的に止めるため）
