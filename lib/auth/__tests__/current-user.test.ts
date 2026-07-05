import { describe, it, expect, vi, beforeEach } from "vitest";

// See [[multitenant_tenant_selection_nondeterministic]]: requireTenantUser()
// used to do `.limit(1).single()` with no ORDER BY, so Postgres could return
// a different tenant on every call for a user with multiple active
// memberships. These tests lock in that the query is now deterministically
// ordered (created_at, then id, ascending).

vi.mock("@/lib/auth/session", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const orderCalls: Array<[string, unknown]> = [];

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantUser, requireRunAccess } from "../current-user";

const mockCreateAdminClient = vi.mocked(createAdminClient);

function buildAdminClientMock() {
  return {
    from(table: string) {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { display_name: "Test User" },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "tenant_users") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = (column: string, opts: unknown) => {
          orderCalls.push([column, opts]);
          return chain;
        };
        chain.limit = () => chain;
        chain.single = async () => ({
          data: { tenant_id: "tenant-earliest" },
          error: null,
        });
        return chain;
      }

      throw new Error(`Unexpected table in test: ${table}`);
    },
  };
}

describe("requireTenantUser", () => {
  beforeEach(() => {
    orderCalls.length = 0;
    mockCreateAdminClient.mockReturnValue(buildAdminClientMock() as any);
  });

  it("orders tenant_users by created_at then id (both ascending) before limiting to 1", async () => {
    await requireTenantUser();

    expect(orderCalls).toEqual([
      ["created_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  it("returns the deterministically-selected tenant_id", async () => {
    const result = await requireTenantUser();
    expect(result.tenantId).toBe("tenant-earliest");
    expect(result.user.id).toBe("user-1");
  });
});

// ── requireRunAccess: lazy stuck-step reset ──────────────────
// See [[ai_generation_step_stuck_running]].

describe("requireRunAccess", () => {
  function buildRunAdminClientMock(run: Record<string, unknown>) {
    const updateCalls: Record<string, unknown>[] = [];

    return {
      __updateCalls: updateCalls,
      from(table: string) {
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { display_name: "Test User" }, error: null }),
              }),
            }),
          };
        }
        if (table === "tenant_users") {
          const chain: Record<string, unknown> = {};
          chain.select = () => chain;
          chain.eq = () => chain;
          chain.order = () => chain;
          chain.limit = () => chain;
          chain.single = async () => ({ data: { tenant_id: "tenant-1" }, error: null });
          return chain;
        }
        if (table === "generation_runs") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({ data: run, error: null }),
                }),
              }),
            }),
            update: (payload: Record<string, unknown>) => ({
              eq: async () => {
                updateCalls.push(payload);
                return { data: null, error: null };
              },
            }),
          };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      },
    };
  }

  it("does not write back when no step is stuck", async () => {
    const run = {
      id: "run-1",
      steps_json: [
        { key: "blueprint", label: "Generate Blueprint", status: "completed" },
      ],
    };
    const fake = buildRunAdminClientMock(run);
    mockCreateAdminClient.mockReturnValue(fake as any);

    const result = await requireRunAccess("run-1");

    expect(fake.__updateCalls).toHaveLength(0);
    expect(result.run.steps_json).toEqual(run.steps_json);
  });

  it("resets a stuck running step and persists the change", async () => {
    const staleStartedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const run = {
      id: "run-1",
      current_step: "implementation",
      steps_json: [
        { key: "blueprint", label: "Generate Blueprint", status: "completed" },
        {
          key: "implementation",
          label: "Generate Implementation",
          status: "running",
          meta: { startedAt: staleStartedAt },
        },
      ],
    };
    const fake = buildRunAdminClientMock(run);
    mockCreateAdminClient.mockReturnValue(fake as any);

    const result = await requireRunAccess("run-1");

    expect(fake.__updateCalls).toHaveLength(1);
    expect(fake.__updateCalls[0]).toMatchObject({ current_step: null });

    const impl = (result.run.steps_json as Array<Record<string, unknown>>).find(
      (s) => s.key === "implementation"
    )!;
    expect(impl.status).toBe("failed");
  });
});
