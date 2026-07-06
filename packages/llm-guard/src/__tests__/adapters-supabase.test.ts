import { describe, it, expect } from "vitest";
import { supabaseUsageStore, type SupabaseRpcClient } from "../adapters/supabase";
import { InMemoryAlertSink } from "../core/alerts";

/**
 * 実 Supabase / Postgres には一切接続しない。
 * `sql/supabase-usage-schema.sql` の `reserve_llm_usage` / `adjust_llm_usage`
 * RPC の意味論（日次+月次を1回でアトミックに判定・加算し、超過した軸を
 * 返す）をインメモリで再現するフェイク RPC クライアント。
 */
function createFakeSupabase(): SupabaseRpcClient {
  const daily = new Map<string, number>();
  const monthly = new Map<string, number>();

  return {
    async rpc<T>(fn: string, params: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
      const tenantId = params.p_tenant_id as string;
      const provider = params.p_provider as string;
      const key = `${tenantId}:${provider}`;

      if (fn === "reserve_llm_usage") {
        const tokens = params.p_tokens as number;
        const dailyLimit = params.p_daily_limit as number;
        const monthlyLimit = params.p_monthly_limit as number;
        const dUsed = daily.get(key) ?? 0;
        const mUsed = monthly.get(key) ?? 0;

        if (mUsed + tokens > monthlyLimit) {
          return { data: { accepted: false, scope: "monthly", used: mUsed, limit: monthlyLimit } as T, error: null };
        }
        if (dUsed + tokens > dailyLimit) {
          return { data: { accepted: false, scope: "daily", used: dUsed, limit: dailyLimit } as T, error: null };
        }
        daily.set(key, dUsed + tokens);
        monthly.set(key, mUsed + tokens);
        return { data: { accepted: true, scope: null, used: dUsed + tokens, limit: dailyLimit } as T, error: null };
      }

      if (fn === "adjust_llm_usage") {
        const delta = params.p_delta as number;
        daily.set(key, Math.max(0, (daily.get(key) ?? 0) + delta));
        monthly.set(key, Math.max(0, (monthly.get(key) ?? 0) + delta));
        return { data: null, error: null };
      }

      throw new Error(`unexpected rpc: ${fn}`);
    },
  };
}

describe("supabaseUsageStore — ai-business-navigator reserve_api_usage 移植の回帰", () => {
  it("上限内なら予約に成功する", async () => {
    const client = createFakeSupabase();
    const store = supabaseUsageStore(client, { provider: "claude", dailyTokenLimit: 1000, monthlyTokenLimit: 1_000_000 });
    expect(await store.reserve("tenant-a", 300)).toBe(true);
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
    expect(await store.reserve("tenant-a", 50)).toBe(false);
    expect(alertSink.quotaExceededEvents).toHaveLength(1);
    expect(alertSink.quotaExceededEvents[0].scope).toBe("monthly");
  });

  it("release後は再予約できる", async () => {
    const client = createFakeSupabase();
    const store = supabaseUsageStore(client, { provider: "claude", dailyTokenLimit: 1000, monthlyTokenLimit: 1000 });
    await store.reserve("tenant-a", 600);
    expect(await store.reserve("tenant-a", 600)).toBe(false);
    await store.release("tenant-a", 600);
    expect(await store.reserve("tenant-a", 600)).toBe(true);
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
