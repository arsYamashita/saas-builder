# @saas/gov-doc-engine

官公庁ドキュメント解析の共通パッケージ。省庁・自治体のWebページを定期監視し、差分を Claude で構造化データに変換する。第一ユースケースは **助成金・補助金の新着/変更検知**。

## 3層アーキテクチャ

```
収集層 (collector/)   → 解析層 (analyzer/)        → 適用層 (application/)
YAML設定 + 差分検知      Claude構造化抽出              インターフェイスのみ
```

### 収集層 (`src/collector/`)

省庁/自治体URL・CSSセレクタを YAML で設定し（`sources.yaml`）、HTML を正規化してハッシュ比較する差分検知を行う。

- `types.ts` — `WatcherSourceSchema` / `WatcherConfigSchema`（Zod）
- `config-loader.ts` — YAML → 検証済み設定
- `normalize.ts` / `hash.ts` / `extract.ts` — HTML正規化・ハッシュ化・CSSセレクタ抽出。セレクタ不一致は空文字に黙変換せず `null` / `SelectorNotFoundError` として明示する（サイト改装で監視が「空 vs 空 = 変更なし」に固定されて静かに死ぬのを防ぐ、Codex P2 対応）
- `diff.ts` — `detectDiff()`: 正規化 + ハッシュ比較による変更検知。現行ページがセレクタ不一致なら `SelectorNotFoundError` を投げる。保存済みスナップショット側だけ不一致（セレクタ設定変更直後等）は初回観測として `changed: true`
- `watcher.ts` — `DocumentWatcher`（実サイトへの定期フェッチを実装。`FetchFn`/`WatcherStore` を DI するため**テストでは実サイトを一切叩かない**）、`startPolling()`（本番運用専用のスケジューラ、ユニットテスト対象外）。セレクタ不一致時は `WatcherAlertDeps`（AlertSink, `ai_api_silent_degradation_no_alert` と同経路）に `selector_missing` アラートを流し、不一致ページを snapshot 保存せず（直前の正常スナップショットを温存）、エラーを再スローする

公開 API（抜粋）:

```ts
detectDiff(params: { previousHtml: string | null; currentHtml: string; selector: string }): DiffResult
class DocumentWatcher {
  checkSource(source: WatcherSource): Promise<WatchResult>;
  checkAll(config: WatcherConfig): Promise<WatchResult[]>;
}
```

### 解析層 (`src/analyzer/`)

差分 → 影響条文/情報抽出 → 構造化 JSON を Claude API で行う。3件のKB教訓を最初から内蔵している。

| KB教訓 | 実装箇所 |
| --- | --- |
| `llm_api_unbounded_text_input` | `schema.ts` の `DiffAnalysisRequestSchema`（`previousText`/`currentText` に `.max(MAX_DIFF_TEXT_LENGTH)` = 100,000文字上限。saas-builder本体の `/api/documents/diff` と同じ上限を踏襲） |
| `claude_api_user_cost_limit_missing` | `usage-guard.ts`（`TenantUsageGuard` インターフェイス + `applyReservation()`/`reservationAdjustment()` 純関数 + `InMemoryTenantUsageGuard` 参照実装。ai-business-navigator の `reserve_api_usage()` ON CONFLICT アトミックカウンタ方式を移植・汎化。`claude-client.ts` の `analyzeDiff()` が呼び出し前に `reserve()`、成功後に `finalize()`、失敗時に `release()` を必ず呼ぶ。`finalize()` の実測合算は `totalTokensFromUsage()` で `cache_creation_input_tokens`/`cache_read_input_tokens` も null-safe に含める — input+output のみだと cache_control 使用時に過小計上され上限をすり抜けられる、Codex P2 対応） |
| `ai_api_silent_degradation_no_alert` | `alerts.ts`（`recordAiFailure()` + `FailureThresholdTracker`。day_care_web_app の `aiAlerts.ts` と同じ「直近1時間3回以上失敗でしきい値アラート」パターン。`claude-client.ts` は APIキー不在・呼び出し失敗・refusal・JSONパース失敗の**全経路**でこれを呼ぶ） |

公開 API（抜粋）:

```ts
DiffAnalysisRequestSchema.parse(...) : DiffAnalysisRequest
analyzeDiff(request: DiffAnalysisRequest, deps: AnalyzeDiffDeps): Promise<SubsidyExtraction>
createClaudeClientFromEnv(): ClaudeMessagesClient | null   // ANTHROPIC_API_KEY 未設定なら null
resolveClaudeModel(): string                                // config/models.ts 経由でモデルIDを解決
```

モデル ID は `src/config/models.ts` で一元管理し、呼び出し箇所に直書きしない（2026-07-06 の aria-app 「deprecated型番8ファイル直書き」事件を踏まえた設計）。既定値は `claude-opus-4-8`（`~/.claude/skills/claude-api/SKILL.md` の現行推奨に準拠）。環境変数 `GOV_DOC_ENGINE_CLAUDE_MODEL` で上書き可能。

### 適用層 (`src/application/`)

インターフェイスのみ。プロダクト側（navigator 等）のアダプタは薄く保つ。

```ts
interface SubsidyDetectionAdapter {
  onSubsidyDetected(params: { tenantId: string; watchResult: WatchResult; extraction: SubsidyExtraction }): Promise<void>;
  onAiFailureAlert(event: AiFailureEvent): Promise<void>;
}
```

## MVP スコープ（助成金検知）

監視対象3件を `src/collector/sources.yaml` に設定済み:

- ミラサポplus 補助金・支援施策検索（中小企業庁）
- J-Net21 支援情報ヘッドライン（中小企業基盤整備機構）
- 厚生労働省 事業主向け助成金のご案内

`src/__tests__/e2e-subsidy-detection.test.ts` が3ソースそれぞれについて fixture（`fixtures/*.html` の before/after）ベースで「差分検知 → 構造化JSON抽出」を通しで検証する（Claude 呼び出しは canned JSON を返すフェイククライアントに差し替え、実 API は一切呼ばない）。

## テスト

```bash
npm run test:unit -- packages/gov-doc-engine   # リポジトリルートから
# または
cd packages/gov-doc-engine && npx vitest run
```

72 tests、実サイト・実 Claude API 呼び出しなし（すべて DI したフェイク/モックで検証）。

## navigator 統合の次ステップ

1. **`WatcherStore` / `TenantUsageGuard` / `AlertSink` の実装**: ai-business-navigator 側で
   Supabase テーブル（`api_usage_monthly` 相当 + 監視対象HTML保存テーブル + `system_alerts` 相当）に対する
   実装を用意し、`InMemoryTenantUsageGuard` 等の参照実装を置き換える。
2. **`SubsidyDetectionAdapter` の実装**: 検知結果をテナント向け通知（LINE/メール等、navigator の既存通知基盤）に配線する薄いアダプタを1本書く。
3. **収集層のスケジューリング**: `startPolling()` を Supabase Edge Function の cron トリガー or 既存の Cloud Scheduler ジョブから呼び出す形で本番投入する（`checkIntervalMinutes` は `sources.yaml` で調整可能）。
4. **セレクタの実サイト検証**: `sources.yaml` の `selector` は推定値。本番投入前に実サイトのDOM構造を確認し、必要なら調整する。
5. **月次トークン上限の人間判断**: `DEFAULT_MONTHLY_TOKEN_LIMIT`（2,000,000 tokens）は他プロジェクト同様の仮置き。実コスト許容量に基づくプロダクト判断が別途必要。
6. **第二ユースケースへの拡張**: `WatcherSource.category` に `regulation` / `notice` を既に用意済み。介護報酬改定等の法改正検知（day_care_web_app 隣接領域）へ展開する場合は、`analyzer/schema.ts` に新しい抽出スキーマ（例: `RegulationChangeExtractionSchema`）を追加し、`analyzeDiff()` 自体は再利用できる設計にしてある。
