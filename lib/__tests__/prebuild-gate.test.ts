import { describe, it, expect } from "vitest";
import { evaluatePrebuildGate } from "../../scripts/prebuild-gate";

// scripts/prebuild-gate.ts is the automatic (npm `prebuild` hook) enforcement
// of scripts/preflight-env.ts. It must ONLY block a real Vercel production
// build (VERCEL_ENV=production) — never a preview deployment, local build,
// or CI job that happens to run `npm run build` without VERCEL_ENV set.

describe("scripts/prebuild-gate evaluatePrebuildGate", () => {
  it("does not block when VERCEL_ENV is unset (local build / CI)", () => {
    const result = evaluatePrebuildGate({});
    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("not-production-build");
  });

  it("does not block a preview build even if Upstash is unset", () => {
    const result = evaluatePrebuildGate({ VERCEL_ENV: "preview" });
    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("not-production-build");
  });

  it("does not block a development-environment build even if Upstash is unset", () => {
    const result = evaluatePrebuildGate({ VERCEL_ENV: "development" });
    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("not-production-build");
  });

  it("blocks a production build when Upstash env vars are missing", () => {
    const result = evaluatePrebuildGate({ VERCEL_ENV: "production" });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("preflight-failed");
    expect(result.preflight?.missing).toEqual(
      expect.arrayContaining(["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"])
    );
  });

  it("blocks a production build when only one Upstash env var is set", () => {
    const result = evaluatePrebuildGate({
      VERCEL_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    });
    expect(result.blocked).toBe(true);
    expect(result.preflight?.missing).toEqual(["UPSTASH_REDIS_REST_TOKEN"]);
  });

  it("does not block a production build when both Upstash env vars are set", () => {
    const result = evaluatePrebuildGate({
      VERCEL_ENV: "production",
      UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "token-123",
    });
    expect(result.blocked).toBe(false);
    expect(result.reason).toBe("preflight-passed");
  });
});
