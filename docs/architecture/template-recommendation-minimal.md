# Template Recommendation — Minimal Design

## 概要

New Project フォームの入力内容に基づき、おすすめテンプレートをルールベースで提案する。

## なぜ最初から AI 推薦にしないか

1. テンプレは3本しかない。ルールで十分分類できる
2. AI 呼び出しのレイテンシがフォーム UX を損なう
3. ルールの方がデバッグしやすく、挙動が予測可能
4. AI 推薦は将来テンプレが増えた時に検討する

## 現在の Scoring Basis

`lib/templates/template-recommendation.ts` のルール:

| トリガー | 対象テンプレ | Weight |
|---------|-------------|--------|
| affiliateEnabled=true | MCA | 3 |
| billingModel=subscription/hybrid | MCA | 2 |
| features に member/content | MCA | 2 |
| テキストにサロン/会員/コンテンツ | MCA | 1 |
| features に reservation/booking | RSV | 3 |
| features に service_management | RSV | 2 |
| テキストに予約/店舗/美容 | RSV | 1 |
| features に deal | CRM | 3 |
| features に customer + task | CRM | 2 |
| テキストに CRM/営業/顧客管理/商談 | CRM | 1 |
| billing=none かつ affiliate=false | CRM | 1 |

スコア合計が高い順に最大3件を返す。スコア0のテンプレは返さない。

## UI 表示

- 「おすすめテンプレート」セクション（青背景）
- 1位〜3位を表示（2位以降は薄く）
- 各推薦に理由を表示
- 「選択」ボタンで template を切り替え可能
- 現在選択中のテンプレには「(選択中)」を表示
- **自動で templateKey を強制変更しない**

## 将来の拡張候補

- **Usage analytics**: 実際の生成成功率から weight を調整
- **LLM recommendation**: summary をLLMに渡して最適テンプレを判定
- **Question flow**: 対話形式でテンプレを絞り込む
- **テンプレ比較表**: 複数テンプレを横並びで比較

## まだやらないこと

- AI/LLM 呼び出し
- 利用統計ベースの weight 調整
- 対話型フロー
- テンプレの自動切り替え
