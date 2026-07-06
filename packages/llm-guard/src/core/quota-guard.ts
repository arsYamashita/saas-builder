/**
 * HTTP ハンドラ向けの薄いラッパー。aria-for-salon-app の
 * `checkAndRecordClaudeUsage` / ai-business-navigator の
 * `reserveMonthlyBudget` が個別に実装していた「429 レスポンス形」を共通化する。
 *
 * KB教訓 api_error_message_internal_leak: `used`/`limit` 等の内部詳細は
 * レスポンスボディに含めないこと。`UsageCheckResult` にはあえて
 * 汎用メッセージ文字列のみを含め、内部値はサーバーログ（AlertSink 経由）
 * にのみ残す設計にしている。
 */

import type { TenantUsageGuard } from "./reservation";

export interface UsageCheckResult {
  allowed: boolean;
  /** allowed=false のとき 429 相当であることを示す。 */
  status?: 429;
  /** allowed=false のときにクライアントへそのまま返してよい汎用メッセージ。 */
  message?: string;
}

/**
 * 呼び出し前に予約を試みる。上限超過なら Claude/LLM を呼ばず
 * `{allowed:false, status:429}` を返すこと。
 *
 * アラート送出（超過検知の記録）は `guard` 自身（例:
 * `InMemoryTenantUsageGuard` の alertSink 引数、または
 * FirestoreUsageStore/SupabaseUsageStore の alertSink オプション）が担う。
 * このヘルパーは「429 の形にする」ことだけに責務を絞る。
 */
export async function checkAndReserveUsage(
  guard: TenantUsageGuard,
  tenantId: string,
  estimatedTokens: number,
): Promise<UsageCheckResult> {
  const accepted = await guard.reserve(tenantId, estimatedTokens);
  if (!accepted) {
    return {
      allowed: false,
      status: 429,
      message: "Usage limit exceeded. Please try again later or contact support.",
    };
  }
  return { allowed: true };
}
