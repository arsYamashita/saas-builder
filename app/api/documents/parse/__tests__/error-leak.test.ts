/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/document-analysis/pdf-parser", () => ({
  parsePdf: vi.fn(),
  parsePdfFromBase64: vi.fn(),
}));

import { requireCurrentUser } from "@/lib/auth/current-user";
import { parsePdf } from "@/lib/document-analysis/pdf-parser";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockParsePdf = vi.mocked(parsePdf);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/documents/parse", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/documents/parse — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com", displayName: null } as any);
  });

  it("does not leak a raw pdf-parser stack trace (serverErrorResponse path)", async () => {
    mockParsePdf.mockRejectedValue(
      new Error(
        "Invalid PDF structure at /app/node_modules/pdf-parse/lib/pdf-parse.js:88:15"
      )
    );

    const res = await POST(
      makeRequest({ base64: Buffer.from("not a real pdf").toString("base64") })
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text);
    const json = JSON.parse(text);
    expect(json.error).toBe("Internal server error");
    expect(typeof json.errorId).toBe("string");
  });
});
