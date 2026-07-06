/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 *
 * Sentinel strategy: this route's first DB-touching call after the
 * rate-limit gate is getLatestBlueprintByProjectId(); forcing that to
 * reject is the cheapest way to reach the outer serverErrorResponse()
 * catch without mocking the whole AI generation pipeline (same technique
 * as the rate-limit sentinel in ../../generate-blueprint/__tests__/route.test.ts).
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

describe("POST /api/projects/[projectId]/generate-api-design — error-leak wiring", () => {
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
        'permission denied for relation "blueprints_internal_scoring", code 42501'
      )
    );

    const res = await POST(
      new Request("https://example.com", { method: "POST" }) as any,
      props as any
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["blueprints_internal_scoring", "permission denied", "42501"]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to generate API design");
    expect(typeof json.errorId).toBe("string");
  });
});
