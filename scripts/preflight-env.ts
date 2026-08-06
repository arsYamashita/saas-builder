/**
 * Deploy-time preflight check for Upstash Redis configuration.
 *
 * This is intentionally NOT run at import time / `next build` time (see
 * lib/env.ts and KB `startup_env_validation_prod_outage` — a prior full
 * production outage caused by exactly that pattern). Instead, run this
 * script as an explicit step in the deploy pipeline BEFORE traffic is
 * routed to the new deployment, so a missing Upstash config is caught
 * before go-live rather than causing rate limiting to silently fail
 * closed (deny all requests) at runtime.
 *
 * Usage:
 *   npm run preflight:env
 *   npx tsx scripts/preflight-env.ts
 *
 * Exits 0 if UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are both
 * present and non-empty; exits 1 with a descriptive message otherwise.
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const REQUIRED_KEYS = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"] as const;

export interface PreflightEnvResult {
  ok: boolean;
  missing: string[];
}

/**
 * Pure check — safe to import in tests. Does not read process.env unless
 * no `env` argument is supplied, and never exits the process.
 */
export function checkPreflightEnv(
  env: Record<string, string | undefined> = process.env
): PreflightEnvResult {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = env[key];
    return !value || value.trim() === "";
  });

  return { ok: missing.length === 0, missing };
}

function main(): void {
  const result = checkPreflightEnv();

  if (!result.ok) {
    console.error("[preflight-env] Deploy preflight FAILED.");
    console.error(
      `[preflight-env] Missing required env var(s): ${result.missing.join(", ")}`
    );
    console.error(
      "[preflight-env] Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) must be " +
        "configured before this deploy goes live. Without it, rate limiting fails closed at " +
        "runtime (lib/rate-limit.ts, lib/ratelimit.ts, middleware.ts all deny requests rather than " +
        "silently allowing them) — meaning the app would serve 429/503s to real traffic. " +
        "Configure Upstash in the target environment (e.g. Vercel production env vars) and re-run this check."
    );
    process.exitCode = 1;
    return;
  }

  console.log("[preflight-env] OK — Upstash env vars are present.");
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
