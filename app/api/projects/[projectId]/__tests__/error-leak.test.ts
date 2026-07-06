/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { GET } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("GET /api/projects/[projectId] — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak a raw DB error surfaced through requireProjectAccess()", async () => {
    // requireProjectAccess() calls requireTenantUser() internally, which can
    // reject with a raw Supabase failure message — confirm that detail
    // never reaches the client, only the generic 500 body.
    mockRequireProjectAccess.mockRejectedValue(
      new Error(
        'permission denied for relation "tenant_users_internal_billing", code 42501'
      )
    );

    const res = await GET(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "tenant_users_internal_billing",
      "permission denied",
      "42501",
    ]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch project" });
  });

  it("whitelists 'Unauthorized' / 'Not found' without echoing anything else", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(new NextRequest("https://example.com"), props as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
