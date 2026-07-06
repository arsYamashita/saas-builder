/**
 * テナント単位の LLM API コスト上限ガード（アトミック予約方式、日次+月次）。
 *
 * KB教訓: claude_api_user_cost_limit_missing
 * (~/Documents/my-vault/30_Knowledge/errors/claude_api_user_cost_limit_missing.md)
 *
 * 本モジュールは元々 packages/gov-doc-engine/src/analyzer/usage-guard.ts に
 * あった実装を移設したもの（gov-doc-engine は @saas/llm-guard を re-export
 * する薄いラッパーに変更済み）。設計・コメントの大部分は次の3実装の集約:
 *
 * - gov-doc-engine (本パッケージ移設元): 純関数 + ストレージ非依存インターフェイス
 * - aria-for-salon-app functions/src/claude-usage-store.ts: Firestore
 *   runTransaction + sha256 固定長ドキュメントID（本パッケージの
 *   adapters/firestore.ts に反映）
 * - ai-business-navigator supabase/functions/_shared/usage-guard.ts +
 *   migration `reserve_api_usage`/`adjust_api_usage`: Postgres の
 *   `INSERT ... ON CONFLICT DO UPDATE ... WHERE` 単文アトミック予約
 *   （本パッケージの adapters/supabase.ts に反映）
 *
 * 3実装はいずれも「読み取り→上限判定→加算」の3ステップを分離すると
 * 並行呼び出しで TOCTOU レースが起き月次上限をすり抜けられる、という
 * 同一の Codex 指摘を独立に踏んでいた。予約 (reserve) を唯一のゲートにする
 * ことで解消する:
 *
 *   1. 呼び出し前: reserve() — 推定トークンをアトミックに予約。false なら
 *      呼び出し元は Claude を呼ばず上限超過として扱う（429 相当）。
 *   2. 呼び出し成功後: finalize() — 実測トークンとの差分を補正。
 *   3. 呼び出し失敗時: release() — 予約分を返却（finalize(id, estimated, 0) と同義）。
 *
 * 日次上限は既存3実装のどれにも無かった新規要件（指示書2026-07-06_025）。
 * `TenantUsageGuard` インターフェイス自体は単一の `reserve/finalize/release`
 * のまま保つ（既存呼び出し側の互換性維持）— 日次+月次の両方を見るかどうかは
 * 実装（アダプタ）側の責務とする。
 *
 * このモジュールが提供する純関数はストレージ非依存のミラー実装であり、
 * 実際の永続化（Firestore transaction / Postgres atomic upsert）が真実源。
 * `InMemoryTenantUsageGuard` は単一プロセス・テスト用途の参照実装。
 */

import { DEFAULT_MONTHLY_TOKEN_LIMIT } from "./limits";
import type { AlertSink } from "./alerts";

export interface ReservationResult {
  accepted: boolean;
  newUsed: number;
}

/**
 * 純粋関数: SQL/Firestore 側の予約意味論のミラー実装。
 * （実ストレージが真実源。この関数はテストとドキュメントのため）
 */
export function applyReservation(
  currentUsed: number,
  tokens: number,
  limit: number = DEFAULT_MONTHLY_TOKEN_LIMIT,
): ReservationResult {
  const used = Math.max(0, currentUsed);
  if (tokens <= 0 || tokens > limit) {
    return { accepted: false, newUsed: used };
  }
  const newUsed = used + tokens;
  if (newUsed > limit) {
    return { accepted: false, newUsed: used };
  }
  return { accepted: true, newUsed };
}

/** 純粋関数: 実測との補正量（正 = 追加課金、負 = 予約の払い戻し）。 */
export function reservationAdjustment(estimatedTokens: number, actualTokens: number): number {
  return Math.max(0, actualTokens) - Math.max(0, estimatedTokens);
}

/**
 * プロダクト側が実装するテナント単位コストガードの契約。
 * 実際の永続化方式（Firestore transaction / Postgres ON CONFLICT 等）は
 * ここでは規定しない — adapters/ 配下がプロダクトごとに実装する。
 */
export interface TenantUsageGuard {
  /** 予約。true = 予約成功(呼び出し可)、false = 上限超過(呼び出し不可)。 */
  reserve(tenantId: string, tokens: number): Promise<boolean>;
  /** 呼び出し成功後、実測トークンとの差分を補正する。 */
  finalize(tenantId: string, estimatedTokens: number, actualTokens: number): Promise<void>;
  /** 呼び出し失敗時、予約分を返却する。 */
  release(tenantId: string, estimatedTokens: number): Promise<void>;
}

/**
 * テスト・単一プロセス用途向けの参照実装。日次+月次の両方をチェックする —
 * どちらか一方でも上限を超える場合は予約全体を拒否し、両カウンタとも
 * 変更しない（部分適用によるカウンタのずれを防ぐ）。
 * 本番で複数プロセス/インスタンスからテナントを跨いで使う場合は、
 * adapters/firestore.ts または adapters/supabase.ts のような DB アトミック
 * 実装を使うこと（このクラスを真実源にしない）。
 */
export class InMemoryTenantUsageGuard implements TenantUsageGuard {
  private readonly dailyUsed = new Map<string, number>();
  private readonly monthlyUsed = new Map<string, number>();

  constructor(
    private readonly dailyTokenLimit: number,
    private readonly monthlyTokenLimit: number,
    private readonly now: () => Date = () => new Date(),
    /**
     * 上限超過時に通知する AlertSink（任意）。指示書2026-07-06_025の
     * 「超過アラート」要件。省略時は通知しない（テストでの静音実行用）。
     */
    private readonly alertSink?: AlertSink,
  ) {}

  private dailyKey(tenantId: string): string {
    return `${tenantId}_${yyyyMMdd(this.now())}`;
  }

  private monthlyKey(tenantId: string): string {
    return `${tenantId}_${yyyyMM(this.now())}`;
  }

  async reserve(tenantId: string, tokens: number): Promise<boolean> {
    const dKey = this.dailyKey(tenantId);
    const mKey = this.monthlyKey(tenantId);

    const dailyResult = applyReservation(
      this.dailyUsed.get(dKey) ?? 0,
      tokens,
      this.dailyTokenLimit,
    );
    const monthlyResult = applyReservation(
      this.monthlyUsed.get(mKey) ?? 0,
      tokens,
      this.monthlyTokenLimit,
    );

    if (!dailyResult.accepted || !monthlyResult.accepted) {
      // monthly 超過を優先して報告する（両方超過している場合、月次の方が
      // ビジネスインパクトが大きい）。
      const scope = !monthlyResult.accepted ? "monthly" : "daily";
      const { used, limit } = !monthlyResult.accepted
        ? { used: monthlyResult.newUsed, limit: this.monthlyTokenLimit }
        : { used: dailyResult.newUsed, limit: this.dailyTokenLimit };
      await this.alertSink?.recordQuotaExceeded({
        tenantId,
        scope,
        used,
        limit,
        estimatedTokens: tokens,
        timestamp: this.now(),
      });
      return false;
    }

    this.dailyUsed.set(dKey, dailyResult.newUsed);
    this.monthlyUsed.set(mKey, monthlyResult.newUsed);
    return true;
  }

  async finalize(tenantId: string, estimatedTokens: number, actualTokens: number): Promise<void> {
    const delta = reservationAdjustment(estimatedTokens, actualTokens);
    if (delta === 0) return;

    const dKey = this.dailyKey(tenantId);
    const mKey = this.monthlyKey(tenantId);
    this.dailyUsed.set(dKey, Math.max(0, (this.dailyUsed.get(dKey) ?? 0) + delta));
    this.monthlyUsed.set(mKey, Math.max(0, (this.monthlyUsed.get(mKey) ?? 0) + delta));
  }

  async release(tenantId: string, estimatedTokens: number): Promise<void> {
    await this.finalize(tenantId, estimatedTokens, 0);
  }

  /** テスト用ヘルパー: 現在の日次予約済みトークン数を読む。 */
  getDailyUsed(tenantId: string): number {
    return this.dailyUsed.get(this.dailyKey(tenantId)) ?? 0;
  }

  /** テスト用ヘルパー: 現在の月次予約済みトークン数を読む。 */
  getMonthlyUsed(tenantId: string): number {
    return this.monthlyUsed.get(this.monthlyKey(tenantId)) ?? 0;
  }
}

/** UTC基準の `yyyyMM`（月次スコープキー）。aria-for-salon-app の currentYyyyMM と同じ形式。 */
export function yyyyMM(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** UTC基準の `yyyyMMdd`（日次スコープキー）。 */
export function yyyyMMdd(now: Date): string {
  return `${yyyyMM(now)}-${String(now.getUTCDate()).padStart(2, "0")}`;
}
