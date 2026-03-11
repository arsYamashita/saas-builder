# Generated Result Approval — 設計メモ

## 概要

Blueprint approval と同様に、generation run の結果もレビュー可能にする。
承認 → baseline 昇格のフローの下地。

## DB 変更

`supabase/migrations/0009_generation_run_metadata.sql`

```sql
alter table generation_runs
  add column provider text,
  add column model text,
  add column review_status text not null default 'pending',
  add column reviewed_at timestamptz,
  add column promoted_at timestamptz,
  add column baseline_tag text;
```

## review_status

- `pending`: 初期状態
- `approved`: 承認済み（baseline 昇格可能）
- `rejected`: 却下

## API

| Endpoint | Method | 役割 |
|----------|--------|------|
| `/api/generation-runs/[runId]/approve` | POST | 承認 |
| `/api/generation-runs/[runId]/reject` | POST | 却下 |
| `/api/generation-runs/[runId]/promote` | POST | Baseline 昇格 |

## UI

Generation Runs セクション内の各 run カードに:
- 未レビュー: 「承認」「却下」ボタン
- 承認済み: 「承認済み」バッジ + 「Baseline に昇格」ボタン
- 却下: 「却下」バッジ
- 昇格済み: baseline tag バッジ

## generate-template との関係

approval は generate 実行のブロック条件にはまだしない。

## Step Metadata によるデバッグ・レビュー

Generation Runs セクションの各ステップに以下を表示:
- provider / model バッジ
- 所要時間 (秒)
- expectedFormat
- warning / error カウント（0超のみ表示）
- resultSummary（折りたたみ details 内）

これにより、approve/reject 判断時にステップごとの AI 実行詳細を確認できる。

## Step-Level Review

### 保存構造

step review status は `steps_json[].meta` に保存する（別テーブル不要）。

```typescript
// types/generation-run.ts
type GenerationStepMeta = {
  // ... 既存フィールド ...
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewedAt?: string;  // ISO 8601
};
```

### API

| Endpoint | Method | Body | 役割 |
|----------|--------|------|------|
| `/api/generation-runs/[runId]/review-step` | POST | `{ stepKey, action }` | ステップ単位の承認/却下 |

- `action`: `"approved"` or `"rejected"`
- completed な step のみレビュー可能
- completed な run のみ対象

### UI

各 step 行の Review 列:
- 未レビュー: OK / NG ボタン
- 承認済み: 緑 OK バッジ
- 却下: 赤 NG バッジ
- 未完了 step: `-` 表示

Step Review Summary 行（テーブル上部）:
- `N approved / M rejected / K/L reviewed`

### run-level との関係

- step-level review は run-level review と連動する
- 全 step approved → run.review_status を自動で "approved" に更新
- rerun / invalidation で all-approved が崩れた場合 → run.review_status を自動で "pending" に戻す
- step が rejected でも run を自動 reject はしない（手動判断に委ねる）
- 手動の run approve/reject API は引き続き有効（上書き可能）

### auto-approve ルール

| step 状態 | run.review_status (現在) | 自動更新 |
|-----------|-------------------------|---------|
| 全 step approved | pending / rejected | → approved |
| 全 step approved | approved | 変更なし |
| 1つ以上未承認 | approved | → pending |
| 1つ以上未承認 | pending / rejected | 変更なし |

### Promotion 条件

Baseline 昇格には**両方**が必要:
1. `generation_runs.review_status === "approved"`
2. 最新 `blueprints.review_status === "approved"`（project_id で version DESC の先頭）

どちらか不足している場合は 400 エラー（不足理由を明示）。
UI でも Blueprint 未承認時は「昇格不可（Blueprint 未承認）」表示。

純粋関数 `checkPromotionEligibility(runStatus, bpStatus)` でテスト可能。

### Reject 理由メモ

- `review-step` API に `reason?: string` フィールド追加
- `action === "rejected"` のとき `meta.rejectReason` に保存
- `action === "approved"` のとき `rejectReason` をクリア
- 理由なし reject も可能（reason 省略時は既存の rejectReason を保持）
- UI: NG ボタン押下時に `window.prompt()` で理由入力、NG バッジ横に truncated 表示

## Step-Level Rerun

### 概要

rejected な step を個別に再実行できる最小安全版。

### API

| Endpoint | Method | Body | 役割 |
|----------|--------|------|------|
| `/api/generation-runs/[runId]/rerun-step` | POST | `{ stepKey }` | rejected step の再実行 |

### Rerunnable Steps

| stepKey | taskKind | route | rerunnable |
|---------|----------|-------|:----------:|
| blueprint | intake+blueprint | generate-blueprint | NO (composite) |
| implementation | implementation | generate-implementation | YES |
| schema | schema | generate-schema | YES |
| api_design | api_design | generate-api-design | YES |
| split_files | file_split | split-run-to-files | YES |
| export_files | - | export-files | NO (no AI) |

### 動作フロー

1. step.status = "running" に更新（UI に反映）
2. 対応する route を `postInternal()` パターンで呼び出し
3. 成功時: step meta を新しい結果で更新、`reviewStatus` → `"pending"`、`rerunAt` 記録
4. 失敗時: step を `"completed"` に戻し、`rerunError` を meta に記録

### UI

- rejected step にのみ Re-run ボタン（amber）を表示
- rerun 済みの step は step name 横に `(rerun)` インジケータ表示

### 制約事項

- blueprint rerun は composite のため対象外（Full Generation で対応）
- export_files は AI step がないため対象外

## Downstream Invalidation

### 概要

step rerun 後、downstream の step review status を自動的に invalidate する。
これにより、古い結果に基づく approve が残ることを防ぐ。

### Step 依存グラフ

```
blueprint ──→ implementation ──→ split_files
    │                              ↑
    ├──→ schema ──→ api_design ────┘
    │        └──→ split_files
    └──→ api_design
    └──→ split_files
```

export_files は AI step がないため、グラフに含まない。

### 直接依存テーブル

| stepKey | downstream |
|---------|------------|
| blueprint | implementation, schema, api_design, split_files |
| implementation | split_files |
| schema | api_design, split_files |
| api_design | split_files |
| split_files | (none) |
| export_files | (none) |

### Invalidation ルール

1. rerun 対象の step 自身: `reviewStatus` → `"pending"`, `rerunAt` 記録, `invalidatedAt`/`invalidatedByStep` クリア
2. downstream steps (transitive): completed かつ reviewStatus が pending 以外の場合のみ:
   - `reviewStatus` → `"pending"`
   - `reviewedAt` → クリア
   - `invalidatedAt` → 現在時刻
   - `invalidatedByStep` → rerun した stepKey
3. step.status や result data は変更しない（レビューメタデータのみ）

### Meta フィールド

```typescript
type GenerationStepMeta = {
  // ... 既存フィールド ...
  invalidatedAt?: string;      // ISO 8601 — invalidate された時刻
  invalidatedByStep?: string;  // invalidation の原因 stepKey
  rerunError?: string;         // rerun 失敗時のエラーメッセージ
};
```

### UI 表示

- invalidated な step: amber "stale" バッジ + `(${invalidatedByStep} rerun)` 表示
- rerunError がある step: 赤い truncated エラーテキスト

### areAllStepsApproved / computeRunReviewStatus

- `areAllStepsApproved()`: 全 completed step が approved かどうかを判定する純粋関数
- `computeRunReviewStatus()`: step 状態と現在の run.review_status から自動更新要否を判定
- review-step / rerun-step 両 API で使用

### 将来

- partial regenerate（複数 step を一括 rerun）
- approved blueprint + approved generation のみ promote 可能（blueprint 側はまだ未連携）
- reject 理由メモ
- reviewer の記録
- provider 横断の比較ビュー（同じステップを別 provider で比較）
