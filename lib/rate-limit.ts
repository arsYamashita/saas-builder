import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value && value.trim() !== "");
}

function hasUpstashConfigured(): boolean {
  return (
    nonEmpty(process.env.UPSTASH_REDIS_REST_URL) &&
    nonEmpty(process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

// In-memory fallback for local development without Redis
const localMap = new Map<string, { count: number; resetTime: number }>();

function localRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = localMap.get(key);

  if (!entry || now > entry.resetTime) {
    localMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

type LimiterKey = "login" | "signup" | "generate" | "generate-template";
type Limiters = Record<LimiterKey, Ratelimit>;

function isLimiterKey(prefix: string): prefix is LimiterKey {
  return (
    prefix === "login" ||
    prefix === "signup" ||
    prefix === "generate" ||
    prefix === "generate-template"
  );
}

// Lazily construct (and cache) the Upstash-backed limiters. Must NOT run at
// module import — this module is imported directly by app/api/auth/login,
// app/api/auth/signup, and every AI generate-* route, and `next build` runs
// with NODE_ENV=production. Construction used to happen unconditionally at
// the top of this module (`new Redis(...)` / `new Ratelimit(...)`); a
// truthy-but-invalid Upstash config (e.g. malformed URL) throwing there
// would crash the import — the `startup_env_validation_prod_outage` failure
// mode. Resolution now happens on first call to rateLimit() instead, and
// construction is wrapped in try/catch so it can never throw even then.
let cachedLimiters: Limiters | null | undefined;

function getLimiters(): Limiters | null {
  if (cachedLimiters !== undefined) return cachedLimiters;

  if (!hasUpstashConfigured()) {
    cachedLimiters = null;
    return cachedLimiters;
  }

  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });

    cachedLimiters = {
      login: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "60 s"),
        prefix: "rl:login",
      }),
      signup: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(3, "60 s"),
        prefix: "rl:signup",
      }),
      // AI generation endpoints (generate-blueprint / generate-implementation /
      // generate-schema / generate-api-design / generate-template / rewrite-brief)
      // call paid LLM providers (Gemini / Claude / OpenAI) and had no rate limit at
      // all, so a single user could drive unbounded API cost.
      // See [[saas_builder_ai_endpoint_no_rate_limit]].
      // Backed by Upstash Redis (persistent, works across serverless instances) —
      // see [[serverless_inmemory_ratelimit]] for why an in-memory Map is unsafe here.
      generate: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "60 s"),
        prefix: "rl:generate",
      }),
      // generate-template (the full pipeline) gets its own bucket, separate from
      // the per-step `generate` bucket: one pipeline run drives 4+ LLM steps via
      // internal calls, so if it shared the per-step bucket, a user who had used
      // e.g. generate-blueprint moments earlier could start a pipeline that dies
      // with 429 halfway through — after paid LLM work has already run. Internal
      // step calls made by the pipeline bypass the per-step limit via
      // lib/pipeline-internal.ts, making this bucket the pipeline's sole gate.
      "generate-template": new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(2, "60 s"),
        prefix: "rl:generate-template",
      }),
    };
  } catch (err) {
    // Config env vars were present but construction still failed (malformed
    // URL, client-side validation, etc.). Never let this escape as an
    // exception — degrade to "unavailable" like the unset case above;
    // rateLimit() below fails closed in production for that.
    if (isProduction()) {
      console.error(
        "[rate-limit] Failed to construct Upstash-backed limiters despite Upstash env vars being set; " +
          "failing closed (deny) instead of throwing.",
        err
      );
    } else {
      console.warn(
        "[rate-limit] Failed to construct Upstash-backed limiters in development; falling back to in-memory.",
        err
      );
    }
    cachedLimiters = null;
  }

  return cachedLimiters;
}

/**
 * Rate limit a request by key.
 *
 * Uses Upstash Redis when configured (serverless-safe, persists across
 * instances). Behavior when no Upstash-backed limiter is available for the
 * key's prefix (Upstash unset, construction failed, or the prefix isn't one
 * of "login"/"signup"/"generate"/"generate-template"):
 *   - production: FAIL CLOSED — deny the request (return false) and log
 *     console.error once. In-memory rate limiting does not work across
 *     serverless instances, so it must never silently stand in for Upstash
 *     in production; denying is safer than an unmetered pass-through.
 *   - development/test: fall back to an in-memory Map (best-effort, single
 *     instance only) and log console.warn.
 *
 * A runtime error from Upstash itself (network/auth/outage) is also
 * handled: in production it fails closed (deny + console.error) rather
 * than letting the exception propagate into a 500.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  // Extract prefix for limiter lookup (e.g., "login" from "login:192.168.1.1")
  const prefix = key.split(":")[0];
  const limiters = getLimiters();
  const limiter = limiters && isLimiterKey(prefix) ? limiters[prefix] : undefined;

  if (limiter) {
    try {
      const { success } = await limiter.limit(key);
      return success;
    } catch (err) {
      if (isProduction()) {
        console.error(
          `[rate-limit] Upstash rate limit check failed for key "${key}"; failing closed (denying request).`,
          err
        );
        return false;
      }
      console.warn(
        `[rate-limit] Upstash rate limit check failed for key "${key}" in development; falling back to in-memory.`,
        err
      );
      return localRateLimit(key, limit, windowMs);
    }
  }

  if (isProduction()) {
    console.error(
      `[rate-limit] No Upstash-backed limiter available for key "${key}" (Upstash unset, misconfigured, or ` +
        `prefix not "login"/"signup"/"generate"/"generate-template") in production; failing closed (denying ` +
        "request). Configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — see scripts/preflight-env.ts."
    );
    return false;
  }

  // Fallback: in-memory (dev/test only)
  console.warn(
    `[rate-limit] in-memory fallback (dev only, NOT for production) used for key "${key}". ` +
      "Configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN for persistent, serverless-safe rate limiting."
  );
  return localRateLimit(key, limit, windowMs);
}
