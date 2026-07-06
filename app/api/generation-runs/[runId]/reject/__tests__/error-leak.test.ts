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

const DB_ERROR = fakePostgresError({
  message:
    'update or delete on table "generation_runs" violates foreign key constraint "fk_generation_runs_reviewer_id" on table "internal_reviewer_accounts"',
  code: "23503",
});
const FORBIDDEN = [
  "fk_generation_runs_reviewer_id",
  "internal_reviewer_accounts",
  "23503",
];

describe("POST /api/generation-runs/[runId]/reject — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireRunAccess.mockResolvedValue({
      user: { id: "user-1" },
      run: { id: "run-1", status: "completed", project_id: "project-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when the update fails (serverErrorResponse path)", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: () => Promise.resolve({ error: DB_ERROR }),
        }),
      }),
    } as any);

    const res = await POST(new NextRequest("https://example.com"), { params });

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to reject run");
    expect(typeof json.errorId).toBe("string");
  });

  it("does not leak an unexpected thrown error from requireRunAccess", async () => {
    mockRequireRunAccess.mockRejectedValue(
      new Error(`User profile not found: ${DB_ERROR.message}`)
    );

    const res = await POST(new NextRequest("https://example.com"), { params });

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to reject run");
  });
});
