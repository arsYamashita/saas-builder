/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 *
 * Sentinel strategy: see the sibling generate-api-design/__tests__/error-leak.test.ts
 * comment — getLatestBlueprintByProjectId() is the first DB call after the
 * rate-limit gate, so forcing it to reject reaches the outer
 * serverErrorResponse() catch without mocking the AI pipeline.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db/blueprints", () => ({
  getLatestBlueprintByProjectId: vi.fn(),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);
const mockGetLatestBlueprintByProjectId = vi.mocked(getLatestBlueprintByProjectId);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/generate-implementation — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { id: "proj-1", template_key: "membership_content_affiliate" },
    } as any);
  });

  it("does not leak the DB error when the blueprint lookup fails (serverErrorResponse path)", async () => {
    mockGetLatestBlueprintByProjectId.mockRejectedValue(
      new Error(
        'relation "implementation_runs_internal_draft" does not exist, code 42P01'
      )
    );

    const res = await POST(
      new Request("https://example.com", { method: "POST" }) as any,
      props as any
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "implementation_runs_internal_draft",
      "does not exist",
      "42P01",
    ]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to generate implementation plan");
    expect(typeof json.errorId).toBe("string");
  });
});
