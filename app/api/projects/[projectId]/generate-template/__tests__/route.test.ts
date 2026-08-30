import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// See [[saas_builder_ai_endpoint_no_rate_limit]] and the PR #25 Codex review:
// generate-template chains blueprint -> implementation -> schema -> api-design
// (four+ LLM calls per invocation). It must:
//   1. use its OWN rate-limit bucket (`generate-template:`), not the per-step
//      `generate:` bucket, so recent use of an individual endpoint can't
//      block a pipeline start, and
//   2. mark its internal step calls with the internal-pipeline token so the
//      steps skip their per-step limit — one admitted pipeline run is atomic
//      and never dies with 429 halfway through.
//
// See also M5 instruction 093 / [[gateway_no_auth_tenant_id_conversation_read_idor]]:
// this route used to call requireCurrentUser() (auth only) and then fetch the
// project via the ADMIN client filtered solely by `.eq("id", projectId)`, with
// NO tenant check — any authenticated user could pass another tenant's
// projectId and cause a generation_runs row to be created against it (IDOR).
// It now uses requireProjectAccess(), same as the sibling generate-blueprint /
// generate-implementation / generate-schema / generate-api-design routes,
// which scopes the lookup via `.eq("tenant_id", tenantId)` and throws
// "Not found" for a project the caller's tenant does not own.

const mockRequireProjectAccess = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({
  requireProjectAccess: (...args: unknown[]) =>
    mockRequireProjectAccess(...args),
}));

const mockRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockCreateGenerationRun = vi.fn();
const mockUpdateGenerationStep = vi.fn();
const mockCompleteGenerationRun = vi.fn();
const mockFailGenerationRun = vi.fn();
vi.mock("@/lib/db/generation-runs", () => ({
  createGenerationRun: (...args: unknown[]) => mockCreateGenerationRun(...args),
  updateGenerationStep: (...args: unknown[]) =>
    mockUpdateGenerationStep(...args),
  completeGenerationRun: (...args: unknown[]) =>
    mockCompleteGenerationRun(...args),
  failGenerationRun: (...args: unknown[]) => mockFailGenerationRun(...args),
}));

import { INTERNAL_PIPELINE_HEADER } from "@/lib/pipeline-internal";
import { POST } from "../route";

function makeRequest() {
  return new Request(
    "https://example.com/api/projects/proj-1/generate-template",
    { method: "POST" }
  );
}

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

const OWNED_PROJECT = { id: "proj-1", template_key: "membership_content_affiliate" };

function mockOwnedProjectAccess() {
  mockRequireProjectAccess.mockResolvedValue({
    user: { id: "user-1" },
    project: OWNED_PROJECT,
    tenantId: "tenant-1",
  });
}

describe("POST /api/projects/[projectId]/generate-template", () => {
  const originalFetch = global.fetch;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  });

  it("uses its own generate-template bucket, not the per-step generate bucket", async () => {
    mockOwnedProjectAccess();
    mockRateLimit.mockResolvedValue(false);

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(429);
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    expect(mockRateLimit).toHaveBeenCalledWith(
      "generate-template:user-1",
      expect.any(Number),
      expect.any(Number)
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST(makeRequest() as any, props as any);

    expect(res.status).toBe(401);
    expect(mockRateLimit).not.toHaveBeenCalled();
  });

  // ── IDOR regression (M5 instruction 093) ────────────────────────────
  // A caller whose active tenant does not own `projectId` must be rejected
  // with 404 before any rate-limit consumption, generation_runs row
  // creation, or LLM call happens. Pre-fix, this route ignored tenant
  // ownership entirely and proceeded to create a run against the victim's
  // project (see the route.ts history / KB entry above).
  it("[IDOR] returns 404 when the project does not belong to the caller's tenant", async () => {
    mockRequireProjectAccess.mockRejectedValue(new Error("Not found"));

    const res = await POST(makeRequest() as any, props as any);
    const body = await (res as Response).json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("Project not found");
    // Nothing downstream of the access check must run for a rejected caller.
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockCreateGenerationRun).not.toHaveBeenCalled();
  });

  it("[IDOR] passes the access check and proceeds for the project's own tenant", async () => {
    mockOwnedProjectAccess();
    mockRateLimit.mockResolvedValue(true);
    mockCreateGenerationRun.mockResolvedValue({ id: "run-1" });

    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ _meta: undefined }),
      text: async () => "",
    })) as any;

    const res = await POST(makeRequest() as any, props as any);
    const body = await (res as Response).json();

    expect(mockRequireProjectAccess).toHaveBeenCalledWith("proj-1");
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // The run is created using the tenant-scoped project's own template_key,
    // proving project data flows from requireProjectAccess (not from an
    // unscoped lookup).
    expect(mockCreateGenerationRun).toHaveBeenCalledWith(
      "proj-1",
      OWNED_PROJECT.template_key
    );
  });

  it("completes the whole pipeline even when the per-step generate bucket is exhausted", async () => {
    // Simulate: the user burned their entire per-step `generate:` budget
    // moments ago (e.g. by calling generate-blueprint directly), then starts
    // a pipeline. The dedicated generate-template bucket still admits it,
    // and every internal step succeeds rather than 429ing mid-run.
    mockOwnedProjectAccess();
    mockRateLimit.mockImplementation(async (key: string) =>
      key.startsWith("generate-template:")
    );
    mockCreateGenerationRun.mockResolvedValue({ id: "run-1" });
    mockUpdateGenerationStep.mockResolvedValue(undefined);
    mockCompleteGenerationRun.mockResolvedValue(undefined);

    const fetchCalls: string[] = [];
    global.fetch = vi.fn(async (url: any) => {
      fetchCalls.push(String(url));
      return {
        ok: true,
        json: async () => ({ _meta: undefined }),
        text: async () => "",
      } as any;
    }) as any;

    const res = await POST(makeRequest() as any, props as any);
    const body = await (res as Response).json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockCompleteGenerationRun).toHaveBeenCalledWith("run-1");
    expect(mockFailGenerationRun).not.toHaveBeenCalled();

    // All 4 LLM steps ran to completion.
    expect(fetchCalls.some((u) => u.includes("generate-blueprint"))).toBe(true);
    expect(fetchCalls.some((u) => u.includes("generate-implementation"))).toBe(
      true
    );
    expect(fetchCalls.some((u) => u.includes("generate-schema"))).toBe(true);
    expect(fetchCalls.some((u) => u.includes("generate-api-design"))).toBe(
      true
    );

    // The pipeline consumed ONLY its own bucket — never the per-step one.
    for (const call of mockRateLimit.mock.calls) {
      expect(String(call[0])).toMatch(/^generate-template:/);
    }
  });

  it("sends the internal-pipeline token on internal step calls", async () => {
    mockOwnedProjectAccess();
    mockRateLimit.mockResolvedValue(true);
    mockCreateGenerationRun.mockResolvedValue({ id: "run-1" });

    const fetchHeaders: Array<Record<string, string>> = [];
    global.fetch = vi.fn(async (_url: any, init?: any) => {
      fetchHeaders.push((init?.headers ?? {}) as Record<string, string>);
      return {
        ok: true,
        json: async () => ({ _meta: undefined }),
        text: async () => "",
      } as any;
    }) as any;

    await POST(makeRequest() as any, props as any);

    // First 6 calls are the pipeline steps (blueprint .. export-files).
    const stepCalls = fetchHeaders.slice(0, 6);
    expect(stepCalls.length).toBeGreaterThan(0);
    for (const headers of stepCalls) {
      expect(headers[INTERNAL_PIPELINE_HEADER]).toBeTruthy();
      // The header carries a derived token, never the raw secret.
      expect(headers[INTERNAL_PIPELINE_HEADER]).not.toBe(
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
  });
});
