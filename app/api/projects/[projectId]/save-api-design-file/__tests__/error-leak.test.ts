/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/lib/db/latest-run", () => ({
  getLatestImplementationRun: vi.fn(),
}));
vi.mock("@/lib/db/blueprints", () => ({
  getLatestBlueprintByProjectId: vi.fn(),
}));
vi.mock("@/lib/db/generated-files", () => ({
  saveGeneratedFile: vi.fn(),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);
const mockGetLatestImplementationRun = vi.mocked(getLatestImplementationRun);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/save-api-design-file — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireProjectAccess.mockResolvedValue({} as any);
  });

  it("does not leak the DB error surfaced by getLatestImplementationRun()", async () => {
    mockGetLatestImplementationRun.mockRejectedValue(
      new Error(
        'Failed to fetch implementation run: relation "implementation_runs_internal_meta" does not exist, code 42P01'
      )
    );

    const res = await POST(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "implementation_runs_internal_meta",
      "does not exist",
      "42P01",
    ]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to save API design file" });
  });

  it("whitelists 'Not found' from requireProjectAccess without echoing anything else", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Not found"));

    const res = await POST(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });
});
