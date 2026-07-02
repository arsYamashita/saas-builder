import { describe, it, expect, vi, beforeEach } from "vitest";

// See [[saas_builder_ai_endpoint_no_rate_limit]]. generate-template chains
// blueprint -> implementation -> schema -> api-design (four LLM calls per
// invocation), so it needs its own rate limit independent of the per-step
// limits on the endpoints it calls internally.

const mockRequireCurrentUser = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: (...args: unknown[]) => mockRequireCurrentUser(...args),
}));

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { POST } from "../route";

function makeRequest() {
  return new Request(
    "https://example.com/api/projects/proj-1/generate-template",
    { method: "POST" }
  );
}

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("POST /api/projects/[projectId]/generate-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 429 before touching the database when the per-user limit is exceeded", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockRateLimit.mockResolvedValue(false);

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledWith(
      "generate:user-1",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireCurrentUser.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(401);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });
});
