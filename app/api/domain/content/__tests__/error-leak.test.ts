/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 *
 * Forces the Supabase call in GET/POST to fail with a realistic
 * Postgres-shaped error (naming the real table/column) and asserts the
 * HTTP response never surfaces that detail — only the generic message the
 * route already returns manually (this route predates serverErrorResponse
 * but follows the same "log real cause, return generic message" contract).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/rbac/guards", () => ({
  requireTenantRole: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));
vi.mock("@/lib/audit/write-audit-log", () => ({
  writeAuditLog: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { GET, POST } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireTenantRole = vi.mocked(requireTenantRole);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

// The fabricated upstream failure — mirrors what a real Postgres error
// looks like when `contents` is missing a column or has a broken FK.
const DB_ERROR = fakePostgresError({
  message: 'column "secret_internal_notes" of relation "contents" does not exist',
  code: "42703",
});
// Note: the bare word "contents" is deliberately excluded — the route's own
// safe generic message ("Failed to fetch contents") legitimately contains
// that English word, so asserting on it would be a false positive. The
// column name, PG code, and full "relation ... does not exist" phrase are
// unambiguous stand-ins for "did the raw DB error leak".
const FORBIDDEN = ["secret_internal_notes", "does not exist", "42703"];

describe("GET/POST /api/domain/content — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireTenantRole.mockResolvedValue({ tenant_id: "tenant-1", role: "admin" } as any);
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com", displayName: null } as any);
  });

  it("GET: does not leak the DB error when the select fails", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: null, error: DB_ERROR }),
          }),
        }),
      }),
    } as any);

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch contents" });
  });

  it("POST: does not leak the DB error when the insert fails", async () => {
    mockCreateAdminClient.mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: DB_ERROR }),
          }),
        }),
      }),
    } as any);

    const req = new NextRequest("https://example.com/api/domain/content", {
      method: "POST",
      body: JSON.stringify({
        title: "t",
        content_type: "page",
        visibility: "public",
        published: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create content" });
  });

  it("POST: does not leak an unexpected thrown error (e.g. requireCurrentUser failure)", async () => {
    mockRequireCurrentUser.mockRejectedValue(
      new Error(`User profile not found: ${DB_ERROR.message}`)
    );

    const req = new NextRequest("https://example.com/api/domain/content", {
      method: "POST",
      body: JSON.stringify({
        title: "t",
        content_type: "page",
        visibility: "public",
        published: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to create content" });
  });
});
