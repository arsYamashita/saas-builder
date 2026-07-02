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
import { requireTenantUser } from "../current-user";

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
