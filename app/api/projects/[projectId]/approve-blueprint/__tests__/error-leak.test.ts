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
  requireProjectAccess: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireProjectAccess = vi.mocked(requireProjectAccess);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

const UPDATE_ERROR = fakePostgresError({
  message:
    'update on table "blueprints" violates check constraint "blueprints_review_status_check"',
  code: "23514",
});
const FORBIDDEN = ["blueprints_review_status_check", "check constraint", "23514"];

describe("POST /api/projects/[projectId]/approve-blueprint — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { id: "proj-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when the approve-update fails (serverErrorResponse path)", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        update: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ error: UPDATE_ERROR }),
          }),
        }),
      }),
    } as any);

    const req = new NextRequest("https://example.com", {
      method: "POST",
      body: JSON.stringify({ blueprintId: "bp-1" }),
    });

    const res = await POST(req, props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to approve blueprint");
    expect(typeof json.errorId).toBe("string");
  });
});
