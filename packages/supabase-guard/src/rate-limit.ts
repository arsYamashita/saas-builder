// Rate limiting wrapper using @upstash/ratelimit
// Install: npm install @upstash/ratelimit @upstash/redis

export interface RateLimitConfig {
  requests: number;
  window: string; // e.g. "10s", "1m"
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requests: 10,
  window: '10s',
};

/**
 * Example usage with @upstash/ratelimit:
 *
 * import { Ratelimit } from '@upstash/ratelimit';
 * import { Redis } from '@upstash/redis';
 *
 * const ratelimit = new Ratelimit({
 *   redis: Redis.fromEnv(),
 *   limiter: Ratelimit.slidingWindow(10, '10s'),
 * });
 *
 * const { success } = await ratelimit.limit(identifier);
 * if (!success) return Response.json({ error: 'Too Many Requests' }, { status: 429 });
 */
export function createRateLimitMiddleware(config: RateLimitConfig = DEFAULT_RATE_LIMIT) {
  return config;
}
