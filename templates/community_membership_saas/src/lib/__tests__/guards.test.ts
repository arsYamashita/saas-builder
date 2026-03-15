// ============================================================
// guards.ts — Unit Tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase ───

const mockMembershipSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockMembershipSelect,
}));

const mockGetUser = vi.fn();

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/db/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}));

// ─── Import after mocks ───

const {
  requireAuth,
  requireTenantMember,
  requireRole,
  assertTenantAccess,
  GuardError,
  handleGuardError,
} = await import("../guards");

// ─── Helpers ───

function mockMembershipChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = handler;
  chain.eq = handler;
  chain.single = () => ({ data, error });
  mockFrom.mockReturnValue(chain);
}

describe("requireAuth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns user when authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1", email: "test@example.com" } },
      error: null,
    });

    const result = await requireAuth();
    expect(result).toEqual({ id: "u1", email: "test@example.com" });
  });

  it("throws 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "not authenticated" },
    });

    await expect(requireAuth()).rejects.toThrow(GuardError);
    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("requireTenantMember", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns member when active membership exists", async () => {
    mockMembershipChain({ id: "m1", role: "admin", status: "active" });

    const result = await requireTenantMember("u1", "t1");
    expect(result).toMatchObject({
      id: "u1",
      tenantId: "t1",
      membershipId: "m1",
      role: "admin",
    });
  });

  it("throws 403 when no active membership", async () => {
    mockMembershipChain(null, { message: "not found" });

    await expect(requireTenantMember("u1", "t1")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("requireRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows when role meets requirement", async () => {
    mockMembershipChain({ id: "m1", role: "admin", status: "active" });
    const result = await requireRole("u1", "t1", "admin");
    expect(result.role).toBe("admin");
  });

  it("allows higher role than required", async () => {
    mockMembershipChain({ id: "m1", role: "owner", status: "active" });
    const result = await requireRole("u1", "t1", "editor");
    expect(result.role).toBe("owner");
  });

  it("throws 403 when role is insufficient", async () => {
    mockMembershipChain({ id: "m1", role: "member", status: "active" });

    await expect(requireRole("u1", "t1", "editor")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("throws 403 when member tries admin action", async () => {
    mockMembershipChain({ id: "m1", role: "member", status: "active" });

    await expect(requireRole("u1", "t1", "admin")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("assertTenantAccess", () => {
  it("passes when tenant IDs match", () => {
    expect(() => assertTenantAccess("t1", "t1")).not.toThrow();
  });

  it("throws 403 when tenant IDs differ", () => {
    expect(() => assertTenantAccess("t1", "t2")).toThrow(GuardError);
    try {
      assertTenantAccess("t1", "t2");
    } catch (e) {
      expect((e as GuardError).statusCode).toBe(403);
      expect((e as GuardError).message).toBe("Cross-tenant access denied");
    }
  });
});

describe("handleGuardError", () => {
  it("converts GuardError to Response with correct status", () => {
    const error = new GuardError(403, "Forbidden");
    const response = handleGuardError(error);
    expect(response.status).toBe(403);
  });

  it("converts unknown error to 500", () => {
    const response = handleGuardError(new Error("unexpected"));
    expect(response.status).toBe(500);
  });

  it("handles non-Error objects", () => {
    const response = handleGuardError("string error");
    expect(response.status).toBe(500);
  });
});
