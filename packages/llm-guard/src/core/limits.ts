/**
 * 上限値の既定（すべて仮置き — 実コスト許容量に基づくプロダクト判断は
 * 人間が別途行うこと）。
 *
 * 参照実装ごとの既定値の経緯:
 * - gov-doc-engine / aria-for-salon-app / ai-business-navigator は
 *   いずれも月次 2,000,000 tokens/テナントを仮置きにしていた
 *   (day_care_web_app の先行実装を踏襲)。本パッケージでもそれを月次既定値
 *   として引き継ぐ。
 * - 日次上限は既存3実装のいずれにも存在しなかった（本指示書2026-07-06_025で
 *   新規に要求された観点）。単純に月次上限を30で割った値をプレースホルダーに
 *   採用しているが、実運用ではトラフィックの偏り（月初/月末に偏る等）を
 *   踏まえて人間が調整すること。
 */
export const DEFAULT_MONTHLY_TOKEN_LIMIT = 2_000_000;

/** 仮置き: DEFAULT_MONTHLY_TOKEN_LIMIT / 30 相当。人間判断で調整すること。 */
export const DEFAULT_DAILY_TOKEN_LIMIT = 70_000;

/**
 * 1リクエストあたりの推定トークン数（予約に使う概算値）。
 * gov-doc-engine の値 (8,000) を既定として引き継ぐ。呼び出し元のプロンプト
 * 規模に応じて上書きすること。
 */
export const DEFAULT_ESTIMATED_TOKENS_PER_REQUEST = 8_000;

export interface UsageLimits {
  dailyTokenLimit: number;
  monthlyTokenLimit: number;
}

export const DEFAULT_LIMITS: UsageLimits = {
  dailyTokenLimit: DEFAULT_DAILY_TOKEN_LIMIT,
  monthlyTokenLimit: DEFAULT_MONTHLY_TOKEN_LIMIT,
};
