/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/lib/db/blueprints", () => ({
  getLatestBlueprintByProjectId: vi.fn(),
}));
vi.mock("@/lib/db/generated-files", () => ({
  saveGeneratedFile: vi.fn(),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { saveGeneratedFile } from "@/lib/db/generated-files";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);
const mockGetLatestBlueprintByProjectId = vi.mocked(getLatestBlueprintByProjectId);
const mockSaveGeneratedFile = vi.mocked(saveGeneratedFile);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/[projectId]/save-ui-file — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireProjectAccess.mockResolvedValue({} as any);
    mockGetLatestBlueprintByProjectId.mockResolvedValue({ id: "bp-1" } as any);
  });

  it("does not leak the DB error surfaced by saveGeneratedFile()", async () => {
    mockSaveGeneratedFile.mockRejectedValue(
      new Error(
        'Failed to save generated file: value too long for type character varying(255), column "file_path" of relation "generated_files"'
      )
    );

    const res = await POST(
      makeRequest({ filePath: "app/page.tsx", contentText: "x", fileCategory: "page" }),
      props as any
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "value too long for type",
      "character varying(255)",
      "generated_files",
    ]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to save UI file" });
  });
});
