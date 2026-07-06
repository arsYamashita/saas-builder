/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/tenant/current-tenant", () => ({
  getCurrentTenantForUser: vi.fn(),
}));

import { requireCurrentUser } from "@/lib/auth/current-user";
import { GET } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

describe("GET /api/auth/me — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak the raw DB error surfaced by requireCurrentUser()", async () => {
    // requireCurrentUser() itself wraps a real Supabase failure as
    // `User profile not found: ${error.message}` — confirm that detail
    // never reaches the client, only the generic 401 body.
    mockRequireCurrentUser.mockRejectedValue(
      new Error(
        'User profile not found: relation "users_shadow" does not exist'
      )
    );

    const res = await GET();

    expect(res.status).toBe(401);
    const text = await res.text();
    assertNoLeak(text, ["users_shadow", "does not exist"]);
    expect(JSON.parse(text)).toEqual({
      error: "Failed to fetch current auth state",
    });
  });
});
