import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// KB: serverless_inmemory_ratelimit — lib/rate-limit.ts must never silently
// ALLOW requests through in production when no Upstash-backed limiter is
// available. It fails closed (returns false = deny), it does not throw
// (an uncaught throw inside a route handler's try/catch could still surface
// as an unrelated-looking 500; a deny return is explicit and testable).
//
// This also covers: construction (`new Redis(...)` / `new Ratelimit(...)`)
// used to run unconditionally at module top level. A truthy-but-invalid
// Upstash config throwing there would crash the import. Construction now
// happens lazily on first call to rateLimit(), wrapped in try/catch.
//
// See lib/__tests__/rate-limit.test.ts for the dev/test in-memory fallback
// contract (allow up to `limit` per window, then deny) — this file adds the
// production fail-closed contract on top of that, with Upstash mocked out.

const { limitMock, redisCtorMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
  redisCtorMock: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: redisCtorMock,
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn(() => "sliding-window-config");
    limit = limitMock;
    constructor(_opts: unknown) {}
  }
  return { Ratelimit };
});

describe("lib/rate-limit — production fail-closed", () => {
  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    limitMock.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60_000,
    });
    redisCtorMock.mockReset();
    redisCtorMock.mockImplementation(() => ({}));
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

    await expect(import("../rate-limit")).resolves.toBeTruthy();
  });

  it("does not throw at import in production when Upstash IS configured but construction would fail (truthy-but-broken config)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "not-a-valid-url");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisCtorMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(import("../rate-limit")).resolves.toBeTruthy();
  });

  it("does not construct the Upstash client at import time even when configured (true laziness)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    await import("../rate-limit");
    expect(redisCtorMock).not.toHaveBeenCalled();
  });

  it("denies (returns false) in production when Upstash is not configured, and does not throw", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("login:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("denies (returns false) in production for the generate prefix when Upstash is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("generate:user-1", 5, 60_000)).resolves.toBe(false);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("denies (returns false) in production for the generate-template prefix when Upstash is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("generate-template:user-1", 2, 60_000)).resolves.toBe(false);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("denies (returns false) in production for a prefix with no registered limiter, even with Upstash configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    // "unknownscope" has no entry among login/signup/generate/generate-template.
    await expect(rateLimit("unknownscope:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("denies (returns false) in production, without throwing, when one-sided Upstash env is set (token missing)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("login:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(limitMock).not.toHaveBeenCalled();
  });

  it("denies (returns false) in production when an Upstash env var is whitespace-only (treated as unconfigured)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "   ");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("login:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(redisCtorMock).not.toHaveBeenCalled();
  });

  it("denies (returns false) in production when the Upstash SDK's own timeout kicks in " +
    "(reason: \"timeout\", success: true — the SDK's fail-OPEN default)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    // This mirrors @upstash/ratelimit's actual behavior when its internal
    // `timeout` (default 5s) elapses: it resolves (does not reject) with
    // success: true and reason: "timeout", NOT an exception. A naive
    // try/catch-only fail-closed implementation would treat this as a
    // successful allow.
    limitMock.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 5,
      reset: Date.now() + 60_000,
      reason: "timeout",
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("login:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("falls back to in-memory in development when the Upstash SDK's own timeout kicks in", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    limitMock.mockResolvedValue({
      success: true,
      limit: 5,
      remaining: 5,
      reset: Date.now() + 60_000,
      reason: "timeout",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");
    const allowed = await rateLimit("login:1.2.3.4", 5, 60_000);

    expect(allowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("uses the Upstash-backed limiter (not in-memory) when configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    const { rateLimit } = await import("../rate-limit");
    const allowed = await rateLimit("login:1.2.3.4", 5, 60_000);

    expect(allowed).toBe(true);
    expect(limitMock).toHaveBeenCalledWith("login:1.2.3.4");
  });

  it("denies (returns false) in production, without throwing, when Upstash .limit() rejects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    limitMock.mockRejectedValue(new Error("upstash network error"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("login:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("denies (returns false) in production, without throwing, when construction fails despite present env vars", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisCtorMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    await expect(rateLimit("login:1.2.3.4", 5, 60_000)).resolves.toBe(false);
    expect(limitMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("falls back to in-memory in development and warns loudly", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");
    const allowed = await rateLimit("login:9.9.9.9", 5, 60_000);

    expect(allowed).toBe(true);
    expect(limitMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("in-memory fallback (dev only, NOT for production)")
    );
  });

  it("falls back to in-memory in development, with a warning, when construction fails despite present env vars", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");
    redisCtorMock.mockImplementation(() => {
      throw new Error("bad upstash config");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");
    const allowed = await rateLimit("login:1.2.3.4", 5, 60_000);

    expect(allowed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("throttles repeated error logs for the same failure within the throttle window " +
    "(log-amplification-DoS guard)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");

    // An unauthenticated attacker can call login/signup as fast as the
    // network allows; during an Upstash outage this must not turn into an
    // unbounded console.error (and stack trace) per request.
    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rateLimit(`login:1.2.3.${i}`, 5, 60_000)).resolves.toBe(false);
    }

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("in-memory fallback still enforces the limit in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rateLimit } = await import("../rate-limit");
    const key = "login:5.5.5.5";

    expect(await rateLimit(key, 2, 60_000)).toBe(true);
    expect(await rateLimit(key, 2, 60_000)).toBe(true);
    expect(await rateLimit(key, 2, 60_000)).toBe(false);
  });
});
