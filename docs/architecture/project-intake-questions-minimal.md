# Project Intake Questions — Minimal Design

## なぜ質問フローを入れるか

New Project フォームは項目が多く、初めてのユーザーにとって何を入力すべきか分かりにくい。
5つの質問に答えるだけで主要なフォーム項目が埋まり、template recommendation も改善される。

## 今回は Fixed Questions

5問の固定質問。AI による動的生成はしない。

| # | 質問 | 対応する form field |
|---|------|-------------------|
| 1 | どんなサービスを作りたいですか？ | summary, problemToSolve |
| 2 | 主なユーザーは誰ですか？ | targetUsers |
| 3 | 中心になるデータは何ですか？ | managedData, requiredFeatures |
| 4 | 月額課金は必要ですか？ | billingModel |
| 5 | 紹介制度は必要ですか？ | affiliateEnabled |

## Recommendation との接続

intake の回答が form state を更新すると、recommendation の入力も変わる:

```
intake 回答 → intakeToFormHints() → form state 更新
                                         ↓
                               getRecommendations(form) → UI 表示
```

例: 「中心になるデータ = 顧客・案件・タスク」を選ぶと
→ managedData = ["customers", "deals", "tasks"]
→ recommendation が simple_crm_saas を高スコアで返す

## Form が Source of Truth

intake は form の入力補助。最終的なデータは form state が正本。

- intake で埋めた値は、詳細フォームで上書き可能
- 詳細フォームで直接編集しても intake には逆反映しない
- submit 時は form state のみを送信

## UI 構成

```
[かんたん入力]      ← intake questions (常に表示)
[テンプレート]      ← selector + recommendation + catalog card
[サービス名]        ← 常に表示
[詳細設定を開く]    ← トグル
  [基本情報（詳細）]  ← summary, targetUsers, etc.
  [機能要件（詳細）]  ← billingModel, affiliate, etc.
[プロジェクトを作成]
```

## 将来の拡張候補

- **Dynamic follow-up**: 回答に応じて追加質問を出す
- **AI-generated questions**: プロジェクト概要から質問を自動生成
- **Vertical-specific intake**: テンプレごとに質問セットを変える
- **Conversational UI**: チャット形式での intake

## まだやらないこと

- AI 質問生成
- テンプレごとの質問分岐
- チャット形式 UI
- intake 回答の永続化
- 詳細フォームから intake への逆反映
