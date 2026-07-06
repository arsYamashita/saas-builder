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
 * - 期間キー (`p_day` / `p_month`) を **クライアント側で予約時に確定して
 *   引数で渡す** (Codex review 2026-07-06 P2 on PR #39): DB 側で now() から
 *   再計算すると、UTC日/月境界を跨いだ finalize/release の補正が新しい
 *   バケットに当たってしまう（前日の予約が残置 + 新日がマイナス補正）。
 *   Reservation が予約時のキーを保持し、補正 RPC に同じキーを渡す。
 *
 * SQL 本体（テーブル定義 + RPC 関数）は `packages/llm-guard/sql/supabase-usage-schema.sql`
 * にテンプレとして同梱。プロジェクト固有のテーブル名/RLSポリシーに合わせて
 * 調整の上、各プロジェクトの migrations に取り込むこと（本パッケージは
 * マイグレーションを実行しない — ストレージ非依存の原則）。
 */

import type { AlertSink } from "../core/alerts";
import { DEFAULT_DAILY_TOKEN_LIMIT, DEFAULT_MONTHLY_TOKEN_LIMIT } from "../core/limits";
import {
  reservationAdjustment,
  yyyyMM,
  yyyyMMdd,
  type Reservation,
  type TenantUsageGuard,
} from "../core/reservation";

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

/** `yyyy-MM` の月次キーを Postgres の date リテラル（当月1日）へ変換する。 */
function monthKeyToDate(monthlyKey: string): string {
  return `${monthlyKey}-01`;
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

  /** 予約時の期間キーに対して delta を補正する（now() を再計算しない）。 */
  async function adjust(reservation: Reservation, delta: number): Promise<void> {
    if (delta === 0) return;
    const { error } = await client.rpc(adjustRpcName, {
      p_tenant_id: reservation.tenantId,
      p_provider: options.provider,
      p_delta: delta,
      p_day: reservation.dailyKey,
      p_month: monthKeyToDate(reservation.monthlyKey),
    });
    if (error) {
      throw new Error(`[llm-guard] supabase ${adjustRpcName} RPC failed: ${error.message}`);
    }
  }

  return {
    async reserve(tenantId: string, tokens: number): Promise<Reservation | null> {
      const nowDate = now();
      const dailyKey = yyyyMMdd(nowDate);
      const monthlyKey = yyyyMM(nowDate);

      const { data, error } = await client.rpc<ReserveLlmUsageResult>(reserveRpcName, {
        p_tenant_id: tenantId,
        p_provider: options.provider,
        p_tokens: tokens,
        p_daily_limit: dailyTokenLimit,
        p_monthly_limit: monthlyTokenLimit,
        p_day: dailyKey,
        p_month: monthKeyToDate(monthlyKey),
      });

      if (error) {
        // インフラ障害（RPC自体が失敗）はコスト超過とは別物 — フェイルクローズ
        // (呼び出しを許可しない) にして例外を投げる。サイレントに許可すると
        // 上限ガードが無効化されたまま気づかれない事故になりうる。
        throw new Error(`[llm-guard] supabase ${reserveRpcName} RPC failed: ${error.message}`);
      }

      const result = data ?? { accepted: false, scope: "monthly" as const, used: 0, limit: monthlyTokenLimit };

      if (!result.accepted) {
        await alertSink?.recordQuotaExceeded({
          tenantId,
          scope: result.scope ?? "monthly",
          used: result.used,
          limit: result.limit,
          estimatedTokens: tokens,
          timestamp: nowDate,
        });
        return null;
      }

      return { tenantId, estimatedTokens: tokens, dailyKey, monthlyKey };
    },

    async finalize(reservation: Reservation, actualTokens: number): Promise<void> {
      const delta = reservationAdjustment(reservation.estimatedTokens, actualTokens);
      await adjust(reservation, delta);
    },

    async release(reservation: Reservation): Promise<void> {
      await adjust(reservation, -reservation.estimatedTokens);
    },
  };
}
