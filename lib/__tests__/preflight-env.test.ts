import { describe, it, expect } from "vitest";
import { checkPreflightEnv } from "../../scripts/preflight-env";

// scripts/preflight-env.ts is the deploy-time replacement for the removed
// import-time Upstash requirement in lib/env.ts (see env.test.ts). It must
// be run as an explicit pipeline step before go-live, never at import time.

describe("scripts/preflight-env checkPreflightEnv", () => {
  it("fails when both Upstash env vars are missing", () => {
    const result = checkPreflightEnv({});
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])
    );
  });

  it("fails when only UPSTASH_REDIS_REST_URL is set (token missing)", () => {
    const result = checkPreflightEnv({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["UPSTASH_REDIS_REST_TOKEN"]);
  });

  it("fails when only UPSTASH_REDIS_REST_TOKEN is set (url missing)", () => {
    const result = checkPreflightEnv({
      UPSTASH_REDIS_REST_TOKEN: "token-123",
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["UPSTASH_REDIS_REST_URL"]);
  });

  it("fails when a value is present but empty/whitespace", () => {
    const result = checkPreflightEnv({
      UPSTASH_REDIS_REST_URL: "   ",
      UPSTASH_REDIS_REST_TOKEN: "token-123",
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["UPSTASH_REDIS_REST_URL"]);
  });

  it("passes when both Upstash env vars are set", () => {
    const result = checkPreflightEnv({
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token-123",
    });
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
