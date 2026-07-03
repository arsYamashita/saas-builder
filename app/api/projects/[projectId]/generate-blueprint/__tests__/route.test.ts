import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// See [[saas_builder_ai_endpoint_no_rate_limit]]: generate-* endpoints call
// paid LLM providers and previously had zero rate limiting, so an
// authenticated user could drive unbounded API cost. These tests lock in
// that the endpoint enforces a per-user limit before doing any AI work —
// except for verified internal generate-template pipeline calls, which are
// rate-limited once at the pipeline entry point instead (a pipeline run must
// be atomic and never 429 mid-run; see lib/pipeline-internal.ts).

const mockRequireProjectAccess = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: (...args: unknown[]) =>
    mockRequireProjectAccess(...args),
}));

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

// Sentinel: aborts the handler right after the rate-limit decision so tests
// don't need to mock the whole AI generation flow.
vi.mock("@/lib/utils/read-prompt", () => ({
  readPrompt: vi.fn(async () => {
    throw new Error("SENTINEL_STOP");
  }),
}));

import {
  INTERNAL_PIPELINE_HEADER,
  getInternalPipelineToken,
} from "@/lib/pipeline-internal";
import { POST } from "../route";

function makeRequest(headers?: Record<string, string>) {
  return new Request(
    "https://example.com/api/projects/proj-1/generate-blueprint",
    { method: "POST", headers }
  );
}

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/generate-blueprint", () => {
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  });

  it("returns 429 without calling any AI provider when the per-user limit is exceeded", async () => {
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { name: "Test", industry: "saas", metadata_json: {} },
    });
    mockRateLimit.mockResolvedValue(false);

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith(
      "generate:user-1",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("returns 401 when the caller is not authenticated (checked before rate limit)", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(401);
  });

  it("skips the per-step rate limit for a verified internal pipeline call", async () => {
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { name: "Test", industry: "saas", metadata_json: {} },
    });
    // Even with the bucket fully exhausted...
    mockRateLimit.mockResolvedValue(false);

    const token = getInternalPipelineToken()!;
    const res = await POST(
      makeRequest({ [INTERNAL_PIPELINE_HEADER]: token }) as any,
      props as any
    );

    // ...an internal pipeline step is never 429'd; it proceeds past the
    // rate limit (and here hits the test sentinel instead).
    expect(res.status).not.toBe(429);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  it("does NOT skip the rate limit for a forged internal header", async () => {
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { name: "Test", industry: "saas", metadata_json: {} },
    });
    mockRateLimit.mockResolvedValue(false);

    const res = await POST(
      makeRequest({ [INTERNAL_PIPELINE_HEADER]: "forged-token" }) as any,
      props as any
    );

    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalled();
  });

  it("auth is still enforced for internal pipeline calls (only the rate limit is bypassed)", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Unauthorized"));

    const token = getInternalPipelineToken()!;
    const res = await POST(
      makeRequest({ [INTERNAL_PIPELINE_HEADER]: token }) as any,
      props as any
    );

    expect(res.status).toBe(401);
  });
});
