/**
 * Wiring test for [[saas_builder_ai_endpoint_no_rate_limit]]: this route
 * calls compareDocuments() -> fetch("https://api.anthropic.com/v1/messages")
 * directly (no shared provider wrapper), so it had zero rate-limit wiring
 * until this fix. Locks in that a per-user limit is enforced before any
 * paid Claude call — except on the localOnly=true path, which never
 * reaches Claude and must not be throttled by this budget.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/document-analysis/document-diff", () => ({
  compareDocuments: vi.fn(),
  compareDocumentsLocal: vi.fn(),
}));

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

import { requireCurrentUser } from "@/lib/auth/current-user";
import { compareDocuments, compareDocumentsLocal } from "@/lib/document-analysis/document-diff";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockCompareDocuments = vi.mocked(compareDocuments);
const mockCompareDocumentsLocal = vi.mocked(compareDocumentsLocal);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/documents/diff", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/documents/diff — rate-limit wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
    process.env.CLAUDE_API_KEY = "test-key";
  });

  it("returns 429 without calling compareDocuments when the per-user limit is exceeded", async () => {
    mockRateLimit.mockResolvedValue(false);

    const res = await POST(makeRequest({ oldText: "a", newText: "b" }));

    expect(res.status).toBe(429);
    expect(mockCompareDocuments).not.toHaveBeenCalled();
    expect(mockRateLimit).toHaveBeenCalledWith("generate:user-1", expect.any(Number), expect.any(Number));
  });

  it("calls compareDocuments when under the limit", async () => {
    mockRateLimit.mockResolvedValue(true);
    mockCompareDocuments.mockResolvedValue({
      summary: "ok",
      changeCount: 0,
      changes: [],
      keyTakeaways: [],
    } as any);

    const res = await POST(makeRequest({ oldText: "a", newText: "b" }));

    expect(res.status).toBe(200);
    expect(mockCompareDocuments).toHaveBeenCalledTimes(1);
  });

  it("does NOT rate limit the localOnly=true path (never reaches Claude)", async () => {
    mockCompareDocumentsLocal.mockReturnValue({
      addedLines: 0,
      removedLines: 0,
      unchangedLines: 1,
      changeRatio: 0,
    } as any);

    const res = await POST(makeRequest({ oldText: "a", newText: "b", localOnly: true }));

    expect(res.status).toBe(200);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockCompareDocumentsLocal).toHaveBeenCalledTimes(1);
  });

  it("checks the rate limit before the CLAUDE_API_KEY configuration check", async () => {
    delete process.env.CLAUDE_API_KEY;
    mockRateLimit.mockResolvedValue(false);

    const res = await POST(makeRequest({ oldText: "a", newText: "b" }));

    // 429 (rate limited), not 503 (missing key) — proves the rate-limit
    // check runs first, so a rate-limited caller never even learns
    // whether the key is configured.
    expect(res.status).toBe(429);
  });
});
