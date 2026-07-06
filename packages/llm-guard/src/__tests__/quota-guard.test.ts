import { describe, it, expect } from "vitest";
import { checkAndReserveUsage } from "../core/quota-guard";
import { InMemoryTenantUsageGuard } from "../core/reservation";

describe("checkAndReserveUsage — 429 レスポンス形の共通化", () => {
  it("予約成功時は allowed:true のみ返す", async () => {
    const guard = new InMemoryTenantUsageGuard(1000, 1_000_000);
    const result = await checkAndReserveUsage(guard, "tenant-a", 500);
    expect(result).toEqual({ allowed: true });
  });

  it("予約失敗時は 429 + 汎用メッセージを返す(内部の used/limit は含まない)", async () => {
    const guard = new InMemoryTenantUsageGuard(100, 1_000_000);
    await guard.reserve("tenant-a", 90);
    const result = await checkAndReserveUsage(guard, "tenant-a", 50);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(429);
    expect(result.message).toBeTruthy();
    // メッセージに内部の使用量/上限の生数値 (90, 100) が漏れていないこと。
    // status:429 自体は数値だが、これはHTTPステータスであり内部詳細ではない。
    expect(result.message).not.toContain("90");
    expect(result.message).not.toContain("100");
  });
});
