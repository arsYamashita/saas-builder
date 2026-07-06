/**
 * Claude モデル ID の設定化レイヤー。
 *
 * 2026-07-06 に aria-app で「deprecated なモデル型番が8ファイルに直書きされていた」
 * 事件が見つかったばかりのため、gov-doc-engine ではモデル文字列を呼び出し箇所に
 * 直書きせず、必ずこのモジュール経由で解決する。変更が必要な時に1箇所を触るだけで
 * 全呼び出しに反映される。
 *
 * 2026-07-06 (指示書 2026-07-06_031): モデル ID 定数そのものは `@saas/llm-guard`
 * の `MODELS` に共通化した（saas-builder 内の全パッケージがここを参照する）。
 * さらに、環境変数 `GOV_DOC_ENGINE_CLAUDE_MODEL` による上書きが検証なしで
 * 素通りしていた点（＝古いモデルIDを env に書いても誰も気づかないサイレント
 * 劣化ドリフトの温床）を `resolveModelFromEnv` の allowlist ガードで塞いだ。
 *
 * 既定値は ~/.claude/skills/claude-api/SKILL.md (キャッシュ日時: 2026-06-24) の
 * 「ALWAYS use claude-opus-4-8 unless the user explicitly names a different model」
 * という現行の推奨に準拠 (= MODELS.opus)。
 */

import { MODELS, resolveModelFromEnv } from "@saas/llm-guard";

export const DEFAULT_CLAUDE_MODEL = MODELS.opus;

/**
 * 環境変数 GOV_DOC_ENGINE_CLAUDE_MODEL で上書き可能
 * （コスト最適化のため MODELS.sonnet / MODELS.haiku 等に切り替えたい場合や、
 * 新モデルのロールアウトに追従したい場合を想定）。
 *
 * 上書き値が `@saas/llm-guard` の MODELS 定数のいずれかと一致しない場合
 * （空文字・未知の値・`claude-sonnet-4-5` のような旧世代IDを含む）は
 * `UnknownModelError` を投げる — 黙って旧モデルにフォールバックしない。
 */
export function resolveClaudeModel(env: Record<string, string | undefined> = process.env): string {
  return resolveModelFromEnv(env.GOV_DOC_ENGINE_CLAUDE_MODEL, DEFAULT_CLAUDE_MODEL);
}
