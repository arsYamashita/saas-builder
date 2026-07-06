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
import { GET, POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireTenantRole = vi.mocked(requireTenantRole);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

const DB_ERROR = fakePostgresError({
  message: 'column "internal_margin_bps" of relation "membership_plans" does not exist',
  code: "42703",
});
const FORBIDDEN = ["internal_margin_bps", "does not exist", "42703"];

describe("GET/POST /api/domain/membership-plans — error-leak wiring", () => {
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
            order: () => Promise.resolve({ data: null, error: DB_ERROR }),
          }),
        }),
      }),
    } as any);

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch plans" });
  });

  it("POST: does not leak the DB error when the insert fails", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: DB_ERROR }),
          }),
        }),
      }),
    } as any);

    const req = new NextRequest("https://example.com/api/domain/membership-plans", {
      method: "POST",
      body: JSON.stringify({ name: "Gold", status: "active" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create plan" });
  });
});
