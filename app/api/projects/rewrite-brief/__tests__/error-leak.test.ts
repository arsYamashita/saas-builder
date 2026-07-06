/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/utils/read-prompt", () => ({
  readPrompt: vi.fn().mockResolvedValue("{{INPUT_JSON}}"),
}));
vi.mock("@/lib/providers/task-router", () => ({
  executeTask: vi.fn(),
}));

import { requireCurrentUser } from "@/lib/auth/current-user";
import { executeTask } from "@/lib/providers/task-router";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockExecuteTask = vi.mocked(executeTask);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/projects/rewrite-brief", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/rewrite-brief — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
  });

  it("does not leak a raw provider/API error when executeTask fails", async () => {
    mockExecuteTask.mockRejectedValue(
      new Error(
        'AnthropicAPIError 500: relation "brief_rewrite_cache" does not exist at /app/node_modules/@anthropic-ai/sdk/core.js:120:9'
      )
    );

    const res = await POST(
      makeRequest({
        summary: "既存の要約",
        problemToSolve: "",
        targetUsers: "",
      })
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["brief_rewrite_cache", "AnthropicAPIError"]);
    expect(JSON.parse(text)).toEqual({ error: "整形中にエラーが発生しました" });
  });

  it("does not leak an unexpected thrown error from requireCurrentUser", async () => {
    mockRequireCurrentUser.mockRejectedValue(
      new Error(
        'User profile not found: column "internal_quota" of relation "users" does not exist'
      )
    );

    const res = await POST(
      makeRequest({ summary: "s", problemToSolve: "", targetUsers: "" })
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["internal_quota", "does not exist"]);
    expect(JSON.parse(text)).toEqual({ error: "整形中にエラーが発生しました" });
  });
});
