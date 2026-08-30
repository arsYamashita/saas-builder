/**
 * Wiring test for llm_api_unbounded_text_input: an oversized base64 payload
 * must be rejected at the Zod validation layer, before parsePdf() ever
 * runs (and before Buffer.from() allocates memory for a huge string).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/document-analysis/pdf-parser", () => ({
  parsePdf: vi.fn(),
  parsePdfFromBase64: vi.fn(),
}));

import { requireCurrentUser } from "@/lib/auth/current-user";
import { parsePdf } from "@/lib/document-analysis/pdf-parser";
import { MAX_LLM_INPUT_BASE64_BYTES } from "@/lib/validation/llm-input-limits";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockParsePdf = vi.mocked(parsePdf);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/documents/parse", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/documents/parse — input length bounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
  });

  it("rejects oversized base64 with 400 and never calls parsePdf", async () => {
    const res = await POST(
      makeRequest({ base64: "A".repeat(MAX_LLM_INPUT_BASE64_BYTES + 1) })
    );

    expect(res.status).toBe(400);
    expect(mockParsePdf).not.toHaveBeenCalled();
  });

  it("allows a within-limit request through to parsePdf", async () => {
    mockParsePdf.mockResolvedValue({
      fullText: "text",
      sections: [],
      metadata: {
        pageCount: 1,
        charCount: 4,
        title: null,
        author: null,
        subject: null,
        creator: null,
        creationDate: null,
      },
    } as any);

    const res = await POST(makeRequest({ base64: "AAAA" }));

    expect(res.status).toBe(200);
    expect(mockParsePdf).toHaveBeenCalledTimes(1);
  });
});
