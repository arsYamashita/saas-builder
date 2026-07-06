import { describe, it, expect } from "vitest";
import {
  applyReservation,
  reservationAdjustment,
  InMemoryTenantUsageGuard,
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  DEFAULT_ESTIMATED_TOKENS_PER_REQUEST,
} from "./usage-guard";

/**
 * 2026-07-06 (指示書 2026-07-06_025 + 2026-07-06_031): 本体の実装・網羅的な
 * 挙動テスト（並列予約の回帰・日次上限・AlertSink 等）は
 * packages/llm-guard/src/__tests__/reservation.test.ts に移設済み。
 * このファイルは「gov-doc-engine の import パスが @saas/llm-guard に
 * 正しく配線されているか」だけを検証する薄いワイヤリングテスト。
 */
describe("usage-guard re-export wiring (@saas/llm-guard への移設, 指示書2026-07-06_025/031)", () => {
  it("re-export された関数・クラスが実際に動作する", async () => {
    expect(applyReservation(0, 100, 1000).accepted).toBe(true);
    expect(reservationAdjustment(100, 80)).toBe(-20);
    expect(DEFAULT_MONTHLY_TOKEN_LIMIT).toBeGreaterThan(DEFAULT_ESTIMATED_TOKENS_PER_REQUEST);

    const guard = new InMemoryTenantUsageGuard(
      Number.POSITIVE_INFINITY,
      DEFAULT_MONTHLY_TOKEN_LIMIT,
    );
    expect(await guard.reserve("tenant-a", DEFAULT_ESTIMATED_TOKENS_PER_REQUEST)).toBe(true);
  });
});
