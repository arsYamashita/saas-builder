# Provider Adapter Layer — 設計メモ

## 概要

外部 AI プロバイダー（Gemini, Claude, OpenAI 等）を統一インターフェースで扱うためのアダプター層。

## 構成

```
lib/providers/
├── provider-interface.ts  # 型定義: TaskKind, ProviderAdapter, ProviderRawResult
├── gemini.ts              # GeminiAdapter
├── claude.ts              # ClaudeAdapter
├── openai.ts              # OpenAIAdapter (stub)
├── result-normalizer.ts   # JSON/text/files 正規化 + バリデーション
├── task-router.ts         # TaskKind → Provider 解決 + 実行
├── template-scoreboard.ts # テンプレ運用指標の集計
└── index.ts               # Barrel export
```

## TaskKind と ExpectedFormat

| TaskKind | ExpectedFormat | Primary | Fallback |
|----------|---------------|---------|----------|
| intake | text | gemini | claude |
| blueprint | json | gemini | claude |
| brief_rewrite | json | gemini | claude |
| implementation | text | claude | - |
| schema | text | claude | - |
| api_design | text | claude | - |
| file_split | files | claude | - |
| ui_generation | files | claude | - |
| quality_fix | files | claude | - |
| regression_repair | files | claude | - |

## generate-template 6ステップとの対応

| Pipeline Step | TaskKind | 移行状態 |
|--------------|----------|----------|
| generate-blueprint | intake + blueprint | executeTask() 経由 |
| generate-implementation | implementation | executeTask() 経由 |
| generate-schema | schema | executeTask() 経由 |
| generate-api-design | api_design | executeTask() 経由 |
| split-run-to-files | file_split | executeTask() 経由 |
| export-files | (なし) | AI なし（移行不要） |

## その他の AI 呼び出し

| API Route | TaskKind | 移行状態 |
|-----------|----------|----------|
| rewrite-brief | brief_rewrite | executeTask() 経由 |

## 移行状態

- **全6ステップ + rewrite-brief**: executeTask() 経由に移行完了
- **export-files**: AI 呼び出しなし（移行不要）
- **旧 lib/ai/* 直接呼び出しモジュール**: 8ファイル削除済み
- **残存 lib/ai/***: blueprint-normalizer, build-prompt-with-rules, template-prompt-resolver（route から利用中）

## Step Metadata

各 AI ステップの実行結果に `_meta` を付与し、orchestrator（generate-template）が `steps_json` に記録する。

### GenerationStepMeta フィールド

| Field | Type | 説明 |
|-------|------|------|
| taskKind | string | 実行した TaskKind (e.g. "schema", "intake+blueprint") |
| provider | string | 使用した provider ID (e.g. "gemini", "claude") |
| model | string | 使用したモデル名 |
| expectedFormat | string | 期待するフォーマット (json/text/files) |
| durationMs | number | AI 呼び出し所要時間 (ms) |
| warningCount | number | バリデーション警告数 |
| errorCount | number | バリデーションエラー数 |
| resultSummary | string | 結果の概要 (先頭200文字 or キー数 etc.) |

### データフロー

```
route (executeTask → buildStepMeta) → _meta in JSON response
  → postInternal() captures _meta
  → updateGenerationStep(runId, stepKey, status, meta)
  → steps_json に保存
```

### source フィールド統一

- `generated_files.source`: string 型（provider ID をそのまま保存）
- `implementation_runs.source`: `result.raw.provider` を渡す（デフォルト "claude"）

### Step Review との統合

step meta に `reviewStatus` / `reviewedAt` を追加。
step 単位の承認/却下により、provider 品質の step レベル評価が可能になる。
将来的には rejected step のみ別 provider で再生成する partial regenerate への拡張ポイント。

## Result Normalizer

- `stripCodeFences`: コードフェンス除去
- `extractJsonFromText`: テキストからJSON抽出（フェンス対応、テキスト埋め込み対応）
- `parseFileBlocks`: ファイルブロック解析（JSON配列 or マークダウン形式）
- `normalizeResult`: format に応じて正規化
- `validateNormalizedResult`: 正規化結果のバリデーション

## 将来の拡張

- provider ごとの retry / rate limit 制御
- cost tracking per generation
- provider health check / circuit breaker
- model version pinning

## まだやらないこと

- provider 横断の A/B テスト
- cost 集計
- provider health monitoring
