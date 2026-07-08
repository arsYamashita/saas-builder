/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { GET, POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

const validProjectBody = {
  name: "Acme Booking",
  summary: "予約管理を簡単にするサービスです",
  targetUsers: "個人サロン経営者",
  problemToSolve: "予約の電話対応が大変",
  brandTone: "modern",
  templateKey: "custom",
  requiredFeatures: ["booking"],
  managedData: ["customers"],
  endUserCreatedData: [],
  roles: ["owner"],
  billingModel: "subscription",
  affiliateEnabled: false,
  visibilityRule: "public",
  mvpScope: ["booking"],
  excludedInitialScope: [],
  stackPreference: "nextjs",
  priority: "medium",
};

describe("GET/POST /api/projects — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
  });

  it("GET: does not leak the DB error when fetching projects fails", async () => {
    const dbError = fakePostgresError({
      message: 'column "internal_cost_estimate" of relation "projects" does not exist',
      code: "42703",
    });
    mockCreateAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "tenant_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    single: () =>
                      Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: null, error: dbError }),
            }),
          }),
        };
      },
    } as any);

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["internal_cost_estimate", "does not exist", "42703"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch projects" });
  });

  it("GET: does not leak an unexpected thrown error", async () => {
    mockRequireCurrentUser.mockRejectedValue(
      new Error('User profile not found: relation "users_shadow" does not exist')
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["users_shadow", "does not exist"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch projects" });
  });

  it("POST: does not leak the DB error when the atomic tenant-creation RPC fails", async () => {
    // create_tenant_with_owner sanitizes its own internal errors (see
    // supabase/migrations/0016_create_tenant_with_owner_atomic.sql), but
    // this test simulates a raw PostgrestError reaching the route anyway
    // (e.g. a network-level RPC failure) to prove the route itself never
    // forwards `.message`/`.code` to the client either.
    const dbError = fakePostgresError({
      message: 'duplicate key value violates unique constraint "tenants_slug_key"',
      code: "23505",
    });
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: dbError });
    mockCreateAdminClient.mockReturnValue({ rpc: mockRpc } as any);

    const req = new NextRequest("https://example.com/api/projects", {
      method: "POST",
      body: JSON.stringify(validProjectBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["tenants_slug_key", "duplicate key", "23505"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create tenant" });
  });

  it("POST: creates tenant/owner/project through exactly one atomic RPC call, never separate table inserts", async () => {
    // Locks in the fix for [[tenant_creation_non_transactional_orphan]]:
    // the old code made three unguarded sequential `.from(...).insert(...)`
    // calls, and a failure on the second (tenant_users) call was not even
    // checked, leaving an orphan `tenants` row with no owner. Asserting
    // that `.from()` is never called for tenants/tenant_users/projects on
    // the write path — only a single `.rpc("create_tenant_with_owner")` —
    // fixes that failure mode structurally: there is no second write call
    // left to fail independently, and thus no way to observe a tenant
    // without its owner membership.
    const mockFrom = vi.fn();
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "project-1",
          tenant_id: "tenant-1",
          name: validProjectBody.name,
          industry: validProjectBody.templateKey,
          template_key: validProjectBody.templateKey,
          status: "draft",
          description: validProjectBody.summary,
          metadata_json: {},
          created_by: "user-1",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      error: null,
    });
    mockCreateAdminClient.mockReturnValue({
      rpc: mockRpc,
      from: mockFrom,
    } as any);

    const req = new NextRequest("https://example.com/api/projects", {
      method: "POST",
      body: JSON.stringify(validProjectBody),
    });

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith(
      "create_tenant_with_owner",
      expect.objectContaining({
        p_user_id: "user-1",
        p_template_key: validProjectBody.templateKey,
      })
    );
    // No fallback/legacy `.from("tenants"|"tenant_users"|"projects").insert(...)`
    // path exists anymore — the write is 100% inside the RPC.
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("POST: does not leak internal detail and returns 500 when the RPC reports success but returns no row", async () => {
    // Defends against a future refactor accidentally treating `{ data: null,
    // error: null }` (or an empty array) as success — the orphan bug this
    // migration fixes was exactly this class of "unchecked partial result"
    // mistake, just one layer up (an unchecked .insert() instead of an
    // unchecked empty RPC result).
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    mockCreateAdminClient.mockReturnValue({ rpc: mockRpc } as any);

    const req = new NextRequest("https://example.com/api/projects", {
      method: "POST",
      body: JSON.stringify(validProjectBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create tenant" });
  });
});
