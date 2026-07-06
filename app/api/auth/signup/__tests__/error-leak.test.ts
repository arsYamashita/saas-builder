/**
 * Error-leak wiring test — see docs/testing/error-leak-surfaces.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { assertNoLeak } from "@/tests/helpers/assert-no-leak";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/db/supabase/server", () => ({
  createClient: vi.fn(),
}));
vi.mock("@/lib/auth/signup-flow", () => ({
  runSignupFlow: vi.fn(),
}));

import { createClient } from "@/lib/db/supabase/server";
import { POST } from "../route";

const mockCreateClient = vi.mocked(createClient);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: "user@example.com",
  password: "password123",
  displayName: "User",
  tenantName: "Acme",
};

describe("POST /api/auth/signup — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak the raw Supabase signUp error", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: null },
          error: {
            message:
              'duplicate key value violates unique constraint "users_email_key"',
          },
        }),
      },
    } as any);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(400);
    const text = await res.text();
    assertNoLeak(text, ["users_email_key", "duplicate key", "unique constraint"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to sign up" });
  });

  it("does not leak an unexpected thrown error (e.g. runSignupFlow DB failure)", async () => {
    const { runSignupFlow } = await import("@/lib/auth/signup-flow");
    vi.mocked(runSignupFlow).mockRejectedValue(
      new Error('insert into "tenants" violates check constraint "tenants_slug_check"')
    );

    mockCreateClient.mockResolvedValue({
      auth: {
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      },
    } as any);

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["tenants_slug_check", "check constraint"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to complete signup" });
  });
});
