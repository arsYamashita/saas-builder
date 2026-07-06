/**
 * Claude モデル ID の設定化レイヤー。
 *
 * 2026-07-06 に aria-app で「deprecated なモデル型番が8ファイルに直書きされていた」
 * 事件が見つかったばかりのため、gov-doc-engine ではモデル文字列を呼び出し箇所に
 * 直書きせず、必ずこのモジュール経由で解決する。変更が必要な時に1箇所を触るだけで
 * 全呼び出しに反映される。
 *
 * 既定値は ~/.claude/skills/claude-api/SKILL.md (キャッシュ日時: 2026-06-24) の
 * 「ALWAYS use claude-opus-4-8 unless the user explicitly names a different model」
 * という現行の推奨に準拠。
 *
 * 環境変数 GOV_DOC_ENGINE_CLAUDE_MODEL で上書き可能
 * （コスト最適化のため claude-sonnet-5 / claude-haiku-4-5 等に切り替えたい場合や、
 * 新モデルのロールアウトに追従したい場合を想定）。
 */

export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-8";

export function resolveClaudeModel(env: Record<string, string | undefined> = process.env): string {
  const override = env.GOV_DOC_ENGINE_CLAUDE_MODEL?.trim();
  return override && override.length > 0 ? override : DEFAULT_CLAUDE_MODEL;
}
