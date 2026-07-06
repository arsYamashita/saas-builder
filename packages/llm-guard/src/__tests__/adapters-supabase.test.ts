import { describe, it, expect } from "vitest";
import { supabaseUsageStore, type SupabaseRpcClient } from "../adapters/supabase";
import { InMemoryAlertSink } from "../core/alerts";

/**
 * 実 Supabase / Postgres には一切接続しない。
 * `sql/supabase-usage-schema.sql` の `reserve_llm_usage` / `adjust_llm_usage`
 * RPC の意味論（日次+月次を1回でアトミックに判定・加算し、超過した軸を
 * 返す。期間キーはクライアントが p_day/p_month で渡す — Codex review
 * 2026-07-06 P2 on PR #39）をインメモリで再現するフェイク RPC クライアント。
 */
function createFakeSupabase(): SupabaseRpcClient & { readBucket(kind: "daily" | "monthly", key: string): number } {
  // キー: `${tenantId}:${provider}:${period}` — RPC に渡された p_day/p_month を
  // そのまま period に使う（実SQLの (tenant_id, provider, day/month) 主キーと同じ意味論）。
  const daily = new Map<string, number>();
  const monthly = new Map<string, number>();

  return {
    async rpc<T>(fn: string, params: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
      const tenantId = params.p_tenant_id as string;
      const provider = params.p_provider as string;
      const day = params.p_day as string;
      const month = params.p_month as string;
      const dKey = `${tenantId}:${provider}:${day}`;
      const mKey = `${tenantId}:${provider}:${month}`;

      if (fn === "reserve_llm_usage") {
        const tokens = params.p_tokens as number;
        const dailyLimit = params.p_daily_limit as number;
        const monthlyLimit = params.p_monthly_limit as number;
        const dUsed = daily.get(dKey) ?? 0;
        const mUsed = monthly.get(mKey) ?? 0;

        if (mUsed + tokens > monthlyLimit) {
          return { data: { accepted: false, scope: "monthly", used: mUsed, limit: monthlyLimit } as T, error: null };
        }
        if (dUsed + tokens > dailyLimit) {
          return { data: { accepted: false, scope: "daily", used: dUsed, limit: dailyLimit } as T, error: null };
        }
        daily.set(dKey, dUsed + tokens);
        monthly.set(mKey, mUsed + tokens);
        return { data: { accepted: true, scope: null, used: dUsed + tokens, limit: dailyLimit } as T, error: null };
      }

      if (fn === "adjust_llm_usage") {
        const delta = params.p_delta as number;
        daily.set(dKey, Math.max(0, (daily.get(dKey) ?? 0) + delta));
        monthly.set(mKey, Math.max(0, (monthly.get(mKey) ?? 0) + delta));
        return { data: null, error: null };
      }

      throw new Error(`unexpected rpc: ${fn}`);
    },
    readBucket(kind: "daily" | "monthly", key: string): number {
      return (kind === "daily" ? daily : monthly).get(key) ?? 0;
    },
  };
}

describe("supabaseUsageStore — ai-business-navigator reserve_api_usage 移植の回帰", () => {
  it("上限内なら予約に成功し、Reservation (予約時期間キー付き) が返る", async () => {
    const client = createFakeSupabase();
    const store = supabaseUsageStore(client, {
      provider: "claude",
      dailyTokenLimit: 1000,
      monthlyTokenLimit: 1_000_000,
      now: () => new Date("2026-07-06T12:00:00Z"),
    });
    const reservation = await store.reserve("tenant-a", 300);
    expect(reservation).not.toBeNull();
    expect(reservation!.dailyKey).toBe("2026-07-06");
    expect(reservation!.monthlyKey).toBe("2026-07");
  });

  it("月次上限を超えると拒否し、AlertSinkにscope=monthlyで通知する", async () => {
    const client = createFakeSupabase();
    const alertSink = new InMemoryAlertSink();
    const store = supabaseUsageStore(client, {
      provider: "claude",
      dailyTokenLimit: 1_000_000,
      monthlyTokenLimit: 100,
      alertSink,
    });
    await store.reserve("tenant-a", 90);
    expect(await store.reserve("tenant-a", 50)).toBeNull();
    expect(alertSink.quotaExceededEvents).toHaveLength(1);
    expect(alertSink.quotaExceededEvents[0].scope).toBe("monthly");
  });

  it("release後は再予約できる", async () => {
    const client = createFakeSupabase();
    const store = supabaseUsageStore(client, { provider: "claude", dailyTokenLimit: 1000, monthlyTokenLimit: 1000 });
    const r1 = await store.reserve("tenant-a", 600);
    expect(r1).not.toBeNull();
    expect(await store.reserve("tenant-a", 600)).toBeNull();
    await store.release(r1!);
    expect(await store.reserve("tenant-a", 600)).not.toBeNull();
  });

  it("回帰: UTC日境界を跨いだ release は予約日の行 (p_day=予約時キー) に補正される (Codex review 2026-07-06 P2 on PR #39)", async () => {
    let currentDate = new Date("2026-07-06T23:59:59Z");
    const client = createFakeSupabase();
    const store = supabaseUsageStore(client, {
      provider: "claude",
      dailyTokenLimit: 1000,
      monthlyTokenLimit: 1_000_000,
      now: () => currentDate,
    });

    const reservation = await store.reserve("tenant-a", 800);
    expect(reservation).not.toBeNull();
    expect(client.readBucket("daily", "tenant-a:claude:2026-07-06")).toBe(800);

    // 日付が変わってから release — 補正は予約日 (7/6) の行に当たること
    currentDate = new Date("2026-07-07T00:00:01Z");
    await store.release(reservation!);

    expect(client.readBucket("daily", "tenant-a:claude:2026-07-06")).toBe(0); // 予約日の枠が戻る
    expect(client.readBucket("daily", "tenant-a:claude:2026-07-07")).toBe(0); // 新日は汚れない
    // 新日はフルに予約できる
    expect(await store.reserve("tenant-a", 1000)).not.toBeNull();
  });

  it("回帰: UTC月境界を跨いだ finalize は予約月の行 (p_month=予約時キー) に補正される", async () => {
    let currentDate = new Date("2026-07-31T23:59:59Z");
    const client = createFakeSupabase();
    const store = supabaseUsageStore(client, {
      provider: "claude",
      dailyTokenLimit: 1_000_000,
      monthlyTokenLimit: 1_000_000,
      now: () => currentDate,
    });

    const reservation = await store.reserve("tenant-a", 5000);
    expect(reservation).not.toBeNull();

    currentDate = new Date("2026-08-01T00:00:05Z");
    await store.finalize(reservation!, 3000);

    expect(client.readBucket("monthly", "tenant-a:claude:2026-07-01")).toBe(3000); // 予約月に補正
    expect(client.readBucket("monthly", "tenant-a:claude:2026-08-01")).toBe(0); // 新月は汚れない
  });

  it("RPCエラー時はフェイルクローズで例外を投げる(サイレントに許可しない)", async () => {
    const client: SupabaseRpcClient = {
      async rpc() {
        return { data: null, error: { message: "connection refused" } };
      },
    };
    const store = supabaseUsageStore(client, { provider: "claude" });
    await expect(store.reserve("tenant-a", 100)).rejects.toThrow(/connection refused/);
  });
});
