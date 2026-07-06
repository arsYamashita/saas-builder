/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
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

function baseSupabase(overrides: {
  generationRuns?: { data: any; error: any };
  blueprints?: { data: any; error: any };
  qualityRuns?: { data: any; error: any };
}) {
  return {
    from: (table: string) => {
      if (table === "projects") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "project-1", template_key: "custom" }],
                error: null,
              }),
          }),
        };
      }
      if (table === "generation_runs") {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve(
                  overrides.generationRuns ?? { data: [], error: null }
                ),
            }),
          }),
        };
      }
      if (table === "blueprints") {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve(overrides.blueprints ?? { data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "quality_runs") {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve(
                  overrides.qualityRuns ?? { data: [], error: null }
                ),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("GET /api/scoreboard — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTenantUser.mockResolvedValue({
      user: { id: "user-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when the generation_runs query fails", async () => {
    const dbError = fakePostgresError({
      message: 'permission denied for relation "generation_runs_billing_meta"',
      code: "42501",
    });
    mockCreateAdminClient.mockReturnValue(
      baseSupabase({ generationRuns: { data: null, error: dbError } }) as any
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "generation_runs_billing_meta",
      "permission denied",
      "42501",
    ]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch generation runs" });
  });

  it("does not leak the DB error when the quality_runs query fails", async () => {
    const dbError = fakePostgresError({
      message: 'column "internal_score" of relation "quality_runs" does not exist',
      code: "42703",
    });
    mockCreateAdminClient.mockReturnValue(
      baseSupabase({
        generationRuns: { data: [{ id: "run-1", template_key: "custom" }], error: null },
        qualityRuns: { data: null, error: dbError },
      }) as any
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["internal_score", "does not exist", "42703"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch quality runs" });
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
    expect(JSON.parse(text)).toEqual({ error: "Failed to build scoreboard" });
  });
});
