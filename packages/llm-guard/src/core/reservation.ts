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
 *   1. 呼び出し前: reserve() — 推定トークンをアトミックに予約。null なら
 *      呼び出し元は Claude を呼ばず上限超過として扱う（429 相当）。
 *      成功時は Reservation オブジェクト（予約時の期間バケットキーを含む）
 *      を返す。
 *   2. 呼び出し成功後: finalize(reservation, actual) — 実測トークンとの
 *      差分を **予約時のバケット** に対して補正。
 *   3. 呼び出し失敗時: release(reservation) — 予約分を予約時のバケットへ返却。
 *
 * ## 予約が期間キーを保持する理由 (Codex review 2026-07-06 P2 on PR #39)
 *
 * finalize/release 時に now() から期間キーを再計算すると、UTC の日/月境界を
 * 跨いだ補正が **新しいバケット** に当たってしまう:
 * 23:59:59 に予約 → 00:00:01 に release すると、前日のバケットに予約分が
 * 残置され（=その日の枠が戻らない）、新日のバケットが負方向に補正される
 * （Math.max(0) で 0 にクランプされ、ずれが黙って揉み消される）。
 * これを防ぐため、reserve() が予約時点の dailyKey/monthlyKey を
 * Reservation に固定し、finalize/release は必ずそのキーに対して補正する。
 * Firestore/Supabase アダプタ（と SQL RPC）も同様に予約時キーを引数で
 * 受け渡す。
 *
 * 日次上限は既存3実装のどれにも無かった新規要件（指示書2026-07-06_025）。
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
 * 予約ハンドル。reserve() 成功時に返り、finalize()/release() に渡す。
 * dailyKey/monthlyKey は **予約時点** の UTC 期間バケットキー —
 * 補正が日/月境界を跨いでも必ず予約時のバケットに当たることを保証する
 * (Codex review 2026-07-06 P2 on PR #39)。
 */
export interface Reservation {
  tenantId: string;
  estimatedTokens: number;
  /** 予約時点の日次バケットキー (UTC, `yyyy-MM-dd`)。 */
  dailyKey: string;
  /** 予約時点の月次バケットキー (UTC, `yyyy-MM`)。 */
  monthlyKey: string;
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
  /**
   * 予約。Reservation = 予約成功(呼び出し可)、null = 上限超過(呼び出し不可)。
   * 返された Reservation を finalize()/release() にそのまま渡すこと。
   */
  reserve(tenantId: string, tokens: number): Promise<Reservation | null>;
  /** 呼び出し成功後、実測トークンとの差分を予約時バケットに対して補正する。 */
  finalize(reservation: Reservation, actualTokens: number): Promise<void>;
  /** 呼び出し失敗時、予約分を予約時バケットへ返却する。 */
  release(reservation: Reservation): Promise<void>;
}

export interface InMemoryTenantUsageGuardOptions {
  /**
   * 日次上限。省略時は **無制限**。
   *
   * 後方互換 (Codex review 2026-07-06 P2 on PR #39): 移設元 gov-doc-engine の
   * 旧シグネチャ `new InMemoryTenantUsageGuard(monthlyLimit)` は月次のみの
   * ガードだった。日次に暗黙の既定値を入れると、旧来の1引数呼び出しの
   * 月次専用ガードが黙って日次でも拒否し始める（TSなら型エラーで気づけるが
   * JS利用者はサイレントに挙動が変わる）ため、日次上限は明示オプトインとする。
   * 本番アダプタ (firestoreUsageStore / supabaseUsageStore) は
   * DEFAULT_DAILY_TOKEN_LIMIT を既定値に持つ — あちらは新規APIで
   * 後方互換の制約がないため。
   */
  dailyTokenLimit?: number;
  now?: () => Date;
  /**
   * 上限超過時に通知する AlertSink（任意）。指示書2026-07-06_025の
   * 「超過アラート」要件。省略時は通知しない（テストでの静音実行用）。
   */
  alertSink?: AlertSink;
}

/**
 * テスト・単一プロセス用途向けの参照実装。日次+月次の両方をチェックする —
 * どちらか一方でも上限を超える場合は予約全体を拒否し、両カウンタとも
 * 変更しない（部分適用によるカウンタのずれを防ぐ）。
 *
 * 後方互換シグネチャ: **第1引数は月次上限**（移設元 gov-doc-engine の
 * `new InMemoryTenantUsageGuard(1_000_000)` と同じ意味）。日次上限は
 * options で明示指定する:
 * `new InMemoryTenantUsageGuard(monthly, { dailyTokenLimit })`。
 *
 * 本番で複数プロセス/インスタンスからテナントを跨いで使う場合は、
 * adapters/firestore.ts または adapters/supabase.ts のような DB アトミック
 * 実装を使うこと（このクラスを真実源にしない）。
 */
export class InMemoryTenantUsageGuard implements TenantUsageGuard {
  private readonly dailyUsed = new Map<string, number>();
  private readonly monthlyUsed = new Map<string, number>();
  private readonly dailyTokenLimit: number;
  private readonly now: () => Date;
  private readonly alertSink?: AlertSink;

  constructor(
    private readonly monthlyTokenLimit: number = DEFAULT_MONTHLY_TOKEN_LIMIT,
    options: InMemoryTenantUsageGuardOptions = {},
  ) {
    this.dailyTokenLimit = options.dailyTokenLimit ?? Number.POSITIVE_INFINITY;
    this.now = options.now ?? (() => new Date());
    this.alertSink = options.alertSink;
  }

  async reserve(tenantId: string, tokens: number): Promise<Reservation | null> {
    const nowDate = this.now();
    const dailyKey = yyyyMMdd(nowDate);
    const monthlyKey = yyyyMM(nowDate);
    const dKey = `${tenantId}_${dailyKey}`;
    const mKey = `${tenantId}_${monthlyKey}`;

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
        timestamp: nowDate,
      });
      return null;
    }

    this.dailyUsed.set(dKey, dailyResult.newUsed);
    this.monthlyUsed.set(mKey, monthlyResult.newUsed);
    return { tenantId, estimatedTokens: tokens, dailyKey, monthlyKey };
  }

  async finalize(reservation: Reservation, actualTokens: number): Promise<void> {
    const delta = reservationAdjustment(reservation.estimatedTokens, actualTokens);
    if (delta === 0) return;

    // 予約時のバケットキーに対して補正する — now() を再計算しない
    // (UTC日/月境界跨ぎの補正ずれ防止, Codex review 2026-07-06 P2 on PR #39)。
    const dKey = `${reservation.tenantId}_${reservation.dailyKey}`;
    const mKey = `${reservation.tenantId}_${reservation.monthlyKey}`;
    this.dailyUsed.set(dKey, Math.max(0, (this.dailyUsed.get(dKey) ?? 0) + delta));
    this.monthlyUsed.set(mKey, Math.max(0, (this.monthlyUsed.get(mKey) ?? 0) + delta));
  }

  async release(reservation: Reservation): Promise<void> {
    await this.finalize(reservation, 0);
  }

  /**
   * テスト用ヘルパー: 日次予約済みトークン数を読む。
   * dailyKey 省略時は現在(now())のバケット。
   */
  getDailyUsed(tenantId: string, dailyKey?: string): number {
    const key = dailyKey ?? yyyyMMdd(this.now());
    return this.dailyUsed.get(`${tenantId}_${key}`) ?? 0;
  }

  /**
   * テスト用ヘルパー: 月次予約済みトークン数を読む。
   * monthlyKey 省略時は現在(now())のバケット。
   */
  getMonthlyUsed(tenantId: string, monthlyKey?: string): number {
    const key = monthlyKey ?? yyyyMM(this.now());
    return this.monthlyUsed.get(`${tenantId}_${key}`) ?? 0;
  }
}

/** UTC基準の `yyyy-MM`（月次スコープキー）。aria-for-salon-app の currentYyyyMM と同じ形式。 */
export function yyyyMM(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** UTC基準の `yyyy-MM-dd`（日次スコープキー）。 */
export function yyyyMMdd(now: Date): string {
  return `${yyyyMM(now)}-${String(now.getUTCDate()).padStart(2, "0")}`;
}
