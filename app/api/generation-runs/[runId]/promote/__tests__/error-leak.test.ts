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
  requireRunAccess: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireRunAccess } from "@/lib/auth/current-user";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireRunAccess = vi.mocked(requireRunAccess);

const params = Promise.resolve({ runId: "run-1" });

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("https://example.com", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const DB_ERROR = fakePostgresError({
  message:
    'duplicate key value violates unique constraint "baseline_promotions_generation_run_id_key" on table "baseline_promotions"',
  code: "23505",
});
const FORBIDDEN = [
  "baseline_promotions_generation_run_id_key",
  "23505",
];

// A fully "gate-passing" Supabase double, so the route reaches the final
// `baseline_promotions` insert (the one this test forces to fail). Every
// preceding gate (blueprint approved, quality gates passed) must resolve
// successfully or the route short-circuits with a 400 before ever touching
// the insert we care about.
function makeGatePassingSupabase(insertResult: { data: any; error: any }) {
  return {
    from: (table: string) => {
      if (table === "blueprints") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  single: () =>
                    Promise.resolve({
                      data: { id: "blueprint-1", review_status: "approved" },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "quality_runs") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        id: "quality-run-1",
                        status: "passed",
                        checks_json: [{ key: "lint", status: "passed" }],
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "baseline_promotions") {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve(insertResult),
            }),
          }),
        };
      }
      if (table === "generation_runs") {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      throw new Error(`unexpected table "${table}"`);
    },
  };
}

describe("POST /api/generation-runs/[runId]/promote — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireRunAccess.mockResolvedValue({
      user: { id: "user-1" },
      run: {
        id: "run-1",
        status: "completed",
        review_status: "approved",
        project_id: "project-1",
        template_key: "mca",
      },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when the promotion insert fails (serverErrorResponse path)", async () => {
    mockCreateAdminClient.mockReturnValue(
      makeGatePassingSupabase({ data: null, error: DB_ERROR }) as any
    );

    const res = await POST(makeRequest(), { params });

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to create promotion");
    expect(typeof json.errorId).toBe("string");
  });

  it("does not leak an unexpected thrown error from requireRunAccess", async () => {
    mockRequireRunAccess.mockRejectedValue(
      new Error(`User profile not found: ${DB_ERROR.message}`)
    );

    const res = await POST(makeRequest(), { params });

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to promote run");
  });
});
