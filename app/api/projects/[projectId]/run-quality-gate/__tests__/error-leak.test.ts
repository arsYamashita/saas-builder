/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 *
 * Scope note: this route's SUCCESS path intentionally returns raw
 * npm/lint/tsc/playwright stdout+stderr from the TENANT'S OWN generated
 * project (install/lint/typecheck/playwright results). That is a
 * deliberate product feature — showing a user their own generated code's
 * build output — not an internal-infra leak, so it is out of scope here.
 * This file only covers the route's own internal-error path
 * (getLatestGenerationRun / createQualityRun failing against OUR db),
 * which goes through serverErrorResponse().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/quality-runs", () => ({
  createQualityRun: vi.fn(),
  updateQualityStep: vi.fn(),
  finishQualityRun: vi.fn(),
}));
vi.mock("@/lib/db/generation-runs", () => ({
  getLatestGenerationRun: vi.fn(),
}));
vi.mock("@/lib/utils/project-export-path", () => ({
  getProjectExportPath: vi.fn(() => "/tmp/fake-project-export"),
}));
vi.mock("@/lib/quality/run-install", () => ({ runInstall: vi.fn() }));
vi.mock("@/lib/quality/run-lint", () => ({ runLint: vi.fn() }));
vi.mock("@/lib/quality/run-typecheck", () => ({ runTypecheck: vi.fn() }));
vi.mock("@/lib/quality/run-playwright", () => ({ runPlaywright: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));

import { getLatestGenerationRun } from "@/lib/db/generation-runs";
import { requireProjectAccess } from "@/lib/auth/current-user";
import { POST } from "../route";

const mockGetLatestGenerationRun = vi.mocked(getLatestGenerationRun);
const mockRequireProjectAccess = vi.mocked(requireProjectAccess);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/run-quality-gate — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { id: "proj-1" },
      tenantId: "tenant-1",
    } as any);
  });

  it("does not leak the DB error when getLatestGenerationRun fails (serverErrorResponse path)", async () => {
    const dbError = fakePostgresError({
      message:
        'relation "generation_runs_cost_ledger" does not exist',
      code: "42P01",
    });
    mockGetLatestGenerationRun.mockRejectedValue(
      new Error(`Failed to fetch latest generation run: ${dbError.message}`)
    );

    const res = await POST(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["generation_runs_cost_ledger", "does not exist", "42P01"]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to run quality gate");
    expect(typeof json.errorId).toBe("string");
  });

  it("whitelists 'Not found' from requireProjectAccess without echoing anything else", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Not found"));

    const res = await POST(new NextRequest("https://example.com"), props as any);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });
});
