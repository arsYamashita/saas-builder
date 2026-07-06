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

describe("InMemoryTenantUsageGuard — 後方互換シグネチャ (Codex review 2026-07-06 P2 on PR #39)", () => {
  it("回帰: 1引数呼び出しは月次上限として解釈される (旧 gov-doc-engine 互換)", async () => {
    const guard = new InMemoryTenantUsageGuard(1000);
    // 月次上限 1000 が効く
    expect(await guard.reserve("tenant-a", 700)).not.toBeNull();
    expect(await guard.reserve("tenant-a", 400)).toBeNull(); // 1100 > monthly 1000
    expect(guard.getMonthlyUsed("tenant-a")).toBe(700);
  });

  it("回帰: 1引数呼び出しでは日次上限が課されない (旧来の月次専用ガードの挙動維持)", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000);
    // もし日次既定値 (例 70,000) が暗黙に課されると 90,000 の予約は即拒否される
    for (let i = 0; i < 10; i++) {
      expect(await guard.reserve("tenant-b", 90_000)).not.toBeNull();
    }
    expect(guard.getMonthlyUsed("tenant-b")).toBe(900_000);
  });

  it("引数なしなら DEFAULT_MONTHLY_TOKEN_LIMIT が月次上限になる", async () => {
    const guard = new InMemoryTenantUsageGuard();
    expect(await guard.reserve("tenant-a", DEFAULT_MONTHLY_TOKEN_LIMIT)).not.toBeNull();
    expect(await guard.reserve("tenant-a", 1)).toBeNull();
  });
});

describe("InMemoryTenantUsageGuard — 月次制約の回帰", () => {
  it("回帰: 並列リクエストでも予約合計が月次上限を超えない", async () => {
    const guard = new InMemoryTenantUsageGuard(1000);
    const results = await Promise.all(Array.from({ length: 10 }, () => guard.reserve("tenant-a", 300)));
    const acceptedCount = results.filter(Boolean).length;
    expect(acceptedCount).toBe(3); // floor(1000 / 300)
    expect(guard.getMonthlyUsed("tenant-a")).toBe(900);
    expect(guard.getMonthlyUsed("tenant-a")).toBeLessThanOrEqual(1000);
  });

  it("テナントごとに独立してカウントする(他テナントの消費に影響されない)", async () => {
    const guard = new InMemoryTenantUsageGuard(1000);
    await guard.reserve("tenant-a", 900);
    const reservationForB = await guard.reserve("tenant-b", 900);
    expect(reservationForB).not.toBeNull();
    expect(guard.getMonthlyUsed("tenant-a")).toBe(900);
    expect(guard.getMonthlyUsed("tenant-b")).toBe(900);
  });

  it("回帰: release (予約返却) 後は再び予約できる", async () => {
    const guard = new InMemoryTenantUsageGuard(1000);
    const r1 = await guard.reserve("tenant-a", 600);
    expect(r1).not.toBeNull();
    expect(await guard.reserve("tenant-a", 600)).toBeNull(); // 1200 > 1000
    await guard.release(r1!);
    expect(await guard.reserve("tenant-a", 600)).not.toBeNull();
    expect(guard.getMonthlyUsed("tenant-a")).toBe(600);
  });

  it("finalize は実測との差分のみを反映する(予約→補正のラウンドトリップ)", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000);
    const reservation = await guard.reserve("tenant-a", 5000);
    await guard.finalize(reservation!, 3247);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(3247);
  });
});

describe("InMemoryTenantUsageGuard — 日次上限 (指示書2026-07-06_025の新規要件)", () => {
  it("月次には十分余裕があっても日次上限を超えると拒否する", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000, { dailyTokenLimit: 1000 });
    expect(await guard.reserve("tenant-a", 700)).not.toBeNull();
    expect(await guard.reserve("tenant-a", 400)).toBeNull(); // 1100 > daily limit 1000
    expect(guard.getDailyUsed("tenant-a")).toBe(700);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(700);
  });

  it("日次上限で拒否された場合、月次カウンタは加算されない(部分適用防止)", async () => {
    const guard = new InMemoryTenantUsageGuard(1_000_000, { dailyTokenLimit: 100 });
    await guard.reserve("tenant-a", 90);
    expect(await guard.reserve("tenant-a", 50)).toBeNull(); // daily: 140 > 100
    expect(guard.getMonthlyUsed("tenant-a")).toBe(90); // not 140
  });

  it("日を跨ぐと日次カウンタは独立にリセットされる(月は跨がず継続加算)", async () => {
    let currentDate = new Date("2026-07-06T12:00:00Z");
    const guard = new InMemoryTenantUsageGuard(1_000_000, {
      dailyTokenLimit: 100,
      now: () => currentDate,
    });
    await guard.reserve("tenant-a", 90);
    expect(guard.getDailyUsed("tenant-a")).toBe(90);

    currentDate = new Date("2026-07-07T00:00:01Z"); // 翌日
    expect(await guard.reserve("tenant-a", 90)).not.toBeNull(); // 新しい日次バケットなので許可
    expect(guard.getDailyUsed("tenant-a")).toBe(90);
    expect(guard.getMonthlyUsed("tenant-a")).toBe(180); // 月次は跨がず継続加算
  });

  it("超過時に AlertSink へ scope 付きで通知する", async () => {
    const alertSink = new InMemoryAlertSink();
    const guard = new InMemoryTenantUsageGuard(1_000_000, {
      dailyTokenLimit: 100,
      now: () => new Date("2026-07-06T00:00:00Z"),
      alertSink,
    });
    await guard.reserve("tenant-a", 90);
    expect(await guard.reserve("tenant-a", 50)).toBeNull();

    expect(alertSink.quotaExceededEvents).toHaveLength(1);
    expect(alertSink.quotaExceededEvents[0]).toMatchObject({
      tenantId: "tenant-a",
      scope: "daily",
      limit: 100,
    });
  });

  it("月次超過時は scope=monthly で通知する", async () => {
    const alertSink = new InMemoryAlertSink();
    const guard = new InMemoryTenantUsageGuard(100, {
      now: () => new Date("2026-07-06T00:00:00Z"),
      alertSink,
    });
    await guard.reserve("tenant-a", 90);
    expect(await guard.reserve("tenant-a", 50)).toBeNull();

    expect(alertSink.quotaExceededEvents[0]).toMatchObject({ scope: "monthly", limit: 100 });
  });
});

describe("InMemoryTenantUsageGuard — 期間境界を跨ぐ finalize/release (Codex review 2026-07-06 P2 on PR #39)", () => {
  it("回帰: UTC日境界を跨いだ release は予約日のバケットに戻り、新日のバケットを汚さない", async () => {
    let currentDate = new Date("2026-07-06T23:59:59Z");
    const guard = new InMemoryTenantUsageGuard(1_000_000, {
      dailyTokenLimit: 1000,
      now: () => currentDate,
    });

    const reservation = await guard.reserve("tenant-a", 800);
    expect(reservation).not.toBeNull();
    expect(reservation!.dailyKey).toBe("2026-07-06");
    expect(guard.getDailyUsed("tenant-a", "2026-07-06")).toBe(800);

    // 日付が変わってから release（Claude 呼び出し失敗などのケース）
    currentDate = new Date("2026-07-07T00:00:01Z");
    await guard.release(reservation!);

    // 予約日のバケットが正しく 0 に戻る（残置しない）
    expect(guard.getDailyUsed("tenant-a", "2026-07-06")).toBe(0);
    // 新日のバケットは触られていない（マイナス補正→0クランプで汚れない）
    expect(guard.getDailyUsed("tenant-a", "2026-07-07")).toBe(0);
    // 新日はフルに予約できる（修正前は前日の残置により枠が戻らなかった）
    expect(await guard.reserve("tenant-a", 1000)).not.toBeNull();
  });

  it("回帰: UTC月境界を跨いだ finalize は予約月のバケットに補正され、新月のバケットを汚さない", async () => {
    let currentDate = new Date("2026-07-31T23:59:59Z");
    const guard = new InMemoryTenantUsageGuard(1_000_000, { now: () => currentDate });

    const reservation = await guard.reserve("tenant-a", 5000);
    expect(reservation).not.toBeNull();
    expect(reservation!.monthlyKey).toBe("2026-07");

    // 月が変わってから finalize（実測 3000 に補正 = -2000 の払い戻し）
    currentDate = new Date("2026-08-01T00:00:05Z");
    await guard.finalize(reservation!, 3000);

    // 予約月 (7月) のバケットが実測値に補正される
    expect(guard.getMonthlyUsed("tenant-a", "2026-07")).toBe(3000);
    // 新月 (8月) のバケットは 0 のまま（マイナス補正が当たらない）
    expect(guard.getMonthlyUsed("tenant-a", "2026-08")).toBe(0);
  });
});

describe("yyyyMM / yyyyMMdd — スコープキーのフォーマット", () => {
  it("UTC基準でフォーマットする", () => {
    expect(yyyyMM(new Date("2026-07-06T23:59:59Z"))).toBe("2026-07");
    expect(yyyyMMdd(new Date("2026-07-06T23:59:59Z"))).toBe("2026-07-06");
    expect(yyyyMM(new Date("2026-01-06T00:00:00Z"))).toBe("2026-01");
  });
});
