/**
 * テナント単位の LLM API コスト上限ガード（アトミック予約方式）。
 *
 * KB教訓: claude_api_user_cost_limit_missing
 * (~/Documents/my-vault/30_Knowledge/errors/claude_api_user_cost_limit_missing.md)
 * 「Claude/Groq API を呼ぶユーザー(テナント)向けエンドポイントに月次コスト上限が
 * ない」問題への対策。
 *
 * 実装は ai-business-navigator の
 * supabase/functions/_shared/usage-guard.ts (2026-07-06 時点、reserve_api_usage の
 * INSERT ... ON CONFLICT DO UPDATE ... WHERE 上限チェック という1文アトミック upsert
 * 方式。Codex レビューで指摘された旧 read-check-insert 方式の TOCTOU を解消済み) を
 * 移植・汎化したもの。
 *
 * 旧方式 (SELECT sum → 上限判定 → 呼び出し後 INSERT) は read-check-insert が
 * 非アトミックで、同一テナントの並列リクエストが同じ pre-insert 合計を読んで
 * 全員上限チェックを通過できてしまう。本実装は「予約 (reserve)」を唯一のゲートにする:
 *
 *   1. 呼び出し前: reserve() — 推定トークンをアトミックに予約。false なら
 *      呼び出し元は Claude を呼ばず上限超過として扱う（429 相当）。
 *   2. 呼び出し成功後: finalize() — 実測トークンとの差分を補正。
 *   3. 呼び出し失敗時: release() — 予約分を返却（finalize(id, estimated, 0) と同義）。
 *
 * gov-doc-engine はストレージ非依存の共通パッケージのため、実際の永続化
 * （Postgres の reserve_api_usage() RPC のような行ロック + アトミック upsert）は
 * プロダクト側（navigator 等）が TenantUsageGuard を実装して注入する。
 * このモジュールが提供する applyReservation() / reservationAdjustment() は
 * SQL 側の意味論をテスト・ドキュメントのためにミラーする純関数であり、
 * InMemoryTenantUsageGuard は単一プロセス・テスト用途の参照実装
 * （＝真実源にしない）。
 */

// 仮置きの月次トークン上限。実際のコスト許容量に基づくプロダクト判断が別途必要
// (day_care_web_app / ai-business-navigator の同KB対応と同様、人間判断待ち)。
export const DEFAULT_MONTHLY_TOKEN_LIMIT = 2_000_000;

// 1リクエストあたりの推定トークン数（予約に使う概算値）。
// 差分テキスト(最大 MAX_DIFF_TEXT_LENGTH 文字) + system prompt + 出力上限を見込んだ
// 概算。実測との差分は finalize() で補正される。
export const DEFAULT_ESTIMATED_TOKENS_PER_REQUEST = 8_000;

export interface ReservationResult {
  accepted: boolean;
  newUsed: number;
}

/**
 * 純粋関数: SQL 側 reserve_api_usage() と同じ予約意味論のミラー実装。
 * （SQL / 実ストレージが真実源。この関数はテストとドキュメントのため）
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
 * 実際の永続化方式（Postgres の ON CONFLICT アトミックカウンタ等）はここでは
 * 規定しない — 適用層(application/)のアダプタがプロダクトごとに実装する。
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
 * テスト・単一プロセス用途向けの参照実装。
 * 本番で複数プロセス/インスタンスからテナントを跨いで使う場合は、
 * ai-business-navigator の reserve_api_usage() 相当の DB アトミック実装を
 * TenantUsageGuard として実装すること（このクラスを真実源にしない）。
 */
export class InMemoryTenantUsageGuard implements TenantUsageGuard {
  private readonly used = new Map<string, number>();

  constructor(private readonly monthlyTokenLimit: number = DEFAULT_MONTHLY_TOKEN_LIMIT) {}

  async reserve(tenantId: string, tokens: number): Promise<boolean> {
    const current = this.used.get(tenantId) ?? 0;
    const result = applyReservation(current, tokens, this.monthlyTokenLimit);
    this.used.set(tenantId, result.newUsed);
    return result.accepted;
  }

  async finalize(tenantId: string, estimatedTokens: number, actualTokens: number): Promise<void> {
    const delta = reservationAdjustment(estimatedTokens, actualTokens);
    if (delta === 0) return;
    const current = this.used.get(tenantId) ?? 0;
    this.used.set(tenantId, Math.max(0, current + delta));
  }

  async release(tenantId: string, estimatedTokens: number): Promise<void> {
    await this.finalize(tenantId, estimatedTokens, 0);
  }

  /** テスト用ヘルパー: 現在の予約済みトークン数を読む。 */
  getUsed(tenantId: string): number {
    return this.used.get(tenantId) ?? 0;
  }
}
