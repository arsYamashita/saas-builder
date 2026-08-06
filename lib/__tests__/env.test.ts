import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// KB: serverless_inmemory_ratelimit — Upstash env vars stay optional in
// lib/env.ts. This module is imported at module-init time (app/layout.tsx),
// and Next.js runs that code during route-bundle module-init and during
// `next build` (which sets NODE_ENV=production) — making Upstash required
// here would reintroduce `startup_env_validation_prod_outage` (a prior
// full production outage from an import-time env requirement). Upstash
// enforcement now lives in scripts/preflight-env.ts (deploy-time) and in
// the runtime fail-closed behavior of lib/rate-limit.ts / lib/ratelimit.ts
// / middleware.ts.

const REQUIRED_BASE_ENV: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  STRIPE_SECRET_KEY: "sk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_123",
};

function stubBaseEnv() {
  for (const [key, value] of Object.entries(REQUIRED_BASE_ENV)) {
    vi.stubEnv(key, value);
  }
}

describe("lib/env", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not throw in production when Upstash env vars are missing", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);

    const { env } = await import("../env");
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
  });

  it("passes Upstash env vars through when they are set in production", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token-123");

    const { env } = await import("../env");
    expect(env.UPSTASH_REDIS_REST_URL).toBe("https://example.upstash.io");
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBe("token-123");
  });

  it("does not require Upstash env vars in development", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);

    const { env } = await import("../env");
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_TOKEN).toBeUndefined();
  });

  it("does not require Upstash env vars in test", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", undefined);
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", undefined);

    const mod = await import("../env");
    expect(mod.env.UPSTASH_REDIS_REST_URL).toBeUndefined();
  });

  it("still throws when a genuinely required var (non-Upstash) is missing, regardless of NODE_ENV", async () => {
    stubBaseEnv();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("STRIPE_SECRET_KEY", undefined);

    await expect(import("../env")).rejects.toThrow(
      /Missing or invalid environment variables/
    );
  });
});
