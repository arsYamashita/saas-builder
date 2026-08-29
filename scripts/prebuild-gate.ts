/**
 * Automatic build-time gate for scripts/preflight-env.ts.
 *
 * npm runs a script named `prebuild` automatically before `build` (this
 * repo uses npm — package-lock.json — so no extra opt-in is required; note
 * pnpm requires `enable-pre-post-scripts=true` for this convention and
 * would need that if the repo ever switches package managers). This lets
 * the actual production build/deploy path enforce the Upstash preflight
 * check without touching preview deployments, local `next dev`, or CI jobs
 * that only run typecheck/vitest/playwright (none of which invoke
 * `npm run build`).
 *
 * Scope: this only enforces when Vercel itself reports the build is for
 * the `production` environment (`VERCEL_ENV=production`, set automatically
 * by Vercel — see https://vercel.com/docs/environment-variables/system-environment-variables).
 * That is exactly the `vercel --prod` / promote-to-production path this
 * repo's manual deploy procedure uses (see README.md "Production Deploy").
 * Preview builds (`VERCEL_ENV=preview`) and builds run outside Vercel
 * (VERCEL_ENV unset — local `npm run build`, CI) are left untouched so this
 * gate can never break a PR preview deployment or a CI job.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { checkPreflightEnv, type PreflightEnvResult } from "./preflight-env";

export interface PrebuildGateResult {
  /** True when this run should exit non-zero and block the build. */
  blocked: boolean;
  /** Why the decision was made — for logging / tests. */
  reason: "not-production-build" | "preflight-passed" | "preflight-failed";
  preflight?: PreflightEnvResult;
}

/**
 * Pure decision function — safe to import in tests. Does not read
 * process.env unless no `env` argument is supplied, and never exits the
 * process.
 */
export function evaluatePrebuildGate(
  env: Record<string, string | undefined> = process.env
): PrebuildGateResult {
  if (env.VERCEL_ENV !== "production") {
    return { blocked: false, reason: "not-production-build" };
  }

  const preflight = checkPreflightEnv(env);
  if (!preflight.ok) {
    return { blocked: true, reason: "preflight-failed", preflight };
  }

  return { blocked: false, reason: "preflight-passed", preflight };
}

function main(): void {
  const result = evaluatePrebuildGate();

  if (result.reason === "not-production-build") {
    return;
  }

  if (result.blocked) {
    console.error("[prebuild-gate] Production build BLOCKED.");
    console.error(
      `[prebuild-gate] Missing required env var(s): ${(result.preflight?.missing ?? []).join(", ")}`
    );
    console.error(
      "[prebuild-gate] This is a production build (VERCEL_ENV=production) and Upstash Redis is not " +
        "configured. Deploying without it would silently switch lib/rate-limit.ts to fail-closed mode " +
        "(deny every login/signup/AI-generation request). Configure UPSTASH_REDIS_REST_URL / " +
        "UPSTASH_REDIS_REST_TOKEN in the Vercel production environment and redeploy."
    );
    process.exit(1);
  }

  console.log("[prebuild-gate] OK — Upstash env vars are present for this production build.");
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  main();
}
