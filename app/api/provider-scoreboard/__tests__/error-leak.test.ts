/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 *
 * This route has a schema-migration fallback: if the "full" query fails
 * with a message containing "does not exist" (migration 0009 not yet
 * applied), it retries with a smaller column list. That fallback trigger is
 * a legitimate business behavior, not a leak — this test confirms BOTH the
 * full-query failure and the fallback-query failure still only ever
 * produce the route's fixed generic message on the wire.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireTenantUser: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantUser } from "@/lib/auth/current-user";
import { GET } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireTenantUser = vi.mocked(requireTenantUser);

function mockSupabaseWithProjectsAnd(generationRunsHandler: () => any) {
  return {
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [{ id: "project-1" }], error: null }),
          }),
        };
      }
      if (table === "generation_runs") {
        return generationRunsHandler();
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("GET /api/provider-scoreboard — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantUser.mockResolvedValue({
      user: { id: "user-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when the full generation_runs query fails (non-migration error)", async () => {
    const dbError = fakePostgresError({
      message: 'permission denied for relation "generation_runs_internal_cost"',
      code: "42501",
    });
    mockCreateAdminClient.mockReturnValue(
      mockSupabaseWithProjectsAnd(() => ({
        select: () => ({
          in: () => ({
            order: () => Promise.resolve({ data: null, error: dbError }),
          }),
        }),
      })) as any
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "generation_runs_internal_cost",
      "permission denied",
      "42501",
    ]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch generation runs" });
  });

  it("does not leak the DB error when the migration-fallback query also fails", async () => {
    const fullErr = fakePostgresError({
      message: 'column "promoted_at" of relation "generation_runs" does not exist',
      code: "42703",
    });
    const fallbackErr = fakePostgresError({
      message: 'relation "generation_runs_shadow_table" does not exist',
      code: "42P01",
    });
    let call = 0;
    mockCreateAdminClient.mockReturnValue(
      mockSupabaseWithProjectsAnd(() => ({
        select: () => ({
          in: () => ({
            order: () => {
              call += 1;
              return Promise.resolve({
                data: null,
                error: call === 1 ? fullErr : fallbackErr,
              });
            },
          }),
        }),
      })) as any
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "generation_runs_shadow_table",
      "promoted_at",
      "42703",
      "42P01",
    ]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch generation runs" });
  });

  it("does not leak an unexpected thrown error (e.g. requireTenantUser failure)", async () => {
    mockRequireTenantUser.mockRejectedValue(
      new Error(
        'User profile not found: relation "tenant_users_audit" does not exist'
      )
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["tenant_users_audit", "does not exist"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to build provider scoreboard" });
  });
});
