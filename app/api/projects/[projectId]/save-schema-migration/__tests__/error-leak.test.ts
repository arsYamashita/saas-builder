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
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);
const mockGetLatestImplementationRun = vi.mocked(getLatestImplementationRun);
const mockGetLatestBlueprintByProjectId = vi.mocked(getLatestBlueprintByProjectId);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/save-schema-migration — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireProjectAccess.mockResolvedValue({} as any);
  });

  it("does not leak the DB error surfaced by getLatestBlueprintByProjectId()", async () => {
    mockGetLatestImplementationRun.mockResolvedValue({
      id: "run-1",
      output_text: "-- sql",
    } as any);
    mockGetLatestBlueprintByProjectId.mockRejectedValue(
      new Error(
        'Failed to fetch blueprint: duplicate key value violates unique constraint "blueprints_project_version_key"'
      )
    );

    const res = await POST(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["blueprints_project_version_key", "duplicate key"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to save schema migration" });
  });

  it("whitelists 'Unauthorized' from requireProjectAccess without echoing anything else", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
