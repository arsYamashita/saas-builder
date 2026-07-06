/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { GET, POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

const validProjectBody = {
  name: "Acme Booking",
  summary: "予約管理を簡単にするサービスです",
  targetUsers: "個人サロン経営者",
  problemToSolve: "予約の電話対応が大変",
  brandTone: "modern",
  templateKey: "custom",
  requiredFeatures: ["booking"],
  managedData: ["customers"],
  endUserCreatedData: [],
  roles: ["owner"],
  billingModel: "subscription",
  affiliateEnabled: false,
  visibilityRule: "public",
  mvpScope: ["booking"],
  excludedInitialScope: [],
  stackPreference: "nextjs",
  priority: "medium",
};

describe("GET/POST /api/projects — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "u@example.com",
      displayName: null,
    } as any);
  });

  it("GET: does not leak the DB error when fetching projects fails", async () => {
    const dbError = fakePostgresError({
      message: 'column "internal_cost_estimate" of relation "projects" does not exist',
      code: "42703",
    });
    mockCreateAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "tenant_users") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    single: () =>
                      Promise.resolve({ data: { tenant_id: "tenant-1" }, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: null, error: dbError }),
            }),
          }),
        };
      },
    } as any);

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["internal_cost_estimate", "does not exist", "42703"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch projects" });
  });

  it("GET: does not leak an unexpected thrown error", async () => {
    mockRequireCurrentUser.mockRejectedValue(
      new Error('User profile not found: relation "users_shadow" does not exist')
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["users_shadow", "does not exist"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch projects" });
  });

  it("POST: does not leak the DB error when tenant creation fails", async () => {
    const dbError = fakePostgresError({
      message: 'duplicate key value violates unique constraint "tenants_slug_key"',
      code: "23505",
    });
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any);

    const req = new NextRequest("https://example.com/api/projects", {
      method: "POST",
      body: JSON.stringify(validProjectBody),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["tenants_slug_key", "duplicate key", "23505"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create tenant" });
  });

  it("POST: does not leak the DB error when project creation fails", async () => {
    const dbError = fakePostgresError({
      message: 'insert into "projects" violates check constraint "projects_status_check"',
      code: "23514",
    });
    let insertCallCount = 0;
    mockCreateAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === "tenants") {
          return {
            insert: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({ data: { id: "tenant-1" }, error: null }),
              }),
            }),
          };
        }
        if (table === "tenant_users") {
          return { insert: () => Promise.resolve({ error: null }) };
        }
        // projects
        insertCallCount += 1;
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: null, error: dbError }),
            }),
          }),
        };
      },
    } as any);

    const req = new NextRequest("https://example.com/api/projects", {
      method: "POST",
      body: JSON.stringify(validProjectBody),
    });

    const res = await POST(req);
    expect(insertCallCount).toBe(1);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["projects_status_check", "check constraint", "23514"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create project" });
  });
});
