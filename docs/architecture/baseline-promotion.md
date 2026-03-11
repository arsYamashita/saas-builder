# Baseline Promotion — 設計メモ

## 概要

承認された generation result を baseline として昇格し、テンプレの運用資産にする。

## DB

`supabase/migrations/0010_baseline_promotions.sql`

```sql
create table baseline_promotions (
  id uuid primary key,
  project_id uuid references projects(id),
  generation_run_id uuid references generation_runs(id),
  template_key text not null,
  baseline_tag text not null,
  version_label text not null,
  status text default 'draft',
  promoted_at timestamptz default now(),
  promoted_by uuid
);
```

## baseline_tag 命名規則

`baseline/{template_short}-{version_label}`

例:
- `baseline/mca-v1`
- `baseline/rsv-green-v2`
- `baseline/crm-v1728504000000`

## 昇格フロー

1. generation run が completed
2. レビューで approved
3. 「Baseline に昇格」ボタン → promote API
4. baseline_promotions に記録
5. generation_runs.baseline_tag / promoted_at を更新

## 既存 baseline との関係

既存の `tests/baselines/*.json` は regression spec として残る。
baseline_promotions は DB 上の昇格履歴で、将来的に:
- promoted baseline から regression spec を自動生成
- baseline 間の diff/compare
- scoreboard 上での baseline version 追跡

## 将来

- 昇格時に tests/baselines/ への自動書き出し
- baseline 間 diff
- scoreboard 連携（実装済み）
- promoted → active の 2段階昇格
