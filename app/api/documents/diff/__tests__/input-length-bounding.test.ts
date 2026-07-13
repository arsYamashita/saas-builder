/**
 * Wiring test for llm_api_unbounded_text_input: an oversized oldText/newText
 * must be rejected at the Zod validation layer, before compareDocuments()
 * (the Claude-calling function) is ever invoked.
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

import { requireCurrentUser } from "@/lib/auth/current-user";
import { compareDocuments } from "@/lib/document-analysis/document-diff";
import { MAX_LLM_INPUT_CHARS } from "@/lib/validation/llm-input-limits";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockCompareDocuments = vi.mocked(compareDocuments);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/documents/diff", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/documents/diff — input length bounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
    process.env.CLAUDE_API_KEY = "test-key";
  });

  it("rejects oversized oldText with 400 and never calls compareDocuments", async () => {
    const res = await POST(
      makeRequest({
        oldText: "a".repeat(MAX_LLM_INPUT_CHARS + 1),
        newText: "b",
      })
    );

    expect(res.status).toBe(400);
    expect(mockCompareDocuments).not.toHaveBeenCalled();
  });

  it("rejects oversized newText with 400 and never calls compareDocuments", async () => {
    const res = await POST(
      makeRequest({
        oldText: "a",
        newText: "b".repeat(MAX_LLM_INPUT_CHARS + 1),
      })
    );

    expect(res.status).toBe(400);
    expect(mockCompareDocuments).not.toHaveBeenCalled();
  });

  it("allows a within-limit request through to compareDocuments", async () => {
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
});
