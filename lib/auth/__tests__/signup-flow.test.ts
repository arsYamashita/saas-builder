import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// 指示書186: 登録フローをやり直せる形にする。
// (a) runSignupFlow を 2 回呼んでも tenants / tenant_users は 1 つずつ
// (b) テナント作成に失敗したあと getCurrentTenantForUser で立て直される
// (c) Supabase の応答が遅くても (3〜7 秒) 登録が maxDuration の内側で通る

type Row = Record<string, unknown>;

type FakeOptions = {
  /** 全ての呼び出し (問い合わせ・RPC・認証) に足す遅延を返す。ミリ秒。 */
  delay?: () => number;
  /** true の間、ensure_signup_tenant は何も作らずに失敗する (ロールバック済みを模す)。 */
  failRpc?: boolean;
};

function createFakeDb(options: FakeOptions = {}) {
  const tables: Record<string, Row[]> = {
    users: [],
    tenants: [],
    tenant_users: [],
  };
  const calls = { rpc: 0, rawInsert: 0 };
  const state = { failRpc: options.failRpc ?? false };
  let seq = 0;

  const wait = async () => {
    const ms = options.delay?.() ?? 0;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  };

  function activeMembership(userId: string) {
    const row = tables.tenant_users
      .filter((r) => r.user_id === userId && r.status === "active")
      .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)))[0];
    if (!row) return null;
    return {
      tenant_id: row.tenant_id,
      role: row.role,
      status: row.status,
      tenants: tables.tenants.find((t) => t.id === row.tenant_id) ?? null,
    };
  }

  const client = {
    from(table: string) {
      return {
        upsert(values: Row) {
          return {
            select: () => ({
              single: async () => {
                await wait();
                const i = tables[table].findIndex((r) => r.id === values.id);
                if (i >= 0) tables[table][i] = { ...tables[table][i], ...values };
                else tables[table].push({ ...values });
                return { data: values, error: null };
              },
            }),
          };
        },
        // 素の insert は禁止。呼ばれたら数えて、試験で 0 件を確認する。
        insert() {
          calls.rawInsert += 1;
          throw new Error(`raw insert into ${table} is not allowed`);
        },
        select() {
          const filters: Record<string, unknown> = {};
          const q = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return q;
            },
            order: () => q,
            limit: () => q,
            single: async () => {
              await wait();
              const row = tables[table].find((r) => r.id === filters.id);
              return row
                ? { data: row, error: null }
                : {
                    data: null,
                    error: { code: "PGRST116", message: "0 rows" },
                  };
            },
            maybeSingle: async () => {
              await wait();
              if (table === "tenant_users") {
                return {
                  data: activeMembership(String(filters.user_id)),
                  error: null,
                };
              }
              // affiliates など、この試験では常に「無い」
              return { data: null, error: null };
            },
          };
          return q;
        },
      };
    },
    async rpc(name: string, args: Row) {
      await wait();
      calls.rpc += 1;
      if (name !== "ensure_signup_tenant") {
        return { data: null, error: { message: "unknown rpc" } };
      }
      if (state.failRpc) {
        return { data: null, error: { message: "tenant creation failed" } };
      }
      // RPC 本体 (0020 の SQL) と同じ振る舞い: 既存所属があれば作らない。
      let created = false;
      let membership = activeMembership(String(args.p_user_id));
      if (!membership) {
        seq += 1;
        const tenant = {
          id: `tenant-${seq}`,
          name: args.p_name,
          slug: args.p_slug,
          owner_user_id: args.p_user_id,
          plan_type: "starter",
          status: "active",
        };
        tables.tenants.push(tenant);
        tables.tenant_users.push({
          tenant_id: tenant.id,
          user_id: args.p_user_id,
          role: "owner",
          status: "active",
          joined_at: new Date().toISOString(),
        });
        created = true;
        membership = activeMembership(String(args.p_user_id));
      }
      const t = membership!.tenants as Row;
      return {
        data: [
          {
            tenant_id: t.id,
            tenant_name: t.name,
            tenant_slug: t.slug,
            owner_user_id: t.owner_user_id,
            plan_type: t.plan_type,
            tenant_status: t.status,
            created,
          },
        ],
        error: null,
      };
    },
  };

  return { client, tables, calls, state, wait };
}

let db: ReturnType<typeof createFakeDb>;

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: () => db.client,
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: "user-1", email: "user1@example.com", displayName: null },
  })),
}));

vi.mock("@/lib/affiliate/find-affiliate-by-code", () => ({
  findAffiliateByCode: vi.fn(async () => {
    await db.wait();
    return { id: "aff-1" };
  }),
}));

vi.mock("@/lib/affiliate/find-or-create-referral", () => ({
  findOrCreateReferral: vi.fn(async () => {
    // 実装は最大 3 回の問い合わせをするので、3 回分待つ。
    await db.wait();
    await db.wait();
    await db.wait();
    return { id: "ref-1" };
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => true),
}));

const serverClientHolder: { client: unknown } = { client: null };
vi.mock("@/lib/db/supabase/server", () => ({
  createClient: async () => serverClientHolder.client,
}));

import { runSignupFlow } from "../signup-flow";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";
import { POST, maxDuration } from "@/app/api/auth/signup/route";

const signupArgs = {
  userId: "user-1",
  email: "user1@example.com",
  displayName: "User One",
  tenantName: "Acme",
};

beforeEach(() => {
  db = createFakeDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("runSignupFlow の冪等性", () => {
  it("(a) 2 回呼んでも tenants と tenant_users は 1 つずつ", async () => {
    const first = await runSignupFlow(signupArgs);
    const second = await runSignupFlow(signupArgs);

    expect(db.tables.tenants).toHaveLength(1);
    expect(db.tables.tenant_users).toHaveLength(1);
    expect(second.tenant.id).toBe(first.tenant.id);
    // 2 回目は既存所属が見つかるので RPC まで進まない。
    expect(db.calls.rpc).toBe(1);
    expect(db.calls.rawInsert).toBe(0);
  });

  it("(a) 同時に呼んでも (RPC 側の既存確認で) 1 つだけ", async () => {
    await Promise.all([runSignupFlow(signupArgs), runSignupFlow(signupArgs)]);
    // フェイクの RPC は同期的に完結するため、先に着いた 1 件だけが作る。
    expect(db.tables.tenants).toHaveLength(1);
    expect(db.tables.tenant_users).toHaveLength(1);
  });

  it("RPC が失敗したら throw し、素の insert は行わない", async () => {
    db.state.failRpc = true;
    await expect(runSignupFlow(signupArgs)).rejects.toThrow(
      /Failed to create tenant/
    );
    expect(db.tables.tenants).toHaveLength(0);
    expect(db.tables.tenant_users).toHaveLength(0);
    expect(db.calls.rawInsert).toBe(0);
  });
});

describe("getCurrentTenantForUser の立て直し", () => {
  it("(b) テナント作成に失敗したあとに呼ぶと所属が立て直される", async () => {
    db.state.failRpc = true;
    await expect(runSignupFlow(signupArgs)).rejects.toThrow();
    expect(db.tables.tenant_users).toHaveLength(0);

    // 障害が直った状態で、ログイン後の最初のアクセスを模す。
    db.state.failRpc = false;
    const membership = await getCurrentTenantForUser();

    expect(membership.role).toBe("owner");
    expect(db.tables.tenants).toHaveLength(1);
    expect(db.tables.tenant_users).toHaveLength(1);

    // もう一度呼んでも増えない。
    await getCurrentTenantForUser();
    expect(db.tables.tenants).toHaveLength(1);
    expect(db.tables.tenant_users).toHaveLength(1);
  });

  it("(b) 立て直しは 1 回だけ。直らないなら従来どおり throw する", async () => {
    db.state.failRpc = true;
    await expect(getCurrentTenantForUser()).rejects.toThrow(
      /Failed to create tenant/
    );
    expect(db.calls.rpc).toBe(1);
  });

  it("所属があれば立て直しの処理は呼ばれない", async () => {
    await runSignupFlow(signupArgs);
    const before = db.calls.rpc;
    await getCurrentTenantForUser();
    expect(db.calls.rpc).toBe(before);
  });
});

describe("users 行なしで中断した人の立て直し (入口は requireCurrentUser)", () => {
  it("users 行なし -> 復旧 -> 解決。テナントと所属は 1 つ、再呼び出しで増えない", async () => {
    expect(db.tables.users).toHaveLength(0);

    const user = await requireCurrentUser();

    expect(user.id).toBe("user-1");
    expect(db.tables.users).toHaveLength(1);
    expect(db.tables.tenants).toHaveLength(1);
    expect(db.tables.tenant_users).toHaveLength(1);

    await requireCurrentUser();
    await getCurrentTenantForUser();
    expect(db.tables.users).toHaveLength(1);
    expect(db.tables.tenants).toHaveLength(1);
    expect(db.tables.tenant_users).toHaveLength(1);
    expect(db.calls.rpc).toBe(1);
  });

  it("復旧は 1 回だけ。RPC が失敗し続けるなら throw し、RPC は 1 回しか呼ばない", async () => {
    db.state.failRpc = true;
    await expect(requireCurrentUser()).rejects.toThrow(
      /Failed to create tenant/
    );
    expect(db.calls.rpc).toBe(1);
  });

  it("users 行があれば復旧処理は走らない", async () => {
    await runSignupFlow(signupArgs);
    const before = db.calls.rpc;
    await requireCurrentUser();
    expect(db.calls.rpc).toBe(before);
  });
});

describe("(c) 応答の遅い Supabase でも maxDuration の内側で通る", () => {
  it("1 回 7 秒 (最悪) の遅延でも合計が maxDuration 未満で 201 を返す", async () => {
    vi.useFakeTimers();
    db = createFakeDb({ delay: () => 7000 });

    const slow = async <T,>(value: T): Promise<T> => {
      await db.wait();
      return value;
    };
    serverClientHolder.client = {
      auth: {
        signUp: () => slow({ data: { user: { id: "user-1" } }, error: null }),
        signInWithPassword: () => slow({ data: {}, error: null }),
      },
    };

    const req = new NextRequest("http://localhost/api/auth/signup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // 紹介コードつき = 待ちが最も多い経路
        cookie: "affiliate_code=ABC; visitor_token=tok",
      },
      body: JSON.stringify({
        email: "user1@example.com",
        password: "password-1234",
        displayName: "User One",
        tenantName: "Acme",
      }),
    });

    const start = Date.now();
    const pending = POST(req);
    await vi.runAllTimersAsync();
    const res = await pending;
    const elapsedMs = Date.now() - start;

    expect(res.status).toBe(201);
    expect(db.tables.tenants).toHaveLength(1);
    // signUp 1 + upsert 1 + 所属確認 1 + RPC 1 + affiliate 1 + referral 3 + signIn 1 = 9 回 x 7 秒
    expect(elapsedMs).toBe(63_000);
    expect(elapsedMs).toBeLessThan(maxDuration * 1000);
  });

  it("maxDuration は 60 秒を超える明示値", () => {
    expect(maxDuration).toBeGreaterThan(60);
  });
});
