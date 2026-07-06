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

// Minimal-but-valid blueprint satisfying lib/validation/blueprint.ts's
// `.min(1)` array constraints, so the route reaches its Supabase calls.
const VALID_BLUEPRINT = {
  product_summary: {},
  entities: [
    { name: "User", description: "d", main_fields: [{ name: "id", type: "string", required: true }] },
  ],
  screens: [{ name: "Home", purpose: "p", role_access: ["admin"] }],
  roles: [{ name: "admin" }],
  permissions: [{ role: "admin", allowed_actions: ["read"] }],
  billing: { enabled: false, model: "none" },
  affiliate: { enabled: false },
  events: [],
  kpis: [],
  assumptions: [],
  mvp_scope: ["mvp1"],
  future_scope: [],
};

function makeRequest() {
  return new NextRequest("https://example.com", {
    method: "POST",
    body: JSON.stringify({ blueprint: VALID_BLUEPRINT }),
  });
}

describe("POST /api/projects/[projectId]/blueprint — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { id: "proj-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when checking existing blueprint versions fails", async () => {
    const dbError = fakePostgresError({
      message: 'permission denied for relation "blueprints_internal_audit"',
      code: "42501",
    });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: null, error: dbError }),
            }),
          }),
        }),
      }),
    } as any);

    const res = await POST(makeRequest(), props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["blueprints_internal_audit", "permission denied", "42501"]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to check existing blueprints");
    expect(typeof json.errorId).toBe("string");
  });

  it("does not leak the DB error when the insert fails", async () => {
    const dbError = fakePostgresError({
      message:
        'duplicate key value violates unique constraint "blueprints_project_id_version_key"',
      code: "23505",
    });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any);

    const res = await POST(makeRequest(), props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "blueprints_project_id_version_key",
      "duplicate key",
      "23505",
    ]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to save blueprint");
    expect(typeof json.errorId).toBe("string");
  });
});
