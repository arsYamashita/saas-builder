import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const AUTH_COOKIE = "sb-project-auth-token";
const APP_URL = "https://app.example.com";

function makeRequest(opts: {
  path: string;
  method?: string;
  origin?: string | null;
  authed?: boolean;
}) {
  const headers = new Headers();
  if (opts.origin !== undefined && opts.origin !== null) {
    headers.set("origin", opts.origin);
  }
  if (opts.authed) {
    headers.set("cookie", `${AUTH_COOKIE}=fake-jwt`);
  }

  return new NextRequest(new URL(opts.path, APP_URL), {
    method: opts.method ?? "GET",
    headers,
  });
}

describe("middleware CSRF/Origin check", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("rejects unauthenticated API requests with 401 (unrelated to CSRF)", async () => {
    const req = makeRequest({ path: "/api/projects", method: "POST" });
    const res = middleware(req);
    expect(res.status).toBe(401);
  });

  it("rejects state-changing requests with NO Origin header (fail closed)", async () => {
    // This is the exact bypass in [[nextjs_middleware_csrf_origin_bypass]]:
    // requests without an Origin header used to sail through the old
    // `if (origin && ...)` check.
    const req = makeRequest({
      path: "/api/projects",
      method: "POST",
      authed: true,
      origin: null,
    });
    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  it("rejects state-changing requests with a mismatched Origin", async () => {
    const req = makeRequest({
      path: "/api/projects",
      method: "POST",
      authed: true,
      origin: "https://evil.example.com",
    });
    const res = middleware(req);
    expect(res.status).toBe(403);
  });

  it("allows state-changing requests with a matching Origin", async () => {
    const req = makeRequest({
      path: "/api/projects",
      method: "POST",
      authed: true,
      origin: APP_URL,
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("does not apply the Origin check to GET requests", async () => {
    const req = makeRequest({
      path: "/api/projects",
      method: "GET",
      authed: true,
      origin: null,
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("fails closed when NEXT_PUBLIC_APP_URL is not configured", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = makeRequest({
      path: "/api/projects",
      method: "POST",
      authed: true,
      origin: "https://app.example.com",
    });
    const res = middleware(req);
    expect(res.status).toBe(403);
  });
});
