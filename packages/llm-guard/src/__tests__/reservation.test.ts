import { describe, it, expect } from "vitest";
import {
  applyReservation,
  reservationAdjustment,
  InMemoryTenantUsageGuard,
  yyyyMM,
  yyyyMMdd,
} from "../core/reservation";
import { DEFAULT_MONTHLY_TOKEN_LIMIT, DEFAULT_ESTIMATED_TOKENS_PER_REQUEST } from "../core/limits";
import { InMemoryAlertSink } from "../core/alerts";

describe("applyReservation — 予約意味論の純関数ミラー (claude_api_user_cost_limit_missing 対策)", () => {
  it("上限内なら予約成功し、使用量が加算される", () => {
    const result = applyReservation(100, 300, 1000);
    expect(result.accepted).toBe(true);
    expect(result.newUsed).toBe(400);
  });

  it("ちょうど上限に達する予約は許可される (<=)", () => {
    const result = applyReservation(700, 300, 1000);
    expect(result.accepted).toBe(true);
    expect(result.newUsed).toBe(1000);
  });

  it("上限を超える予約は拒否され、使用量は変わらない", () => {
    const result = applyReservation(800, 300, 1000);
    expect(result.accepted).toBe(false);
    expect(result.newUsed).toBe(800);
  });

  it("tokens <= 0 の予約は拒否される", () => {
    expect(applyReservation(0, 0, 1000).accepted).toBe(false);
    expect(applyReservation(0, -5, 1000).accepted).toBe(false);
  });

  it("tokens > limit の予約は使用量ゼロでも拒否される", () => {
    expect(applyReservation(0, 2000, 1000).accepted).toBe(false);
  });

  it("limit 省略時は DEFAULT_MONTHLY_TOKEN_LIMIT が使われる", () => {
    const result = applyReservation(0, DEFAULT_ESTIMATED_TOKENS_PER_REQUEST);
    expect(result.accepted).toBe(true);
    expect(DEFAULT_MONTHLY_TOKEN_LIMIT).toBeGreaterThan(DEFAULT_ESTIMATED_TOKENS_PER_REQUEST);
  });
});

describe("reservationAdjustment", () => {
  it("実測 > 予約 なら正の補正", () => {
    expect(reservationAdjustment(5000, 6200)).toBe(1200);
  });
  it("実測 < 予約 なら負の補正 (払い戻し)", () => {
    expect(reservationAdjustment(5000, 3100)).toBe(-1900);
  });
  it("実測 = 予約 なら補正ゼロ", () => {
    expect(reservationAdjustment(5000, 5000)).toBe(0);
  });
});

describe("InMemoryTenantUsageGuard — 月次のみ制約 (dailyTokenLimit=Infinity) の回帰", () => {
  it("回帰: 並列リクエストでも予約合計が月次上限を超えない", async () => {
    const guard = new InMemoryTenantUsageGuard(Number.POSITIVE_INFINITY, 1000);
    const results = await Promise.all(Array.from({ length: 10 }, () => guard.reserve("tenant-a", 300)));
    const acceptedCount = results.filter(Boolean).length;
    expect(acceptedCount).toBe(3); // floor(1000 / 300)
    expect(guard.getMonthlyUsed("tenant-a")).toBe(900);
    expect(guard.getMonthlyUsed("tenant-a")).toBeLessThanOrEqual(1000);
  });

  it("テナントごとに独立してカウントする(他テナントの消費に影響されない)", async () => {
    const guard = new InMemoryTenantUsageGuard(Number.POSITIVE_INFINITY, 1000);
    await guard.reserve("tenant-a", 900);
    const acceptedForB = await guard.reserve("tenant-b", 900);
    expect(acceptedForB).toBe(true);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(900);
    expect(guard.getMonthlyUsed("tenant-b")).toBe(900);
  });

  it("回帰: release (予約返却) 後は再び予約できる", async () => {
    const guard = new InMemoryTenantUsageGuard(Number.POSITIVE_INFINITY, 1000);
    await guard.reserve("tenant-a", 600);
    expect(await guard.reserve("tenant-a", 600)).toBe(false); // 1200 > 1000
    await guard.release("tenant-a", 600);
    expect(await guard.reserve("tenant-a", 600)).toBe(true);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(600);
  });

  it("finalize は実測との差分のみを反映する(予約→補正のラウンドトリップ)", async () => {
    const guard = new InMemoryTenantUsageGuard(Number.POSITIVE_INFINITY, 1_000_000);
    await guard.reserve("tenant-a", 5000);
    await guard.finalize("tenant-a", 5000, 3247);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(3247);
  });
});

describe("InMemoryTenantUsageGuard — 日次上限 (指示書2026-07-06_025の新規要件)", () => {
  it("月次には十分余裕があっても日次上限を超えると拒否する", async () => {
    const guard = new InMemoryTenantUsageGuard(1000, 1_000_000);
    expect(await guard.reserve("tenant-a", 700)).toBe(true);
    expect(await guard.reserve("tenant-a", 400)).toBe(false); // 1100 > daily limit 1000
    expect(guard.getDailyUsed("tenant-a")).toBe(700);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(700);
  });

  it("日次上限で拒否された場合、月次カウンタは加算されない(部分適用防止)", async () => {
    const guard = new InMemoryTenantUsageGuard(100, 1_000_000);
    await guard.reserve("tenant-a", 90);
    expect(await guard.reserve("tenant-a", 50)).toBe(false); // daily: 140 > 100
    expect(guard.getMonthlyUsed("tenant-a")).toBe(90); // not 140
  });

  it("日/月の境界を跨ぐと日次カウンタは独立にリセットされる(month跨ぎ以外)", async () => {
    let currentDate = new Date("2026-07-06T12:00:00Z");
    const guard = new InMemoryTenantUsageGuard(100, 1_000_000, () => currentDate);
    await guard.reserve("tenant-a", 90);
    expect(guard.getDailyUsed("tenant-a")).toBe(90);

    currentDate = new Date("2026-07-07T00:00:01Z"); // 翌日
    expect(await guard.reserve("tenant-a", 90)).toBe(true); // 新しい日次バケットなので許可
    expect(guard.getDailyUsed("tenant-a")).toBe(90);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(180); // 月次は跨がず継続加算
  });

  it("超過時に AlertSink へ scope 付きで通知する", async () => {
    const alertSink = new InMemoryAlertSink();
    const guard = new InMemoryTenantUsageGuard(100, 1_000_000, () => new Date("2026-07-06T00:00:00Z"), alertSink);
    await guard.reserve("tenant-a", 90);
    expect(await guard.reserve("tenant-a", 50)).toBe(false);

    expect(alertSink.quotaExceededEvents).toHaveLength(1);
    expect(alertSink.quotaExceededEvents[0]).toMatchObject({
      tenantId: "tenant-a",
      scope: "daily",
      limit: 100,
    });
  });

  it("月次超過時は scope=monthly で通知する", async () => {
    const alertSink = new InMemoryAlertSink();
    const guard = new InMemoryTenantUsageGuard(1_000_000, 100, () => new Date("2026-07-06T00:00:00Z"), alertSink);
    await guard.reserve("tenant-a", 90);
    expect(await guard.reserve("tenant-a", 50)).toBe(false);

    expect(alertSink.quotaExceededEvents[0]).toMatchObject({ scope: "monthly", limit: 100 });
  });
});

describe("yyyyMM / yyyyMMdd — スコープキーのフォーマット", () => {
  it("UTC基準でフォーマットする", () => {
    expect(yyyyMM(new Date("2026-07-06T23:59:59Z"))).toBe("2026-07");
    expect(yyyyMMdd(new Date("2026-07-06T23:59:59Z"))).toBe("2026-07-06");
    expect(yyyyMM(new Date("2026-01-06T00:00:00Z"))).toBe("2026-01");
  });
});
