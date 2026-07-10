import { describe, expect, it } from "vitest";

// 参照: 50_M5_Instructions/auto_2026-07-11_p2_rag-sources-internal-path-leak.md
//       30_Knowledge/errors/llm_rag_response_sources_leak_internal_paths_bypasses_prompt_guardrail.md
//
// 型定義の真実源は day_care_web_app/dashboard/src/test/lib/response-projection-wiring.test.ts。
// 本テストは同じ回帰検証ロジックを saas-builder に移植したもの。
//
// スコープ (重要): これは秘密情報の "形状マスク" とは別レイヤの問題。
// saas-builder の実在した漏洩経路 (2026-07-11 棚卸しで確認):
//   1. app/api/projects/[projectId]/generate-blueprint/route.ts
//      app/api/projects/[projectId]/blueprint/route.ts
//        `blueprints` テーブルに INSERT した行を `.select().single()` の
//        まま `{ blueprint: inserted }` で client に返却していた。
//        `raw_prompt` カラムには `lib/utils/read-prompt.ts` が
//        `prompts/01-gemini-intake.md` 等 (サーバー内部のプロンプト
//        エンジニアリング資産= このプロダクトの中核ノウハウ) を丸ごと
//        読み込んで埋め込んだ内容がそのまま入っており、直接 client に
//        露出していた。
//   2. app/api/projects/[projectId]/generate-implementation/route.ts
//      app/api/projects/[projectId]/generate-schema/route.ts
//      app/api/projects/[projectId]/generate-api-design/route.ts
//        `implementation_runs` テーブルの INSERT 済み行を
//        `{ implementationRun: saved }` でそのまま返却していた。
//        `prompt_text` カラムには `docs/rules/*.md` (API/DB 設計ルール
//        資産) の内容および `resolveTemplatePrefixPath` /
//        `resolveFinalPromptPath` が解決した内部プロンプトファイルパス
//        (例: "final/reservation_saas/02-schema-final.md") が embed
//        されたまま入っており、直接 client に露出していた。
//   フロントエンド (app/, components/) のどこも `raw_prompt` /
//   `prompt_text` を読んでいない (grep 済み) — 表示に使われていない、
//   純粋な意図しない漏洩。
import {
  projectBlueprintForClient,
  projectImplementationRunForClient,
  type BlueprintRow,
  type ExternalBlueprint,
  type ExternalImplementationRun,
  type ImplementationRunRow,
} from "../response-projection";

// ---------------------------------------------------------------------------
// 内部パス / コードらしき文字列を検出するアサーションヘルパー。
// day_care_web_app のテストと同一ロジック (真実源からの移植)。
// ---------------------------------------------------------------------------
function assertNoInternalLeak(serialized: string, secretMarkers: string[]) {
  for (const marker of secretMarkers) {
    expect(serialized).not.toContain(marker);
  }
  // prompts/ ディレクトリ配下のテンプレートパス断片
  expect(serialized).not.toMatch(/\bfinal\/[\w-]+\/[\w-]+\.md\b/);
  expect(serialized).not.toMatch(/[\w./-]+\.(md|ts|tsx|py|dart)\b(?<!output)/i);
  // コードらしき文字列 (import / function 定義 / class 定義)
  expect(serialized).not.toMatch(/\bimport\s+[{\w]/);
  expect(serialized).not.toMatch(/\bfunction\s+\w+\s*\(/);
  expect(serialized).not.toMatch(/\bclass\s+\w+/);
  // 内部フィールド名そのもの
  expect(serialized).not.toContain("raw_prompt");
  expect(serialized).not.toContain("prompt_text");
}

describe("response-projection (saas-builder) — blueprint / implementation-run sources leak regression", () => {
  const internalBlueprintRow: BlueprintRow = {
    id: "11111111-1111-1111-1111-111111111111",
    project_id: "22222222-2222-2222-2222-222222222222",
    version: 1,
    prd_json: { summary: "予約管理 SaaS" },
    entities_json: [{ name: "Reservation" }],
    screens_json: [{ name: "Dashboard" }],
    roles_json: ["owner", "staff"],
    permissions_json: [],
    billing_json: { plan: "pro" },
    affiliate_json: { enabled: false },
    kpi_json: [],
    assumptions_json: [],
    events_json: [],
    mvp_scope_json: [],
    future_scope_json: [],
    // 内部プロンプトテンプレートファイル (prompts/01-gemini-intake.md 等) の
    // 生内容が丸ごと埋め込まれる (universal-chatbot の raw content chunk 相当)。
    raw_prompt:
      "import { buildPromptWithRules } from './lib/ai/build-prompt-with-rules'; " +
      "function assemble() { return readPrompt('01-gemini-intake.md'); } " +
      "class InternalPromptAssembler {} " +
      "## docs/rules/08-db-rules.md より: 既存テーブルが正、tenant_id 境界必須。".repeat(3),
    source: "gemini",
    created_by: "33333333-3333-3333-3333-333333333333",
    created_at: "2026-07-11T00:00:00Z",
  };

  const internalImplementationRunRow: ImplementationRunRow = {
    id: "44444444-4444-4444-4444-444444444444",
    project_id: "22222222-2222-2222-2222-222222222222",
    blueprint_id: "11111111-1111-1111-1111-111111111111",
    run_type: "schema_sql",
    version: 1,
    status: "completed",
    // 内部ルールファイル (docs/rules/08-db-rules.md) + テンプレートの内部
    // プロンプトパス (final/reservation_saas/02-schema-final.md) が
    // embed される。
    prompt_text:
      "import { resolveFinalPromptPath } from './lib/ai/template-prompt-resolver'; " +
      "function buildPrompt() { " +
      "  return readPrompt('final/reservation_saas/02-schema-final.md'); " +
      "} " +
      "class SchemaPromptBuilder {} " +
      "テーブル定義: ".repeat(3),
    output_text: "CREATE TABLE reservations (...);",
    output_json: null,
    source: "claude",
    created_at: "2026-07-11T00:00:00Z",
  };

  it("[fixture sanity] the raw internal rows DO contain the leak patterns (proves the assertion helper is meaningful)", () => {
    const rawSerialized =
      JSON.stringify(internalBlueprintRow) + JSON.stringify(internalImplementationRunRow);
    expect(rawSerialized).toContain("raw_prompt");
    expect(rawSerialized).toContain("prompt_text");
    expect(rawSerialized).toMatch(/\bimport\s+[{\w]/);
    expect(rawSerialized).toMatch(/\bfunction\s+\w+\s*\(/);
    expect(rawSerialized).toMatch(/\bfinal\/[\w-]+\/[\w-]+\.md\b/);
  });

  it("projectBlueprintForClient() excludes raw_prompt at the type level", () => {
    const external: ExternalBlueprint = projectBlueprintForClient(internalBlueprintRow);
    const serialized = JSON.stringify(external);

    assertNoInternalLeak(serialized, [internalBlueprintRow.raw_prompt!]);

    // 安全なフィールドはそのまま残る
    expect(external.id).toBe(internalBlueprintRow.id);
    expect(external.version).toBe(1);
    expect((external as unknown as { raw_prompt?: unknown }).raw_prompt).toBeUndefined();
  });

  it("projectImplementationRunForClient() excludes prompt_text at the type level", () => {
    const external: ExternalImplementationRun = projectImplementationRunForClient(
      internalImplementationRunRow,
    );
    const serialized = JSON.stringify(external);

    assertNoInternalLeak(serialized, [internalImplementationRunRow.prompt_text!]);

    expect(external.id).toBe(internalImplementationRunRow.id);
    expect(external.output_text).toBe("CREATE TABLE reservations (...);");
    expect((external as unknown as { prompt_text?: unknown }).prompt_text).toBeUndefined();
  });
});
