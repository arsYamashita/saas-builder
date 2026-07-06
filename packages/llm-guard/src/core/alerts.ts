/**
 * 上限超過アラート機構。
 *
 * 既存3実装（gov-doc-engine / aria-for-salon-app / ai-business-navigator）は
 * いずれも上限超過を `console.error` へのログ出力のみで処理しており
 * （aria-for-salon-app の `checkAndRecordClaudeUsage` 等）、専用の
 * アラート送出インターフェイスは持っていなかった。指示書2026-07-06_025の
 * 「超過アラート」要件を満たすため、本パッケージで新規に定義する。
 *
 * gov-doc-engine には既に AI 呼び出し失敗（API キー不在・パース失敗等）用の
 * 別の `AlertSink`（packages/gov-doc-engine/src/analyzer/alerts.ts）が
 * 存在するが、あちらは「AI 呼び出し失敗」というイベント種別を扱うもので、
 * 本モジュールの「コスト上限超過」とは意味的に異なる別軸のため統合しない
 * （無理に共用インターフェイスにすると型が肥大化し、どちらの呼び出し元も
 * 使わないフィールドを埋める羽目になる）。
 *
 * KB教訓 api_error_message_internal_leak: used/limit/tenantId 等の内部詳細は
 * サーバーログ（またはこの AlertSink 経由の内部通知チャネル）にのみ流し、
 * エンドユーザー向けレスポンスには含めないこと。呼び出し元（HTTP ハンドラ等）
 * の責務。
 */

export interface QuotaExceededEvent {
  tenantId: string;
  /** どちらの軸で上限を超えたか。両方超えている場合は "monthly" を優先して報告する。 */
  scope: "daily" | "monthly";
  used: number;
  limit: number;
  estimatedTokens: number;
  timestamp: Date;
}

export interface AlertSink {
  recordQuotaExceeded(event: QuotaExceededEvent): Promise<void>;
}

/** テスト・簡易用途向けのインメモリ AlertSink。 */
export class InMemoryAlertSink implements AlertSink {
  readonly quotaExceededEvents: QuotaExceededEvent[] = [];

  async recordQuotaExceeded(event: QuotaExceededEvent): Promise<void> {
    this.quotaExceededEvents.push(event);
  }
}

/**
 * 既定の AlertSink。サーバーログ (`console.error`) にのみ詳細を出す
 * （aria-for-salon-app の `checkAndRecordClaudeUsage` と同じ方針）。
 * 本番で Slack/PagerDuty/DB 通知が必要な場合はプロダクト側で AlertSink を
 * 実装して差し替えること。
 */
export class ConsoleAlertSink implements AlertSink {
  async recordQuotaExceeded(event: QuotaExceededEvent): Promise<void> {
    // eslint-disable-next-line no-console -- 意図的なサーバーログ出力。内部詳細をユーザーに返さないための唯一の記録先。
    console.error("[llm-guard] LLM_API_QUOTA_EXCEEDED", {
      tenantId: event.tenantId,
      scope: event.scope,
      used: event.used,
      limit: event.limit,
      estimatedTokens: event.estimatedTokens,
      timestamp: event.timestamp.toISOString(),
    });
  }
}
