import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/db/supabase/server";
import { POST } from "../route";

const mockCreateClient = vi.mocked(createClient);

function fakeClient(signOutResult: { error: unknown }) {
  return { auth: { signOut: vi.fn().mockResolvedValue(signOutResult) } } as never;
}

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("signOut 成功時は ok:true と redirectTo を返す", async () => {
    mockCreateClient.mockResolvedValue(fakeClient({ error: null }));
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirectTo: "/auth/login" });
  });

  it("signOut が error を返したら 500 と ok:false を返す", async () => {
    mockCreateClient.mockResolvedValue(
      fakeClient({ error: new Error("session_store secret detail 42P01") })
    );
    const res = await POST();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: "ログアウトに失敗しました",
    });
    expect(text).not.toContain("session_store");
    expect(text).not.toContain("42P01");
  });
});
