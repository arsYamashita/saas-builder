/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNoLeak, fakePostgresError } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/db/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({
  requireCurrentUser: vi.fn(),
}));

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { GET } from "../route";

const mockCreateAdminClient = vi.mocked(createAdminClient);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

const DB_ERROR = fakePostgresError({
  message: 'column "internal_billing_note" of relation "subscriptions" does not exist',
  code: "42703",
});
const FORBIDDEN = ["internal_billing_note", "does not exist", "42703"];

describe("GET /api/billing/subscriptions — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1", email: "u@example.com", displayName: null } as any);
  });

  it("does not leak the DB error when the select fails", async () => {
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
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch subscriptions" });
  });

  it("does not leak an unexpected thrown error", async () => {
    mockRequireCurrentUser.mockRejectedValue(
      new Error(`User profile not found: ${DB_ERROR.message}`)
    );

    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, FORBIDDEN);
    expect(JSON.parse(text)).toEqual({ error: "Failed to fetch subscriptions" });
  });
});
