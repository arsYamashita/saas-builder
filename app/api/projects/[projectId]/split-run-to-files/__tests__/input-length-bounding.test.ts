/**
 * Defense-in-depth test for the prompt-size cap added alongside the
 * rate-limit fix (see rate-limit.test.ts in this directory and
 * SECURITY_CHECKLIST.md item 3). This route has no request body of its
 * own — its "input" is the prior generate-implementation run's
 * output_text, already bounded by that step's own LLM max_tokens — so
 * this is not closing a distinct attacker-controlled surface the way
 * lib/validation/document-analysis.ts's diffRequestSchema does; it's a
 * safety net against a future change (or a corrupted/oversized DB row)
 * silently ballooning this step's own LLM cost.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => true),
}));
vi.mock("@/lib/db/latest-run", () => ({
  getLatestImplementationRun: vi.fn(),
}));
vi.mock("@/lib/db/blueprints", () => ({
  getLatestBlueprintByProjectId: vi.fn(),
}));
vi.mock("@/lib/db/generated-files", () => ({
  saveGeneratedFile: vi.fn(),
}));
vi.mock("@/lib/utils/read-prompt", () => ({
  readPrompt: vi.fn(async () => "PREFIX {{implementation_output}} SUFFIX"),
}));
vi.mock("@/lib/providers/task-router", () => ({
  executeTask: vi.fn(),
}));
vi.mock("@/lib/providers/step-meta", () => ({
  buildStepMeta: vi.fn(() => ({})),
}));
vi.mock("@/lib/ai/template-prompt-resolver", () => ({
  resolveFinalPromptPath: vi.fn(() => "prompts/fake.md"),
}));

import { requireProjectAccess } from "@/lib/auth/current-user";
import { getLatestImplementationRun } from "@/lib/db/latest-run";
import { getLatestBlueprintByProjectId } from "@/lib/db/blueprints";
import { executeTask } from "@/lib/providers/task-router";
import { MAX_LLM_INPUT_CHARS } from "@/lib/validation/llm-input-limits";
import { POST } from "../route";

const mockRequireProjectAccess = vi.mocked(requireProjectAccess);
const mockGetLatestImplementationRun = vi.mocked(getLatestImplementationRun);
const mockGetLatestBlueprintByProjectId = vi.mocked(getLatestBlueprintByProjectId);
const mockExecuteTask = vi.mocked(executeTask);

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

function makeRequest() {
  return new Request("https://example.com/api/projects/proj-1/split-run-to-files", {
    method: "POST",
  });
}

describe("POST /api/projects/[projectId]/split-run-to-files — prompt size bounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireProjectAccess.mockResolvedValue({
      user: { id: "user-1" },
      project: { template_key: "membership_content_affiliate" },
    } as any);
    mockGetLatestBlueprintByProjectId.mockResolvedValue({ id: "bp-1" } as any);
    mockExecuteTask.mockResolvedValue({
      normalized: { format: "files", files: [] },
      raw: { text: "[]", provider: "claude" },
    } as any);
  });

  it("truncates an oversized implementation_plan output_text before it reaches executeTask()", async () => {
    const oversized = "x".repeat(MAX_LLM_INPUT_CHARS + 5000);
    mockGetLatestImplementationRun.mockResolvedValue({
      id: "run-1",
      output_text: oversized,
    } as any);

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(200);
    expect(mockExecuteTask).toHaveBeenCalledTimes(1);
    const [, promptSent] = mockExecuteTask.mock.calls[0];
    expect(promptSent.length).toBeLessThan(oversized.length);
    expect(promptSent).toContain("truncated");
    expect(promptSent.startsWith("PREFIX ")).toBe(true);
    expect(promptSent.endsWith(" SUFFIX")).toBe(true);
  });

  it("passes a within-limit output_text through unmodified", async () => {
    const small = "implementation details here";
    mockGetLatestImplementationRun.mockResolvedValue({
      id: "run-1",
      output_text: small,
    } as any);

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(200);
    const [, promptSent] = mockExecuteTask.mock.calls[0];
    expect(promptSent).toBe(`PREFIX ${small} SUFFIX`);
  });
});
