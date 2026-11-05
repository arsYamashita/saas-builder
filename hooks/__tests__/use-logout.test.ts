import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

import { useLogout } from "../use-logout";

function mockFetch(res: Partial<Response> & { json: () => Promise<unknown> }) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

describe("useLogout", () => {
  const alertMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("alert", alertMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時は redirectTo へ push する", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ ok: true, redirectTo: "/auth/login" }),
    });
    const logout = useLogout();
    expect(await logout()).toBe(true);
    expect(push).toHaveBeenCalledWith("/auth/login");
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("500 のときは push せず alert を出す", async () => {
    mockFetch({
      ok: false,
      json: async () => ({ ok: false, error: "ログアウトに失敗しました" }),
    });
    const logout = useLogout();
    expect(await logout()).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("ログアウトに失敗しました");
  });

  it("res.ok でも json.ok が true でなければ push しない", async () => {
    mockFetch({ ok: true, json: async () => ({ redirectTo: "/auth/login" }) });
    const logout = useLogout();
    expect(await logout()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("JSON でない応答では push せず alert を出す", async () => {
    mockFetch({
      ok: false,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    const logout = useLogout();
    expect(await logout()).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith("ログアウトに失敗しました");
  });

  it("通信失敗でも push しない", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const logout = useLogout();
    expect(await logout()).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });
});
