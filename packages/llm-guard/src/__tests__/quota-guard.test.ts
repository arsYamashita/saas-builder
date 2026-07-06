import { describe, it, expect } from "vitest";
import { checkAndReserveUsage } from "../core/quota-guard";
import { InMemoryTenantUsageGuard } from "../core/reservation";

describe("checkAndReserveUsage — 429 レスポンス形の共通化", () => {
  it("予約成功時は allowed:true + Reservation ハンドルを返す", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000, { dailyTokenLimit: 1000 });
    const result = await checkAndReserveUsage(guard, "tenant-a", 500);
    expect(result.allowed).toBe(true);
    expect(result.status).toBeUndefined();
    // finalize/release 用の予約ハンドル (予約時期間キー付き) が返ること
    expect(result.reservation).toMatchObject({ tenantId: "tenant-a", estimatedTokens: 500 });
    expect(result.reservation!.dailyKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.reservation!.monthlyKey).toMatch(/^\d{4}-\d{2}$/);
  });

  it("予約失敗時は 429 + 汎用メッセージを返す(内部の used/limit は含まない)", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000, { dailyTokenLimit: 100 });
    await guard.reserve("tenant-a", 90);
    const result = await checkAndReserveUsage(guard, "tenant-a", 50);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.reservation).toBeUndefined();
    expect(result.message).toBeTruthy();
    // メッセージに内部の使用量/上限の生数値 (90, 100) が漏れていないこと。
    // status:429 自体は数値だが、これはHTTPステータスであり内部詳細ではない。
    expect(result.message).not.toContain("90");
    expect(result.message).not.toContain("100");
  });
});
