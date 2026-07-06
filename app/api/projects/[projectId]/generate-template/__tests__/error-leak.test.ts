/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 * Business-logic coverage (rate-limit bucket, pipeline token propagation)
 * lives in ./route.test.ts; this file is scoped to the "does the response
 * leak internal error detail" question.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

const mockRequireCurrentUser = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: (...args: unknown[]) => mockRequireCurrentUser(...args),
}));

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockCreateGenerationRun = vi.fn();
const mockUpdateGenerationStep = vi.fn();
const mockCompleteGenerationRun = vi.fn();
const mockFailGenerationRun = vi.fn();
vi.mock("@/lib/db/generation-runs", () => ({
  createGenerationRun: (...args: unknown[]) => mockCreateGenerationRun(...args),
  updateGenerationStep: (...args: unknown[]) => mockUpdateGenerationStep(...args),
  completeGenerationRun: (...args: unknown[]) => mockCompleteGenerationRun(...args),
  failGenerationRun: (...args: unknown[]) => mockFailGenerationRun(...args),
}));

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);

function makeRequest() {
  return new Request(
    "https://example.com/api/projects/proj-1/generate-template",
    { method: "POST" }
  );
}

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/generate-template — error-leak wiring", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockRateLimit.mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does not leak the DB error when the project lookup fails (serverErrorResponse path)", async () => {
    const dbError = fakePostgresError({
      message: 'permission denied for relation "projects_internal_billing_meta"',
      code: "42501",
    });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any);

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(404);
    const text = await res.text();
    assertNoLeak(text, [
      "projects_internal_billing_meta",
      "permission denied",
      "42501",
    ]);
    expect(JSON.parse(text).error).toBe("Project not found");
  });

  it("does not leak an internal pipeline-step failure's raw detail", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "proj-1", template_key: "membership_content_affiliate" },
              error: null,
            }),
          }),
        }),
      }),
    } as any);
    mockCreateGenerationRun.mockResolvedValue({ id: "run-1" });
    mockUpdateGenerationStep.mockResolvedValue(undefined);
    mockFailGenerationRun.mockResolvedValue(undefined);

    // The internal generate-blueprint step 500s with a body that itself
    // could echo an upstream DB detail (defense in depth: even if an
    // internal hop leaked something, this route's own catch must not
    // forward it further).
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () =>
        JSON.stringify({
          error: "Internal server error",
          errorId: "abc-123",
          leakedDetail:
            'relation "generation_runs_internal_cost" violates check constraint "grc_cost_positive"',
        }),
      json: async () => ({}),
    })) as any;

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, [
      "generation_runs_internal_cost",
      "grc_cost_positive",
      "check constraint",
    ]);
    expect(JSON.parse(text).error).toBe("Failed to generate full template");
  });
});
