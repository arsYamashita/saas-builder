import { describe, it, expect } from "vitest";
import { validateEnv } from "../env";

// See [[stripe_env_optional_in_zod]] / [[missing_env_validation_startup]]:
// Stripe keys used to be unvalidated (or `.optional()`), so the server
// would boot without them and only fail at the first checkout/webhook
// request. These tests lock in that Stripe is required in production, and
// that core Supabase/app config is always required.
//
// Stripe presence is only enforced when NODE_ENV=production (not in
// development/test) so that `next dev` / CI jobs without Stripe test keys
// configured (e.g. this repo's Playwright smoke-test job) keep booting.
// Format is still validated whenever a Stripe key IS present, regardless
// of environment.

const coreEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
};

const validProdEnv = {
  ...coreEnv,
  STRIPE_SECRET_KEY: "sk_test_abc123",
  STRIPE_WEBHOOK_SECRET: "whsec_abc123",
  NODE_ENV: "production",
};

describe("validateEnv", () => {
  it("accepts a fully valid production environment", () => {
    expect(() =>
      validateEnv(validProdEnv as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("accepts core config without Stripe keys outside production", () => {
    expect(() =>
      validateEnv({ ...coreEnv, NODE_ENV: "development" } as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(() =>
      validateEnv({ ...coreEnv, NODE_ENV: "test" } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });

  it("throws in production when STRIPE_SECRET_KEY is missing", () => {
    const { STRIPE_SECRET_KEY, ...rest } = validProdEnv;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow(
      /STRIPE_SECRET_KEY is required in production/
    );
  });

  it("throws in production when STRIPE_WEBHOOK_SECRET is missing", () => {
    const { STRIPE_WEBHOOK_SECRET, ...rest } = validProdEnv;
    expect(() => validateEnv(rest as NodeJS.ProcessEnv)).toThrow(
      /STRIPE_WEBHOOK_SECRET is required in production/
    );
  });

  it("throws when STRIPE_SECRET_KEY has an invalid prefix, in any environment", () => {
    expect(() =>
      validateEnv({
        ...coreEnv,
        NODE_ENV: "development",
        STRIPE_SECRET_KEY: "not-a-real-key",
      } as NodeJS.ProcessEnv)
    ).toThrow(/STRIPE_SECRET_KEY must start with/);
  });

  it("throws when STRIPE_WEBHOOK_SECRET has an invalid prefix, in any environment", () => {
    expect(() =>
      validateEnv({
        ...coreEnv,
        NODE_ENV: "development",
        STRIPE_WEBHOOK_SECRET: "not-a-whsec-value",
      } as NodeJS.ProcessEnv)
    ).toThrow(/STRIPE_WEBHOOK_SECRET must start with whsec_/);
  });

  it("throws when core Supabase config is missing, regardless of environment", () => {
    const { SUPABASE_SERVICE_ROLE_KEY, ...rest } = coreEnv;
    expect(() =>
      validateEnv({ ...rest, NODE_ENV: "development" } as NodeJS.ProcessEnv)
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws when NEXT_PUBLIC_APP_URL is missing (used for CSRF Origin checks)", () => {
    const { NEXT_PUBLIC_APP_URL, ...rest } = coreEnv;
    expect(() =>
      validateEnv({ ...rest, NODE_ENV: "development" } as NodeJS.ProcessEnv)
    ).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("aggregates multiple missing core vars into a single error", () => {
    try {
      validateEnv({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv);
      throw new Error("expected validateEnv to throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(message).toMatch(/NEXT_PUBLIC_APP_URL/);
    }
  });

  it("reports both missing Stripe keys together when in production", () => {
    try {
      validateEnv({
        ...coreEnv,
        NODE_ENV: "production",
      } as unknown as NodeJS.ProcessEnv);
      throw new Error("expected validateEnv to throw");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/STRIPE_SECRET_KEY is required in production/);
      expect(message).toMatch(
        /STRIPE_WEBHOOK_SECRET is required in production/
      );
    }
  });

  it("does not require AI provider keys or Upstash Redis config", () => {
    // These are optional by design — see comment in lib/env.ts.
    expect(() =>
      validateEnv(validProdEnv as NodeJS.ProcessEnv)
    ).not.toThrow();
    expect(validProdEnv).not.toHaveProperty("GEMINI_API_KEY");
    expect(validProdEnv).not.toHaveProperty("UPSTASH_REDIS_REST_URL");
  });
});
