/**
 * Integration test for [[internal_fetch_drops_session_cookie_orchestrator_route_dead]]
 * (M5 instruction 130).
 *
 * ./route.test.ts and ./error-leak.test.ts both mock `@/lib/auth/current-user`
 * (requireProjectAccess) directly, and mock `global.fetch` to return a
 * canned `{ ok: true }` for every internal step call. That is exactly the
 * false-success shape the KB describes: every unit test is green even though
 * the *real* postInternal() never attached a Cookie header, so every real
 * child route 401s in production and the pipeline never completes a single
 * step.
 *
 * This test does NOT mock requireProjectAccess / requireTenantUser /
 * requireCurrentUser — it exercises the real chain in lib/auth/current-user.ts.
 * It only mocks the two genuine external-system boundaries that chain
 * crosses (Supabase Auth over the network, and Postgres over the network):
 *   - `@/lib/auth/session` (getAuthSession) — stands in for cookie-based
 *     Supabase Auth session resolution.
 *   - `@/lib/db/supabase/admin` (createAdminClient) — stands in for the
 *     users / tenant_users / projects lookups.
 *
 * `global.fetch` is replaced with a dispatcher that inspects the outgoing
 * request's headers exactly like a real Next.js server would treat a
 * self-fetch round trip: whatever Cookie header postInternal() attaches
 * becomes the "inbound" cookie for the simulated child request. A tiny
 * `childRouteDouble()` — sharing the *real*, unmocked requireProjectAccess()
 * guard used by every actual child route (generate-blueprint et al.) —
 * stands in for the child route's business logic (LLM calls / DB writes),
 * which are out of scope for this fix and are exercised by their own route
 * tests.
 *
 * Before the fix (postInternal without cookieHeader forwarding): the
 * dispatcher sees no Cookie on the outgoing call, the double's
 * requireProjectAccess() throws "Unauthorized", and the simulated child
 * responds 401 — reproducing the real production failure.
 *
 * After the fix: the inbound request's Cookie header is forwarded, the
 * double's requireProjectAccess() succeeds, and the simulated child
 * responds 200.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextResponse } from "next/server";

const { state, VALID_COOKIE } = vi.hoisted(() => ({
  state: { currentCookie: null as string | null },
  VALID_COOKIE: "sb-test-project-auth-token=valid-session-value",
}));

// ── Real external-system boundaries only ────────────────────────────────
vi.mock("@/lib/auth/session", () => ({
  getAuthSession: vi.fn(async () => {
    if (state.currentCookie === VALID_COOKIE) {
      return {
        user: { id: "user-1", email: "user1@test.com", displayName: null },
      };
    }
    return { user: null };
  }),
}));

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: () => {
    function chain(table: string): any {
      return {
        select: () => chain(table),
        eq: () => chain(table),
        order: () => chain(table),
        limit: () => chain(table),
        single: async () => {
          switch (table) {
            case "users":
              return {
                data: { id: "user-1", display_name: "Test User" },
                error: null,
              };
            case "tenant_users":
              return { data: { tenant_id: "tenant-1" }, error: null };
            case "projects":
              return {
                data: {
                  id: "proj-1",
                  tenant_id: "tenant-1",
                  template_key: "membership_content_affiliate",
                },
                error: null,
              };
            default:
              return { data: null, error: null };
          }
        },
      };
    }
    return { from: (table: string) => chain(table) };
  },
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
  updateGenerationStep: (...args: unknown[]) => mockUpdateGenerationStep(...args),
  completeGenerationRun: (...args: unknown[]) => mockCompleteGenerationRun(...args),
  failGenerationRun: (...args: unknown[]) => mockFailGenerationRun(...args),
}));

// requireProjectAccess is intentionally REAL here (not mocked) — see file
// header. It transitively uses the two mocks above.
import { requireProjectAccess } from "@/lib/auth/current-user";
import { POST } from "../route";

function makeRequest(cookie: string | null) {
  const headers: Record<string, string> = {};
  if (cookie) headers["Cookie"] = cookie;
  return new Request(
    "https://example.com/api/projects/proj-1/generate-template",
    { method: "POST", headers }
  );
}

const props = { params: Promise.resolve({ projectId: "proj-1" }) };

/** Stand-in for a real child pipeline route's auth guard (e.g.
 * generate-blueprint), sharing the real requireProjectAccess(). */
async function childRouteDouble(): Promise<Response> {
  try {
    await requireProjectAccess("proj-1");
    return NextResponse.json({ ok: true, _meta: undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    if (message === "Not found") {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

describe("generate-template orchestrator — internal Cookie forwarding (instruction 130)", () => {
  const originalFetch = global.fetch;
  let childCalls: Array<{ url: string; status: number }>;

  beforeEach(() => {
    vi.clearAllMocks();
    state.currentCookie = null;
    childCalls = [];
    mockRateLimit.mockResolvedValue(true);
    mockCreateGenerationRun.mockResolvedValue({ id: "run-1" });
    mockUpdateGenerationStep.mockResolvedValue(undefined);
    mockCompleteGenerationRun.mockResolvedValue(undefined);

    // Simulates the real Next.js behavior for a self-fetch round trip: the
    // simulated "server" resolves the auth session from whatever Cookie
    // header actually arrives on the outgoing request, exactly the way a
    // real second HTTP hop through the same Next.js server would.
    global.fetch = vi.fn(async (url: any, init?: any) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const cookie = headers["Cookie"] ?? headers["cookie"] ?? null;

      const previous = state.currentCookie;
      state.currentCookie = cookie;
      try {
        const res = await childRouteDouble();
        const bodyText = await res.text();
        childCalls.push({ url: String(url), status: res.status });
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          text: async () => bodyText,
          json: async () => JSON.parse(bodyText || "{}"),
        } as any;
      } finally {
        state.currentCookie = previous;
      }
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("[red without the fix / green with it] forwards the session Cookie so the internal blueprint step returns 200, not 401", async () => {
    // Top-level request context: this is the authenticated caller's own
    // session cookie.
    state.currentCookie = VALID_COOKIE;

    const res = await POST(makeRequest(VALID_COOKIE) as any, props as any);
    const body = await (res as Response).json();

    // The first internal call is the blueprint step.
    expect(childCalls.length).toBeGreaterThan(0);
    expect(childCalls[0].url).toContain("generate-blueprint");
    expect(childCalls[0].status).toBe(200);
    expect(childCalls[0].status).not.toBe(401);

    // Every internal step must see the session, not just the first.
    for (const call of childCalls) {
      expect(call.status).toBe(200);
    }

    // The whole pipeline completes end to end.
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockCompleteGenerationRun).toHaveBeenCalledWith("run-1");
    expect(mockFailGenerationRun).not.toHaveBeenCalled();
  });

  it("does not forward an unauthenticated caller's (absent) cookie into a false session", async () => {
    // No cookie at all on the inbound request — requireProjectAccess must
    // reject at the top-level access check, before any internal fetch.
    state.currentCookie = null;

    const res = await POST(makeRequest(null) as any, props as any);

    expect(res.status).toBe(401);
    expect(childCalls.length).toBe(0);
    expect(mockCreateGenerationRun).not.toHaveBeenCalled();
  });
});
