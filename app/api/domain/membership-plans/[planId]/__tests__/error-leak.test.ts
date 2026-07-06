/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/rbac/guards", () => ({
  requireTenantRole: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/audit/write-audit-log", () => ({
  writeAuditLog: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { GET, PATCH, DELETE } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireTenantRole = vi.mocked(requireTenantRole);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

const params = Promise.resolve({ planId: "plan-1" });

const SELECT_ERROR = fakePostgresError({
  message: 'permission denied for relation "membership_plans_cost_basis"',
  code: "42501",
});
const FK_ERROR = fakePostgresError({
  message:
    'update or delete on table "membership_plans" violates foreign key constraint "fk_subscriptions_plan_id" on table "subscriptions"',
  code: "23503",
});
const FORBIDDEN_SELECT = ["membership_plans_cost_basis", "permission denied", "42501"];
const FORBIDDEN_FK = ["fk_subscriptions_plan_id", "subscriptions", "23503"];

describe("GET/PATCH/DELETE /api/domain/membership-plans/[planId] — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireTenantRole.mockResolvedValue({ tenant_id: "tenant-1", role: "admin" } as any);
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com", displayName: null } as any);
  });

  it("GET: does not leak the DB error when the select fails", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: SELECT_ERROR }),
            }),
          }),
        }),
      }),
    } as any);

    const res = await GET(new NextRequest("https://example.com"), { params });
    expect(res.status).toBe(404);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN_SELECT);
    expect(JSON.parse(text)).toEqual({ error: "Plan not found" });
  });

  it("PATCH: does not leak the DB error when the update fails", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { id: "plan-1" }, error: null }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: null, error: SELECT_ERROR }),
              }),
            }),
          }),
        }),
      }),
    } as any);

    const req = new NextRequest("https://example.com", {
      method: "PATCH",
      body: JSON.stringify({ name: "Gold", status: "active" }),
    });

    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN_SELECT);
    expect(JSON.parse(text)).toEqual({ error: "Failed to update plan" });
  });

  it("DELETE: does not leak the FK-violation detail (table/constraint names) on the friendly 409", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { id: "plan-1" }, error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: FK_ERROR }),
          }),
        }),
      }),
    } as any);

    const res = await DELETE(new NextRequest("https://example.com"), { params });
    expect(res.status).toBe(409);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN_FK);
    expect(JSON.parse(text)).toEqual({
      error: "Cannot delete plan: it is referenced by other records",
    });
  });
});
