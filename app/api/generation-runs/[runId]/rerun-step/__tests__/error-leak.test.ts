/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 * Business-logic coverage (stuck-step lock, revert-on-failure, etc.) lives
 * in ./route.test.ts; this file is scoped to the "does the response leak
 * internal error detail" question.
 *
 * Note: the two `generation_runs` updates in this route ("mark running",
 * "revert on rerun failure") don't check their own `error` — a DB failure
 * there wouldn't surface to the client at all (a silent-failure smell, not
 * a leak, and out of scope here). The one path that *can* leak is the
 * top-level catch-all → serverErrorResponse(), exercised via a
 * requireRunAccess() failure below.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireRunAccess: vi.fn(),
}));
vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { requireRunAccess } from "@/lib/auth/current-user";
import { POST } from "../route";

const mockRequireRunAccess = vi.mocked(requireRunAccess);

const DB_ERROR = fakePostgresError({
  message: 'permission denied for relation "generation_runs_internal_audit"',
  code: "42501",
});
const FORBIDDEN = ["generation_runs_internal_audit", "permission denied", "42501"];

function makeRequest(body: unknown = { stepKey: "implementation" }) {
  return new NextRequest(
    "https://example.com/api/generation-runs/run-1/rerun-step",
    { method: "POST", body: JSON.stringify(body) }
  );
}

describe("POST /api/generation-runs/[runId]/rerun-step — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak an unexpected thrown error from requireRunAccess (serverErrorResponse path)", async () => {
    mockRequireRunAccess.mockRejectedValue(
      new Error(`User profile not found: ${DB_ERROR.message}`)
    );

    const res = await POST(makeRequest(), {
      params: Promise.resolve({ runId: "run-1" }),
    });

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to rerun step");
    expect(typeof json.errorId).toBe("string");
  });
});
