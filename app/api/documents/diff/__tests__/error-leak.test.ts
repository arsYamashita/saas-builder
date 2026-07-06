/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/document-analysis/document-diff", () => ({
  compareDocuments: vi.fn(),
  compareDocumentsLocal: vi.fn(),
}));

import { requireCurrentUser } from "@/lib/auth/current-user";
import { compareDocuments } from "@/lib/document-analysis/document-diff";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockCompareDocuments = vi.mocked(compareDocuments);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/documents/diff", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/documents/diff — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com", displayName: null } as any);
    process.env.CLAUDE_API_KEY = "test-key";
  });

  it("does not leak an unexpected thrown error from the LLM diff call (serverErrorResponse path)", async () => {
    mockCompareDocuments.mockRejectedValue(
      new Error(
        'AnthropicAPIError: relation "document_diff_cache" does not exist, at /app/node_modules/@anthropic-ai/sdk/client.js:42:10'
      )
    );

    const res = await POST(
      makeRequest({ oldText: "a", newText: "b", localOnly: false })
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["document_diff_cache", "AnthropicAPIError"]);
    const json = JSON.parse(text);
    expect(json.error).toBe("Internal server error");
    expect(typeof json.errorId).toBe("string");
  });
});
