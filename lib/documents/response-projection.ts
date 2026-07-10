/**
 * response-projection.ts — 内部オブジェクト → client 向け外部 DTO の型射影。
 *
 * 参照: 50_M5_Instructions/auto_2026-07-11_p2_rag-sources-internal-path-leak.md
 *       30_Knowledge/errors/llm_rag_response_sources_leak_internal_paths_bypasses_prompt_guardrail.md
 *
 * day_care_web_app/dashboard/src/lib/documents/response-projection.ts が
 * 型定義の真実源 (PoC)。本ファイルはその設計を saas-builder のドメイン
 * (blueprint / implementation_runs) に移植したもの。
 *
 * スコープ (重要 — secret-guard との違い): これは秘密の "形状"
 * (API キー等) のマスクとは別レイヤ。ここで扱うのは
 * `blueprints.raw_prompt` / `implementation_runs.prompt_text` に埋め込ま
 * れた「内部プロンプトテンプレートファイルの生内容」および「内部プロン
 * プトファイルパス」(例: `prompts/01-gemini-intake.md`,
 * `final/reservation_saas/02-schema-final.md`) の露出であり、
 * mask() では検出できない (秘密パターンに合致しない)。したがって本
 * モジュールは secret-guard には混ぜず、独立モジュールとして置く。
 *
 * 実在した漏洩経路 (2026-07-11 棚卸し。詳細は __tests__ のコメント参照):
 *   1. generate-blueprint/route.ts, blueprint/route.ts
 *        `{ blueprint: inserted }` で `blueprints` の INSERT 結果を
 *        select("*") のまま返却 → `raw_prompt` (内部プロンプト資産の
 *        生内容) が client に露出。
 *   2. generate-implementation/route.ts, generate-schema/route.ts,
 *      generate-api-design/route.ts
 *        `{ implementationRun: saved }` で `implementation_runs` の
 *        INSERT 結果をそのまま返却 → `prompt_text` (docs/rules/*.md の
 *        内容 + 内部テンプレートパス) が client に露出。
 *
 * NOTE: このリポジトリの Supabase admin client (`lib/db/supabase/admin.ts`)
 * は `createClient<Database>` のような型パラメータ付き生成型を持たない
 * ため (day_care_web_app と異なり生成 Database 型が無い)、呼び出し側の
 * `select("*")` 結果は実行時には `any` として扱われる。したがって
 * 「型が無いから漏れる」ことを防ぐ最終防衛線はこの射影関数の
 * **戻り値の型** (`ExternalBlueprint` / `ExternalImplementationRun`) が
 * `raw_prompt` / `prompt_text` を型として持たないことと、実装が
 * オブジェクト分割代入で当該フィールドを確実に落とすランタイム動作の
 * 両方で担保する。
 */

export interface BlueprintRow {
  id: string;
  project_id: string;
  version: number;
  prd_json?: unknown;
  entities_json?: unknown;
  screens_json?: unknown;
  roles_json?: unknown;
  permissions_json?: unknown;
  billing_json?: unknown;
  affiliate_json?: unknown;
  kpi_json?: unknown;
  assumptions_json?: unknown;
  events_json?: unknown;
  mvp_scope_json?: unknown;
  future_scope_json?: unknown;
  /** 内部プロンプト資産の生内容。client には絶対に返さない。 */
  raw_prompt?: string | null;
  source: string;
  created_by?: string | null;
  created_at: string;
}

/**
 * client に返してよい安全なフィールドのみ。`raw_prompt` はここに存在しない
 * = 型レベルで返却不能。
 */
export type ExternalBlueprint = Omit<BlueprintRow, "raw_prompt">;

export function projectBlueprintForClient(row: BlueprintRow): ExternalBlueprint {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { raw_prompt, ...safe } = row;
  return safe;
}

export interface ImplementationRunRow {
  id: string;
  project_id: string;
  blueprint_id: string;
  run_type: string;
  version: number;
  status: string;
  /**
   * 内部プロンプト資産の生内容 (docs/rules/*.md の埋め込み + 内部テンプ
   * レートファイルパス)。client には絶対に返さない。
   */
  prompt_text?: string | null;
  output_text: string;
  output_json?: unknown;
  source: string;
  created_at: string;
}

/**
 * client に返してよい安全なフィールドのみ。`prompt_text` はここに存在し
 * ない = 型レベルで返却不能。`output_text` (AI が生成した成果物本体) は
 * ユーザーが実際に必要とする内容なので残す — これは「生コード片」の
 * 漏洩ではなく、この機能の意図された成果物。
 */
export type ExternalImplementationRun = Omit<ImplementationRunRow, "prompt_text">;

export function projectImplementationRunForClient(
  row: ImplementationRunRow,
): ExternalImplementationRun {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { prompt_text, ...safe } = row;
  return safe;
}
