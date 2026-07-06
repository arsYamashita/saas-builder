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

import { createClient } from "@/lib/db/supabase/server";
import { POST } from "../route";

const mockCreateClient = vi.mocked(createClient);

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("https://example.com/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login — error-leak wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("does not leak the raw Supabase auth error on signInWithPassword failure", async () => {
    mockCreateClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          error: {
            message:
              "AuthApiError: relation \"auth.internal_login_attempts\" does not exist",
          },
        }),
      },
    } as any);

    const res = await POST(
      makeRequest({ email: "user@example.com", password: "password123" })
    );

    expect(res.status).toBe(400);
    const text = await res.text();
    assertNoLeak(text, ["internal_login_attempts", "AuthApiError"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to login" });
  });

  it("does not leak an unexpected thrown error (e.g. createClient failure)", async () => {
    mockCreateClient.mockRejectedValue(
      new Error(
        'connect ECONNREFUSED 127.0.0.1:5432 — relation "users" broken'
      )
    );

    const res = await POST(
      makeRequest({ email: "user@example.com", password: "password123" })
    );

    expect(res.status).toBe(500);
    const text = await res.text();
    assertNoLeak(text, ["ECONNREFUSED", "127.0.0.1", "relation"]);
    expect(JSON.parse(text)).toEqual({ error: "Failed to login" });
  });
});
