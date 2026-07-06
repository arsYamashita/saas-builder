import { describe, it, expect } from "vitest";
import {
  applyReservation,
  reservationAdjustment,
  InMemoryTenantUsageGuard,
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  DEFAULT_ESTIMATED_TOKENS_PER_REQUEST,
} from "./usage-guard";

describe("applyReservation — SQL reserve_api_usage() のミラー意味論 (claude_api_user_cost_limit_missing 対策)", () => {
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

describe("InMemoryTenantUsageGuard — 並列予約の回帰テスト (旧 read-check-insert 方式の TOCTOU 対策)", () => {
  it("回帰: 並列リクエストでも予約合計が月次上限を超えない", async () => {
    // 上限 1000 / 1件 300 トークン → 何並列で来ても 3 件しか通らないはず。
    const guard = new InMemoryTenantUsageGuard(1000);
    const results = await Promise.all(Array.from({ length: 10 }, () => guard.reserve("tenant-a", 300)));
    const acceptedCount = results.filter(Boolean).length;
    expect(acceptedCount).toBe(3); // floor(1000 / 300)
    expect(guard.getUsed("tenant-a")).toBe(900);
    expect(guard.getUsed("tenant-a")).toBeLessThanOrEqual(1000);
  });

  it("テナントごとに独立してカウントする(他テナントの消費に影響されない)", async () => {
    const guard = new InMemoryTenantUsageGuard(1000);
    await guard.reserve("tenant-a", 900);
    const acceptedForB = await guard.reserve("tenant-b", 900);
    expect(acceptedForB).toBe(true);
    expect(guard.getUsed("tenant-a")).toBe(900);
    expect(guard.getUsed("tenant-b")).toBe(900);
  });

  it("回帰: release (予約返却) 後は再び予約できる", async () => {
    const guard = new InMemoryTenantUsageGuard(1000);
    await guard.reserve("tenant-a", 600);
    expect(await guard.reserve("tenant-a", 600)).toBe(false); // 1200 > 1000
    await guard.release("tenant-a", 600);
    expect(await guard.reserve("tenant-a", 600)).toBe(true);
    expect(guard.getUsed("tenant-a")).toBe(600);
  });

  it("finalize は実測との差分のみを反映する(予約→補正のラウンドトリップ)", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000);
    await guard.reserve("tenant-a", 5000);
    await guard.finalize("tenant-a", 5000, 3247); // 実測 3,247 tokens
    expect(guard.getUsed("tenant-a")).toBe(3247);
  });
});

describe("reservationAdjustment / finalize", () => {
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
