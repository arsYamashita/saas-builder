/**
 * Serverless-safe rate limiting, factored out of the app so it can be
 * depended on (and unit-tested) without importing `next`, Supabase, or a
 * live Upstash connection.
 *
 * This was previously a config-only stub in this package (comments showing
 * how to wire `@upstash/ratelimit` by hand) while the real implementation
 * lived directly in `saas-builder/lib/rate-limit.ts`. That split meant
 * "installing the package" did nothing — the actual protection only
 * existed as app-local code. This module is now the real implementation;
 * `lib/rate-limit.ts` in the app is a thin config + re-export.
 *
 * Design: the app supplies bucket definitions (limit/window/prefix) and a
 * `getBucketLimiter` resolver instead of a raw Redis client. Production
 * wiring passes `createUpstashBucketLimiter(redis, cfg)`; tests inject a
 * fake `BucketLimiter` with a controllable `.limit()` — no need to mock
 * `@upstash/ratelimit` internals.
 */
import { Ratelimit } from "@upstash/ratelimit";
import type { Duration } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

export interface RateLimitBucketConfig {
  /** Requests allowed per window. */
  limit: number;
  /** Upstash sliding-window duration string, e.g. "60 s". */
  window: Duration;
  /** Upstash key prefix for this bucket (keeps buckets isolated in Redis). */
  prefix: string;
}

export interface BucketLimiter {
  limit(key: string): Promise<{ success: boolean }>;
}

/**
 * What to do when no Redis-backed limiter is available for a bucket
 * (Upstash not configured, or the key's prefix matches no configured
 * bucket):
 *
 *  - "fail-open" (default): fall back to an in-process `Map`. Preserves
 *    pre-existing dev-time behavior, but is NOT a real limit across
 *    multiple serverless instances — see
 *    [[serverless_inmemory_ratelimit]]. A warning is always logged the
 *    first time this happens.
 *  - "fail-closed": deny every request instead, so a production
 *    deployment that forgot to configure Upstash cannot silently run with
 *    no rate limiting at all.
 */
export type RateLimitFailMode = "fail-open" | "fail-closed";

export interface RateLimiterOptions {
  /** Bucket definitions keyed by bucket name (the part of the key before the first ":"). */
  buckets: Record<string, RateLimitBucketConfig>;
  /**
   * Resolves the backing limiter for a bucket, or `null` if none is
   * available. Called lazily per bucket the first time it's needed
   * (not eagerly for every configured bucket), so a bucket that's
   * never used never forces a Redis round trip / client construction.
   */
  getBucketLimiter: (
    name: string,
    config: RateLimitBucketConfig
  ) => BucketLimiter | null;
  /** @default "fail-open" */
  onUnavailable?: RateLimitFailMode;
  /** Injectable so tests can assert on the warning instead of polluting stdout. @default console */
  logger?: Pick<Console, "warn">;
}

export interface RateLimiter {
  /**
   * Rate limit a request by key. The bucket name is the part of `key`
   * before the first ":" (e.g. `"login"` in `"login:203.0.113.4"`).
   * `limit`/`windowMs` are only used for the in-memory fallback path —
   * Redis-backed buckets use the limit/window baked into their
   * `RateLimitBucketConfig`.
   */
  check(key: string, limit: number, windowMs: number): Promise<boolean>;
}

/** Builds a real Upstash-backed limiter for one bucket. Production wiring only — not used in tests. */
export function createUpstashBucketLimiter(
  redis: Redis,
  config: RateLimitBucketConfig
): BucketLimiter {
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.limit, config.window),
    prefix: config.prefix,
  });
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const {
    buckets,
    getBucketLimiter,
    onUnavailable = "fail-open",
    logger = console,
  } = options;

  const localMap = new Map<string, { count: number; resetTime: number }>();
  const limiterCache = new Map<string, BucketLimiter | null>();
  let warned = false;

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

  function warnUnavailableOnce(bucketName: string) {
    if (warned) return;
    warned = true;
    logger.warn(
      `[rate-limit] No Redis-backed limiter available for bucket "${bucketName}" — ` +
        (onUnavailable === "fail-closed"
          ? `failing closed (denying all requests) per onUnavailable="fail-closed".`
          : `falling back to in-process in-memory limiting. This is NOT effective across multiple serverless instances (each instance has its own counter) — see [[serverless_inmemory_ratelimit]]. Configure UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN, or set onUnavailable="fail-closed" to deny instead of silently under-limiting.`)
    );
  }

  return {
    async check(key, limit, windowMs) {
      const bucketName = key.split(":")[0];
      const config = buckets[bucketName];

      let limiter: BucketLimiter | null = null;
      if (config) {
        if (!limiterCache.has(bucketName)) {
          limiterCache.set(bucketName, getBucketLimiter(bucketName, config));
        }
        limiter = limiterCache.get(bucketName) ?? null;
      }

      if (limiter) {
        const { success } = await limiter.limit(key);
        return success;
      }

      warnUnavailableOnce(bucketName);
      if (onUnavailable === "fail-closed") return false;
      return localRateLimit(key, limit, windowMs);
    },
  };
}
