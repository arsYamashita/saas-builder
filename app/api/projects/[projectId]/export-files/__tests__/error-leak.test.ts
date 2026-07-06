/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/lib/db/generated-files", () => ({
  getGeneratedFilesByProject: vi.fn(),
}));
vi.mock("@/lib/quality/write-export-scaffold", () => ({
  writeExportScaffold: vi.fn(),
}));
vi.mock("@/lib/utils/write-file", () => ({
  writeTextFile: vi.fn(),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { getGeneratedFilesByProject } from "@/lib/db/generated-files";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);
const mockGetGeneratedFilesByProject = vi.mocked(getGeneratedFilesByProject);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/export-files — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { id: "proj-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when fetching generated files fails (serverErrorResponse path)", async () => {
    const dbError = fakePostgresError({
      message:
        'permission denied for relation "generated_files_internal_source"',
      code: "42501",
    });
    mockGetGeneratedFilesByProject.mockRejectedValue(new Error(dbError.message));

    const res = await POST(
      new NextRequest("https://example.com", { method: "POST" }),
      props as any
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "generated_files_internal_source",
      "permission denied",
    ]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to export files");
    expect(typeof json.errorId).toBe("string");
  });
});
