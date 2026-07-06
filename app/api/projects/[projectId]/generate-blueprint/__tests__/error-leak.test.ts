/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 * Business-logic coverage (rate-limit gate, internal-pipeline bypass) lives
 * in ./route.test.ts; this file is scoped to the "does the response leak
 * internal error detail" question.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
// Sentinel: aborts the handler right after the rate-limit decision so this
// test doesn't need to mock the whole AI intake/blueprint pipeline (same
// technique as route.test.ts's readPrompt sentinel).
vi.mock("@/lib/utils/read-prompt", () => ({
  readPrompt: vi.fn(async () => {
    throw new Error(
      'ENOENT: no such file or directory, open "/app/prompts/internal/01-gemini-intake.md"'
    );
  }),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

function makeRequest() {
  return new Request(
    "https://example.com/api/projects/proj-1/generate-blueprint",
    { method: "POST" }
  );
}

describe("POST /api/projects/[projectId]/generate-blueprint — error-leak wiring", () => {
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    // createAdminClient() runs before readPrompt() in the route; without
    // both of these it throws its own (safe) env-guard error first,
    // short-circuiting before this test's intended readPrompt sentinel.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { name: "Test", description: null, industry: "saas", metadata_json: {} },
    } as any);
  });

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  });

  it("does not leak an unexpected pipeline failure (e.g. missing prompt file path)", async () => {
    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["/app/prompts/internal", "ENOENT"]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Failed to generate blueprint");
    expect(typeof json.errorId).toBe("string");
  });
});
