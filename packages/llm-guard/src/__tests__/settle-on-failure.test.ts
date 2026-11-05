import { describe, it, expect, vi } from "vitest";
import { InMemoryTenantUsageGuard, type Reservation } from "../core/reservation";
import { isProviderStatusRejection, settleOnFailure } from "../core/settle";

const TENANT = "tenant-1";
const ESTIMATE = 8000;

async function setup() {
  const guard = new InMemoryTenantUsageGuard(1_000_000, { dailyTokenLimit: 100_000 });
  // 予約前に別の使用量を入れておき、「予約前の値に戻る」ことを確かめる
  const before = await guard.reserve(TENANT, 500);
  if (!before) throw new Error("setup reserve failed");
  const reservation = (await guard.reserve(TENANT, ESTIMATE)) as Reservation;
  expect(guard.getMonthlyUsed(TENANT)).toBe(500 + ESTIMATE);
  return { guard, reservation };
}

function withStatus(status: unknown): Error {
  return Object.assign(new Error("failed"), { status });
}

describe("isProviderStatusRejection", () => {
  it.each([400, 429, 500, 529, 599])("status %i は状態付きの拒否", (s) => {
    expect(isProviderStatusRejection(withStatus(s))).toBe(true);
  });
  it.each([200, 399, 600, "429", undefined, null, NaN])("status %s は拒否とみなさない", (s) => {
    expect(isProviderStatusRejection(withStatus(s))).toBe(false);
  });
  it("null / 文字列 / undefined の err でも投げない", () => {
    expect(isProviderStatusRejection(null)).toBe(false);
    expect(isProviderStatusRejection(undefined)).toBe(false);
    expect(isProviderStatusRejection("boom")).toBe(false);
  });
});

describe("settleOnFailure", () => {
  it.each([400, 429, 500, 529])("status %i: 日次・月次とも予約前の値に戻る", async (status) => {
    const { guard, reservation } = await setup();
    const result = await settleOnFailure(guard, reservation, withStatus(status));
    expect(result).toBe("released");
    expect(guard.getMonthlyUsed(TENANT)).toBe(500);
    expect(guard.getDailyUsed(TENANT)).toBe(500);
  });

  it.each([
    ["new Error(timeout)", new Error("timeout")],
    ["APIConnectionTimeoutError", Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" })],
    ["APIUserAbortError", Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" })],
  ])("状態の無い失敗 (%s): 見込み額が使用量に残る", async (_label, err) => {
    const { guard, reservation } = await setup();
    const result = await settleOnFailure(guard, reservation, err);
    expect(result).toBe("finalized_estimate");
    expect(guard.getMonthlyUsed(TENANT)).toBe(500 + ESTIMATE);
    expect(guard.getDailyUsed(TENANT)).toBe(500 + ESTIMATE);
  });

  it.each([200, 399, 600, "429"])("status %s: 状態付きとみなさず見込み額で確定する", async (status) => {
    const { guard, reservation } = await setup();
    const result = await settleOnFailure(guard, reservation, withStatus(status));
    expect(result).toBe("finalized_estimate");
    expect(guard.getMonthlyUsed(TENANT)).toBe(500 + ESTIMATE);
  });

  it("release が投げても settleOnFailure は投げない", async () => {
    const { reservation } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = {
      finalize: vi.fn(),
      release: vi.fn().mockRejectedValue(new Error("db down")),
    };
    await expect(settleOnFailure(guard, reservation, withStatus(529))).resolves.toBe("released");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("finalize が投げても settleOnFailure は投げない", async () => {
    const { reservation } = await setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guard = {
      finalize: vi.fn().mockRejectedValue(new Error("db down")),
      release: vi.fn(),
    };
    await expect(settleOnFailure(guard, reservation, new Error("timeout"))).resolves.toBe("finalized_estimate");
    expect(guard.finalize).toHaveBeenCalledWith(reservation, ESTIMATE);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
