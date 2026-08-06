import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// KB: serverless_inmemory_ratelimit — lib/ratelimit.ts's checkRateLimit()
// must not silently pass every request through (null) when Upstash is
// unconfigured in production; it must return a discriminable deny result.
//
// This also covers the round-2 regression: `aiRatelimit`/`authRatelimit`
// previously called the lazy getter EAGERLY at module top level
// (`export const aiRatelimit = getAiRatelimit()`), which meant a
// truthy-but-broken Upstash config (Redis.fromEnv()/`new Ratelimit()`
// throwing) would crash at IMPORT, defeating the whole "lazy" design.
// They are now exported as unresolved thunks; construction is deferred
// until checkRateLimit() actually calls one, and that construction is
// itself wrapped in try/catch so it can never throw even then.

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

describe("lib/ratelimit", () => {
  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    limitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
    });
    redisFromEnvMock.mockReset();
    redisFromEnvMock.mockReturnValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("does not throw at import in production when Upstash is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../ratelimit")).resolves.toBeTruthy();
  });

  it("does not throw at import in production when Upstash IS configured but construction would fail (truthy-but-broken config)", async () => {
    // This is the round-2 regression case: env vars present, but
    // Redis.fromEnv() (called at construction time) throws — e.g. a
    // malformed URL. Import itself must still succeed.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "not-a-valid-url");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisFromEnvMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../ratelimit")).resolves.toBeTruthy();
  });

  it("exports aiRatelimit/authRatelimit as thunks and does not construct the Upstash client until first use", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    const { aiRatelimit, authRatelimit, checkRateLimit } = await import("../ratelimit");

    expect(typeof aiRatelimit).toBe("function");
    expect(typeof authRatelimit).toBe("function");
    // Nothing constructed yet, purely from importing the module.
    expect(redisFromEnvMock).not.toHaveBeenCalled();

    await checkRateLimit(aiRatelimit, "1.2.3.4");
    expect(redisFromEnvMock).toHaveBeenCalledTimes(1);
  });

  it("checkRateLimit denies (success:false) in production when Upstash is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    expect(typeof aiRatelimit).toBe("function");

    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");
    expect(result).toEqual({ success: false, limit: 0, remaining: 0, reset: 0 });
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("checkRateLimit denies in production when only one Upstash env var is set (one-sided config)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");
    expect(result).toEqual({ success: false, limit: 0, remaining: 0, reset: 0 });
  });

  it("checkRateLimit denies in production when an Upstash env var is whitespace-only (treated as unconfigured)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "   ");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");
    expect(result).toEqual({ success: false, limit: 0, remaining: 0, reset: 0 });
    expect(redisFromEnvMock).not.toHaveBeenCalled();
  });

  it("uses the Upstash-backed (persistent) limiter when configured in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");
    expect(result).toEqual({
      success: true,
      limit: 10,
      remaining: 9,
      reset: expect.any(Number),
    });
    expect(limitMock).toHaveBeenCalledWith("1.2.3.4");
  });

  it("checkRateLimit denies in production, without throwing, when Upstash .limit() rejects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    limitMock.mockRejectedValue(new Error("upstash network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");

    expect(result).toEqual({ success: false, limit: 0, remaining: 0, reset: 0 });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("checkRateLimit denies in production, without throwing, when construction fails despite present env vars", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisFromEnvMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");

    expect(result).toEqual({ success: false, limit: 0, remaining: 0, reset: 0 });
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("does not fail-fast in development, warns, and checkRateLimit passes through (null)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { aiRatelimit, authRatelimit, checkRateLimit } = await import(
      "../ratelimit"
    );

    expect(typeof aiRatelimit).toBe("function");
    expect(typeof authRatelimit).toBe("function");

    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("dev/test only, NOT for production")
    );
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("in development, falls back to null (pass-through) with a warning when construction fails", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisFromEnvMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { aiRatelimit, checkRateLimit } = await import("../ratelimit");
    const result = await checkRateLimit(aiRatelimit, "1.2.3.4");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});
