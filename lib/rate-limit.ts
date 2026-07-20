import { Redis } from "@upstash/redis";
import {
  createRateLimiter,
  createUpstashBucketLimiter,
  type RateLimitBucketConfig,
  type RateLimitFailMode,
} from "@saas/supabase-guard/rate-limit";

/**
 * App-level wiring for @saas/supabase-guard's rate limiter: saas-builder's
 * bucket definitions + Upstash Redis client construction from env vars.
 *
 * The real limiting logic (in-memory fallback, fail-open/fail-closed
 * policy, per-bucket Redis-backed limiters) lives in the package —
 * see packages/supabase-guard/src/rate-limit.ts and its README. This file
 * used to contain that logic directly; it's now just configuration, kept
 * here (rather than only in the package) so callers' `import { rateLimit }
 * from "@/lib/rate-limit"` doesn't need to change.
 */

// Create Redis-backed rate limiter if Upstash is configured.
const hasRedis = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// AI generation endpoints (generate-blueprint / generate-implementation /
// generate-schema / generate-api-design / generate-template / rewrite-brief)
// call paid LLM providers (Gemini / Claude / OpenAI) and had no rate limit
// at all at one point, so a single user could drive unbounded API cost.
// See [[saas_builder_ai_endpoint_no_rate_limit]] (resolved).
//
// generate-template (the full pipeline) gets its own bucket, separate from
// the per-step `generate` bucket: one pipeline run drives 4+ LLM steps via
// internal calls, so if it shared the per-step bucket, a user who had used
// e.g. generate-blueprint moments earlier could start a pipeline that dies
// with 429 halfway through — after paid LLM work has already run. Internal
// step calls made by the pipeline bypass the per-step limit via
// lib/pipeline-internal.ts, making this bucket the pipeline's sole gate.
const buckets: Record<string, RateLimitBucketConfig> = {
  login: { limit: 5, window: "60 s", prefix: "rl:login" },
  signup: { limit: 3, window: "60 s", prefix: "rl:signup" },
  generate: { limit: 5, window: "60 s", prefix: "rl:generate" },
  "generate-template": { limit: 2, window: "60 s", prefix: "rl:generate-template" },
};

/**
 * Policy when Upstash isn't configured: default is "fail-open" (in-memory
 * fallback, matching the historical behavior) to avoid changing production
 * behavior out from under existing deployments. Set
 * RATE_LIMIT_FAIL_MODE=closed to deny requests outright instead — e.g. for
 * an environment where "no rate limiting" is a worse outcome than briefly
 * rejecting requests. A startup/first-use warning is logged either way;
 * see lib/env.ts for the additional production-time CRITICAL log.
 */
const failMode: RateLimitFailMode =
  process.env.RATE_LIMIT_FAIL_MODE === "closed" ? "fail-closed" : "fail-open";

const limiter = createRateLimiter({
  buckets,
  getBucketLimiter: redis
    ? (_name, config) => createUpstashBucketLimiter(redis, config)
    : () => null,
  onUnavailable: failMode,
});

/**
 * Rate limit a request by key (e.g. `"login:203.0.113.4"`, `"generate:${userId}"`).
 * Uses Upstash Redis in production (serverless-safe) when configured.
 * Falls back to in-memory limiting (or denies, if RATE_LIMIT_FAIL_MODE=closed)
 * when it isn't — see packages/supabase-guard/README.md.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  return limiter.check(key, limit, windowMs);
}
