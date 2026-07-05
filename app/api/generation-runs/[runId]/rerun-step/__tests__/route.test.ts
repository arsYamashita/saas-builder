import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { GenerationStep } from "@/types/generation-run";

// ---- mocks (must be declared before importing the route) ----

const mockRequireRunAccess = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireRunAccess: (...args: unknown[]) => mockRequireRunAccess(...args),
}));

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockFetch = vi.fn();

function buildFakeSupabase() {
  const updateCalls: Record<string, unknown>[] = [];
  return {
    __updateCalls: updateCalls,
    from: () => ({
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          updateCalls.push(payload);
          return { data: null, error: null };
        },
      }),
    }),
  };
}

function makeSteps(): GenerationStep[] {
  return [
    { key: "blueprint", label: "Generate Blueprint", status: "completed" },
    { key: "implementation", label: "Generate Implementation", status: "completed" },
  ];
}

function makeRequest(body: unknown = { stepKey: "implementation" }) {
  return new NextRequest(
    "https://example.com/api/generation-runs/run-1/rerun-step",
    { method: "POST", body: JSON.stringify(body) }
  );
}

describe("POST /api/generation-runs/[runId]/rerun-step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.stubGlobal("fetch", mockFetch);
  });

  it("returns 400 when stepKey is missing", async () => {
    const res = await POST(makeRequest({}), { params: Promise.resolve({ runId: "run-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new NextRequest(
      "https://example.com/api/generation-runs/run-1/rerun-step",
      { method: "POST", body: "{not json" }
    );
    const res = await POST(req, { params: Promise.resolve({ runId: "run-1" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
  });

  it("returns 400 for a non-rerunnable step", async () => {
    const res = await POST(makeRequest({ stepKey: "blueprint" }), {
      params: Promise.resolve({ runId: "run-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the run is not completed", async () => {
    mockRequireRunAccess.mockResolvedValue({
      run: { status: "running", steps_json: makeSteps(), project_id: "proj-1" },
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 400 when the step is not completed", async () => {
    const steps = makeSteps();
    steps[1] = { ...steps[1], status: "pending" };
    mockRequireRunAccess.mockResolvedValue({
      run: { status: "completed", steps_json: steps, project_id: "proj-1" },
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });
    expect(res.status).toBe(400);
  });

  it("successfully reruns a step: marks running (with heartbeat), then completed", async () => {
    mockRequireRunAccess.mockResolvedValue({
      run: {
        status: "completed",
        steps_json: makeSteps(),
        project_id: "proj-1",
        review_status: "pending",
      },
    });
    const fakeSupabase = buildFakeSupabase();
    mockCreateAdminClient.mockReturnValue(fakeSupabase as any);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ _meta: { durationMs: 1234 } }),
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // First update: marks running with a startedAt heartbeat.
    const runningUpdate = fakeSupabase.__updateCalls[0];
    const runningSteps = runningUpdate.steps_json as GenerationStep[];
    const runningImpl = runningSteps.find((s) => s.key === "implementation")!;
    expect(runningImpl.status).toBe("running");
    expect(runningImpl.meta?.startedAt).toBeTruthy();

    // Final update: completed, current_step cleared.
    const finalUpdate = fakeSupabase.__updateCalls[fakeSupabase.__updateCalls.length - 1];
    expect(finalUpdate.current_step).toBeNull();
    const finalSteps = finalUpdate.steps_json as GenerationStep[];
    const finalImpl = finalSteps.find((s) => s.key === "implementation")!;
    expect(finalImpl.status).toBe("completed");
    expect(finalImpl.meta?.durationMs).toBe(1234);
  });

  it("reverts the step to completed with rerunError when the internal fetch throws (compensating catch)", async () => {
    mockRequireRunAccess.mockResolvedValue({
      run: {
        status: "completed",
        steps_json: makeSteps(),
        project_id: "proj-1",
        review_status: "pending",
      },
    });
    const fakeSupabase = buildFakeSupabase();
    mockCreateAdminClient.mockReturnValue(fakeSupabase as any);
    mockFetch.mockRejectedValue(new Error("network timeout"));

    const res = await POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(500);

    // The last update must NOT leave the step at "running" — this is the
    // regression test for [[ai_generation_step_stuck_running]].
    const finalUpdate = fakeSupabase.__updateCalls[fakeSupabase.__updateCalls.length - 1];
    expect(finalUpdate.current_step).toBeNull();
    const finalSteps = finalUpdate.steps_json as GenerationStep[];
    const finalImpl = finalSteps.find((s) => s.key === "implementation")!;
    expect(finalImpl.status).not.toBe("running");
    expect(finalImpl.status).toBe("completed");
    expect(finalImpl.meta?.rerunError).toContain("network timeout");
  });

  it("reverts the step when the internal route responds non-OK", async () => {
    mockRequireRunAccess.mockResolvedValue({
      run: {
        status: "completed",
        steps_json: makeSteps(),
        project_id: "proj-1",
        review_status: "pending",
      },
    });
    const fakeSupabase = buildFakeSupabase();
    mockCreateAdminClient.mockReturnValue(fakeSupabase as any);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "Bad Gateway",
    });

    const res = await POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });

    expect(res.status).toBe(500);
    const finalUpdate = fakeSupabase.__updateCalls[fakeSupabase.__updateCalls.length - 1];
    const finalSteps = finalUpdate.steps_json as GenerationStep[];
    const finalImpl = finalSteps.find((s) => s.key === "implementation")!;
    expect(finalImpl.status).toBe("completed");
    expect(finalImpl.meta?.rerunError).toContain("502");
  });

  it("returns 409 and does not touch the DB when the same step is already being rerun", async () => {
    mockRequireRunAccess.mockResolvedValue({
      run: {
        status: "completed",
        steps_json: makeSteps(),
        project_id: "proj-1",
        review_status: "pending",
      },
    });
    const fakeSupabase = buildFakeSupabase();
    mockCreateAdminClient.mockReturnValue(fakeSupabase as any);

    // Never resolves — simulates an in-flight rerun holding the lock.
    mockFetch.mockImplementation(() => new Promise(() => {}));

    // Fire the first request but don't await it yet.
    const firstPromise = POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });
    // Give the event loop a tick so the first request acquires the lock
    // before the second one is issued.
    await new Promise((resolve) => setImmediate(resolve));

    const second = await POST(makeRequest(), { params: Promise.resolve({ runId: "run-1" }) });
    expect(second.status).toBe(409);

    // Don't leave the first request hanging in the test process.
    void firstPromise;
  });
});
