import { describe, it, expect, vi, beforeEach } from "vitest";

// See [[saas_builder_ai_endpoint_no_rate_limit]]: generate-* endpoints call
// paid LLM providers and previously had zero rate limiting, so an
// authenticated user could drive unbounded API cost. These tests lock in
// that the endpoint now enforces a per-user limit before doing any AI work.

const mockRequireProjectAccess = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: (...args: unknown[]) =>
    mockRequireProjectAccess(...args),
}));

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

import { POST } from "../route";

function makeRequest() {
  return new Request("https://example.com/api/projects/proj-1/generate-blueprint", {
    method: "POST",
  });
}

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/generate-blueprint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
