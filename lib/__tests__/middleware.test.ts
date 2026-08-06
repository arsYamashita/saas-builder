import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// KB: serverless_inmemory_ratelimit — middleware.ts's getRatelimiters()
// returns null when Upstash is unset, and the original code let all
// /api/* requests through unmetered in that case (a silent pass-through
// in production). This must fail closed (503) in production while still
// allowing local dev without Redis.
//
// Round 2 also covers: getRatelimiters() used to be called OUTSIDE any
// try/catch, and construction (`Redis.fromEnv()` / `new Ratelimit(...)`)
// ran unconditionally inside it. A truthy-but-invalid Upstash config
// throwing there would escape as an uncaught 500, not the intended 503.
// Construction is now cached lazily and wrapped in try/catch so it can
// never throw.
//
// Requests use a path that is under /api/ but NOT in `protectedPrefixes`
// (e.g. "/api/ai/x"), so the auth-cookie/CSRF logic further down in
// middleware() doesn't interfere with observing the rate-limit branch in
// isolation.

const { limitMock, redisFromEnvMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  redisFromEnvMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: redisFromEnvMock,
  },
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => "sliding-window-config");
    limit = limitMock;
    constructor(_opts: unknown) {}
  }
  return { Ratelimit };
});

function req(pathname: string) {
  return new NextRequest(`http://localhost:3000${pathname}`);
}

describe("middleware rate limiting", () => {
  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    limitMock.mockResolvedValue({
      success: true,
      limit: 20,
      remaining: 19,
      reset: Date.now() + 60_000,
    });
    redisFromEnvMock.mockReset();
    redisFromEnvMock.mockReturnValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 503 in production when Upstash is not configured (does not pass through)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns 503 in production when an Upstash env var is whitespace-only (treated as unconfigured)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "   ");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).toBe(503);
    expect(redisFromEnvMock).not.toHaveBeenCalled();
  });

  it("passes through (does not 503) in development when Upstash is not configured, and warns", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).not.toBe(503);
    expect(limitMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Upstash not configured")
    );
  });

  it("rate limits normally (429) in production when Upstash is configured and the limit is exceeded", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    limitMock.mockResolvedValue({
      success: false,
      limit: 20,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).toBe(429);
    expect(limitMock).toHaveBeenCalled();
  });

  it("allows the request through in production when Upstash is configured and under the limit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).not.toBe(429);
    expect(res.status).not.toBe(503);
    expect(limitMock).toHaveBeenCalled();
  });

  it("returns 503 in production, without throwing, when Upstash .limit() rejects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    limitMock.mockRejectedValue(new Error("upstash network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).toBe(503);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("passes through when Upstash .limit() rejects in development, and warns", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    limitMock.mockRejectedValue(new Error("upstash network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).not.toBe(503);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("returns 503 in production, without an uncaught exception, when limiter CONSTRUCTION throws (truthy-but-broken config)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "not-a-valid-url");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisFromEnvMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");

    // Must resolve to a 503 response, not reject/throw.
    await expect(middleware(req("/api/ai/generate-blueprint"))).resolves.toMatchObject({
      status: 503,
    });
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("passes through in development, with a warning, when limiter construction throws", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "not-a-valid-url");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisFromEnvMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { middleware } = await import("../../middleware");
    const res = await middleware(req("/api/ai/generate-blueprint"));

    expect(res.status).not.toBe(503);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not construct the Upstash client at import time even when configured (true laziness)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    await import("../../middleware");
    expect(redisFromEnvMock).not.toHaveBeenCalled();
  });
});
