/**
 * `TenantUsageGuard` の Supabase (Postgres) 実装。
 *
 * 移植元: ai-business-navigator/supabase/functions/_shared/usage-guard.ts +
 * migration `20260706000000_add_api_usage_limits.sql`
 * (`reserve_api_usage()` / `adjust_api_usage()`, `INSERT ... ON CONFLICT DO
 * UPDATE ... WHERE` の1文アトミック予約 — Codex review 2026-07-06 P2
 * 「read-check-insert の TOCTOU」指摘対応済みの設計)。
 *
 * navigator 版との差分:
 * - 月次のみ → 日次+月次の2カウンタを1回の RPC 呼び出し (`reserve_llm_usage`)
 *   でアトミックに判定・加算する（指示書2026-07-06_025 の新規要件）。
 * - 戻り値を `boolean` から `jsonb` (`{accepted, scope, used, limit}`) に
 *   拡張し、上限超過時にどちらの軸で超過したか・実測値をアプリ側の
 *   AlertSink に渡せるようにした。
 *
 * SQL 本体（テーブル定義 + RPC 関数）は `packages/llm-guard/sql/supabase-usage-schema.sql`
 * にテンプレとして同梱。プロジェクト固有のテーブル名/RLSポリシーに合わせて
 * 調整の上、各プロジェクトの migrations に取り込むこと（本パッケージは
 * マイグレーションを実行しない — ストレージ非依存の原則）。
 */

import type { AlertSink } from "../core/alerts";
import { DEFAULT_DAILY_TOKEN_LIMIT, DEFAULT_MONTHLY_TOKEN_LIMIT } from "../core/limits";
import { reservationAdjustment, type TenantUsageGuard } from "../core/reservation";

/** `@supabase/supabase-js` の `SupabaseClient.rpc()` と構造的に互換な最小インターフェイス。 */
export interface SupabaseRpcClient {
  rpc<T = unknown>(
    fn: string,
    params: Record<string, unknown>,
  ): Promise<{ data: T | null; error: { message: string } | null }>;
}

interface ReserveLlmUsageResult {
  accepted: boolean;
  scope: "daily" | "monthly" | null;
  used: number;
  limit: number;
}

export interface SupabaseUsageStoreOptions {
  /** `provider` カラムの値。navigator の `api_usage_monthly.provider` と同じ意味。 */
  provider: string;
  dailyTokenLimit?: number;
  monthlyTokenLimit?: number;
  alertSink?: AlertSink;
  now?: () => Date;
  /** RPC関数名。既定は `packages/llm-guard/sql/supabase-usage-schema.sql` の定義に合わせる。 */
  reserveRpcName?: string;
  adjustRpcName?: string;
}

/**
 * `TenantUsageGuard` の Supabase アダプタ。`sql/supabase-usage-schema.sql`
 * を導入済みの Supabase プロジェクトに対して使う。
 */
export function supabaseUsageStore(
  client: SupabaseRpcClient,
  options: SupabaseUsageStoreOptions,
): TenantUsageGuard {
  const dailyTokenLimit = options.dailyTokenLimit ?? DEFAULT_DAILY_TOKEN_LIMIT;
  const monthlyTokenLimit = options.monthlyTokenLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT;
  const now = options.now ?? (() => new Date());
  const alertSink = options.alertSink;
  const reserveRpcName = options.reserveRpcName ?? "reserve_llm_usage";
  const adjustRpcName = options.adjustRpcName ?? "adjust_llm_usage";

  return {
    async reserve(tenantId: string, tokens: number): Promise<boolean> {
      const { data, error } = await client.rpc<ReserveLlmUsageResult>(reserveRpcName, {
        p_tenant_id: tenantId,
        p_provider: options.provider,
        p_tokens: tokens,
        p_daily_limit: dailyTokenLimit,
        p_monthly_limit: monthlyTokenLimit,
      });

      if (error) {
        // インフラ障害（RPC自体が失敗）はコスト超過とは別物 — フェイルクローズ
        // (呼び出しを許可しない) にして例外を投げる。サイレントに許可すると
        // 上限ガードが無効化されたまま気づかれない事故になりうる。
        throw new Error(`[llm-guard] supabase reserve_llm_usage RPC failed: ${error.message}`);
      }

      const result = data ?? { accepted: false, scope: "monthly" as const, used: 0, limit: monthlyTokenLimit };

      if (!result.accepted) {
        await alertSink?.recordQuotaExceeded({
          tenantId,
          scope: result.scope ?? "monthly",
          used: result.used,
          limit: result.limit,
          estimatedTokens: tokens,
          timestamp: now(),
        });
      }

      return result.accepted;
    },

    async finalize(tenantId: string, estimatedTokens: number, actualTokens: number): Promise<void> {
      const delta = reservationAdjustment(estimatedTokens, actualTokens);
      if (delta === 0) return;
      const { error } = await client.rpc(adjustRpcName, {
        p_tenant_id: tenantId,
        p_provider: options.provider,
        p_delta: delta,
      });
      if (error) {
        throw new Error(`[llm-guard] supabase adjust_llm_usage RPC failed: ${error.message}`);
      }
    },

    async release(tenantId: string, estimatedTokens: number): Promise<void> {
      if (estimatedTokens <= 0) return;
      const { error } = await client.rpc(adjustRpcName, {
        p_tenant_id: tenantId,
        p_provider: options.provider,
        p_delta: -estimatedTokens,
      });
      if (error) {
        throw new Error(`[llm-guard] supabase adjust_llm_usage RPC failed: ${error.message}`);
      }
    },
  };
}
