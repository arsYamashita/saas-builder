import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();

vi.mock("../clients/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}));

import { getAuthSession } from "../session";

describe("getAuthSession", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns { user: null } when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const session = await getAuthSession();

    expect(session).toEqual({ user: null });
  });

  it("maps the Supabase user onto { id, email, displayName }", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "user@example.com",
          user_metadata: { display_name: "Ada" },
        },
      },
    });

    const session = await getAuthSession();

    expect(session).toEqual({
      user: { id: "user-1", email: "user@example.com", displayName: "Ada" },
    });
  });

  it("defaults displayName to null and email to empty string when absent", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-2", email: undefined, user_metadata: {} } },
    });

    const session = await getAuthSession();

    expect(session).toEqual({
      user: { id: "user-2", email: "", displayName: null },
    });
  });
});
