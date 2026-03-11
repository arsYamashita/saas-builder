# Template Scoreboard — 設計メモ

## 概要

テンプレごとの運用指標を集計し、factory の健全性を可視化する。

## 集計指標

| 指標 | 説明 | 集計方法 |
|------|------|----------|
| Green Rate | 生成成功率 | completed / total runs × 100 |
| Quality Pass Rate | 品質通過率 | 未集計（要 generation_run_id join） |
| Approved | 承認済み件数 | review_status = approved |
| Rejected | 却下件数 | review_status = rejected |
| Promoted | 昇格済み件数 | promoted_at is not null |
| Latest Baseline | 最新 baseline tag | promoted runs の最新 |
| Last Approved | 最終承認日時 | reviewed_at の最新 |
| Last Promoted | 最終昇格日時 | promoted_at の最新 |

## API

`GET /api/scoreboard`

generation_runs + quality_runs + template_registry から集計。

## UI

`/scoreboard` ページ:
- テンプレごとにカード表示
- 4つの主要指標: Green Rate, Quality Pass, Approved, Promoted
- baseline tag バッジ
- タイムスタンプ

## まだ出せていない指標

- Quality Pass Rate（generation_run_id join が必要）
- Regression Pass Rate（regression test 実行結果の集計）
- Cost per generation
- Average generation time
- File count trend

## factory 完成に向けた残ステップ

1. Quality Pass Rate の集計実装
2. Regression test 結果の DB 保存 + scoreboard 連携
3. Cost tracking の導入
4. 自動 regression check → scoreboard 更新
5. Dashboard からの scoreboard リンク
