/**
 * 共通 Claude モデル ID 定数 + サイレント劣化ガード。
 *
 * 指示書 2026-07-06_031 対応。
 *
 * 背景: aria-app で「deprecated なモデル型番 (`claude-sonnet-4-20250514` 等)
 * が8ファイルに直書きされていた」事件（30_Knowledge/errors/anthropic_sdk_version_locked.md
 * 2026-07-06 追記参照）。saas-builder 側でも lib/providers/claude.ts /
 * lib/document-analysis/document-diff.ts に `claude-sonnet-4-5` の直書きが
 * 残っていた。再発防止のため、モデル ID は必ずこのモジュール経由で解決し、
 * 呼び出し側は `MODELS.opus` 等の定数のみを参照する。
 *
 * 値の根拠: ~/.claude/skills/claude-api/SKILL.md（キャッシュ日時 2026-06-24）
 * の Current Models 表 + shared/models.md の Programmatic Model Discovery
 * セクションで確認したエイリアス。
 * - opus:   claude-opus-4-8   (Current — 明示指定がない限り既定でこれを使う)
 * - sonnet: claude-sonnet-5   (Current)
 * - haiku:  claude-haiku-4-5-20251001 (Current。alias は claude-haiku-4-5
 *   だが、複数リポジトリの既存コードが日付付きフル ID を使っていたため
 *   （aria-for-salon-app, ai-business-navigator）フル ID を採用して統一)
 */

export const MODELS = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-5",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type ModelRole = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelRole];

/** allowlist — MODELS の値のみを「現行世代」として許可する。 */
const ALLOWED_MODEL_IDS: ReadonlySet<string> = new Set(Object.values(MODELS));

/**
 * サイレント劣化エラー。
 *
 * KB教訓 api_error_message_internal_leak に配慮し、`.message`
 * (ユーザー/クライアント向けに露出しうる) は汎用文言のみとする。
 * 実際に要求されたモデル ID は `.attemptedModel` に保持し、
 * 呼び出し側がサーバーログにのみ出力すること（`assertValidModel` 自身も
 * console.error に詳細を出す）。
 */
export class UnknownModelError extends Error {
  constructor(public readonly attemptedModel: string | null | undefined) {
    super(
      "The requested AI model is not available. Please contact support if this persists.",
    );
    this.name = "UnknownModelError";
  }
}

/**
 * 未知/空文字/旧世代（`MODELS` の定数値以外）のモデル ID で呼び出そうとしたら
 * 黙って動かさず例外を投げる。呼び出し側（起動時 or Claude 呼び出し直前）で
 * 必ず呼ぶこと。
 *
 * 意図的にブロックリスト（`-4-5$` 等の正規表現）ではなく allowlist にしている:
 * Haiku 4.5 のように「4-5」でも現行世代のモデルが存在するため、
 * バージョン番号パターンでの判定は既知の誤検知/見逃しを生む。
 * 「MODELS 定数の値そのものか」だけを判定基準にすることで、
 * 新モデルへの追従は MODELS を更新する1箇所に閉じ込められる。
 */
export function assertValidModel(
  modelId: string | null | undefined,
): asserts modelId is ModelId {
  if (modelId && ALLOWED_MODEL_IDS.has(modelId)) {
    return;
  }

  // eslint-disable-next-line no-console -- 詳細はサーバーログのみ。ユーザー向けメッセージは UnknownModelError.message 側で汎用化済み。
  console.error(
    `[llm-guard] blocked silent model degradation: attempted model=${JSON.stringify(
      modelId,
    )}, allowed=${JSON.stringify(Array.from(ALLOWED_MODEL_IDS))}`,
  );
  throw new UnknownModelError(modelId);
}

/**
 * 環境変数からモデル ID を解決する共通ヘルパー。
 * override が allowlist 外なら（空文字含め）`assertValidModel` が例外を投げる —
 * 「env に古いモデル ID を書いても気づかれない」というドリフトを構造的に防ぐ。
 */
export function resolveModelFromEnv(
  envVarValue: string | undefined,
  fallback: ModelId,
): ModelId {
  const override = envVarValue?.trim();
  const resolved = override && override.length > 0 ? override : fallback;
  assertValidModel(resolved);
  return resolved;
}
