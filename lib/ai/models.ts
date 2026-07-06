/**
 * アプリ側（lib/**）のコード向け、モデルID解決の入口。
 *
 * 実装本体は packages/llm-guard/src/core/models.ts（`@saas/llm-guard`）。
 * saas-builder の他の packages/* が `@saas/llm-guard` を直接 import するのに
 * 対し、`lib/**` 配下のアプリコードは慣習的に `lib/*` からの相対 import を
 * 使っているため、ここに薄い re-export を置いて呼び出し側の import パスを
 * 短くする（指示書 2026-07-06_031: `lib/ai/models.ts（または
 * packages/llm-guard/src/models.ts）` の両案を満たす構成）。
 */
export {
  MODELS,
  assertValidModel,
  resolveModelFromEnv,
  UnknownModelError,
  type ModelId,
  type ModelRole,
} from "@saas/llm-guard";
