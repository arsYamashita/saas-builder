/**
 * Wiring test for llm_api_unbounded_text_input: an oversized summary /
 * problemToSolve / targetUsers must be rejected at the Zod validation
 * layer, before executeTask() (the LLM-calling function) is ever invoked.
 * Previously this route parsed the JSON body with no schema at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { MAX_LLM_BRIEF_FIELD_CHARS } from "@/lib/validation/llm-input-limits";
import { POST } from "../route";

const mockRequireCurrentUser = vi.mocked(requireCurrentUser);
const mockExecuteTask = vi.mocked(executeTask);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/projects/rewrite-brief", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/projects/rewrite-brief — input length bounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
  });

  it("rejects oversized summary with 400 and never calls executeTask", async () => {
    const res = await POST(
      makeRequest({ summary: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1) })
    );

    expect(res.status).toBe(400);
    expect(mockExecuteTask).not.toHaveBeenCalled();
  });

  it("rejects oversized problemToSolve with 400 and never calls executeTask", async () => {
    const res = await POST(
      makeRequest({ problemToSolve: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1) })
    );

    expect(res.status).toBe(400);
    expect(mockExecuteTask).not.toHaveBeenCalled();
  });

  it("rejects oversized targetUsers with 400 and never calls executeTask", async () => {
    const res = await POST(
      makeRequest({ targetUsers: "a".repeat(MAX_LLM_BRIEF_FIELD_CHARS + 1) })
    );

    expect(res.status).toBe(400);
    expect(mockExecuteTask).not.toHaveBeenCalled();
  });

  it("allows a within-limit request through to executeTask", async () => {
    mockExecuteTask.mockResolvedValue({
      normalized: {
        format: "json",
        data: {
          rewrittenSummary: "s",
          rewrittenProblemToSolve: "p",
          rewrittenTargetUsers: "t",
        },
      },
      raw: { text: "", provider: "claude" },
    } as any);

    const res = await POST(makeRequest({ summary: "既存の要約" }));

    expect(res.status).toBe(200);
    expect(mockExecuteTask).toHaveBeenCalledTimes(1);
  });
});
