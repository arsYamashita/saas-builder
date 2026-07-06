/**
 * テナント単位の LLM API コスト上限ガード。
 *
 * 2026-07-06 (指示書 2026-07-06_025 + 2026-07-06_031):
 * 実装本体は `@saas/llm-guard` に移設した。この KB教訓
 * (claude_api_user_cost_limit_missing) 対策は gov-doc-engine 固有ではなく
 * aria-for-salon-app / ai-business-navigator にも同種の実装が独立に
 * 存在していたため、共通パッケージへ統合した — 詳細・既存3実装との対応関係は
 * `packages/llm-guard/README.md` を参照。
 *
 * このファイルは既存の import パス (`./usage-guard`) を壊さないための
 * 薄い re-export。新規コードは `@saas/llm-guard` を直接 import すること。
 */
export {
  applyReservation,
  reservationAdjustment,
  InMemoryTenantUsageGuard,
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  DEFAULT_ESTIMATED_TOKENS_PER_REQUEST,
  type Reservation,
  type ReservationResult,
  type TenantUsageGuard,
} from "@saas/llm-guard";
