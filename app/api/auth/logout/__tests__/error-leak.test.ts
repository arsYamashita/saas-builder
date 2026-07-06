/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/db/supabase/server";
import { POST } from "../route";

const mockCreateClient = vi.mocked(createClient);

describe("POST /api/auth/logout — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak an unexpected thrown error", async () => {
    mockCreateClient.mockRejectedValue(
      new Error('relation "sessions_internal" does not exist, code 42P01')
    );

    const res = await POST();

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["sessions_internal", "does not exist"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to logout" });
  });
});
