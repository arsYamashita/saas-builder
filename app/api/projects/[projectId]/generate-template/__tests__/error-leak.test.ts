/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 * Business-logic coverage (rate-limit bucket, pipeline token propagation,
 * tenant-scoped access / IDOR) lives in ./route.test.ts; this file is scoped
 * to the "does the response leak internal error detail" question.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

const mockRequireProjectAccess = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: (...args: unknown[]) =>
    mockRequireProjectAccess(...args),
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

import { POST } from "../route";

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
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { id: "proj-1", template_key: "membership_content_affiliate" },
      tenantId: "tenant-1",
    });
    mockRateLimit.mockResolvedValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("does not leak a raw DB error surfaced through requireProjectAccess", async () => {
    // requireProjectAccess (lib/auth/current-user.ts) resolves the project
    // via the admin client internally; if that lookup ever threw a raw
    // Supabase/Postgres error instead of the generic "Not found", this
    // route's access-check catch must still respond with a generic message
    // (it maps everything that isn't exactly "Unauthorized"/"Not found" to
    // a generic 401) — see [[api_error_message_internal_leak]].
    const dbError = fakePostgresError({
      message: 'permission denied for relation "projects_internal_billing_meta"',
      code: "42501",
    });
    mockRequireProjectAccess.mockRejectedValue(
      new Error(`User profile not found: ${dbError.message} (code=${dbError.code})`)
    );

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(401);
    const text = await res.text();
    assertNoLeak(text, [
      "projects_internal_billing_meta",
      "permission denied",
      "42501",
    ]);
    expect(JSON.parse(text).error).toBe("Unauthorized");
  });

  it("does not leak an internal pipeline-step failure's raw detail", async () => {
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
