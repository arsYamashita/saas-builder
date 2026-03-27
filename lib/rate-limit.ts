import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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

// Create Redis-backed rate limiter if Upstash is configured
const hasRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const loginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      prefix: "rl:login",
    })
  : null;

const signupLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, "60 s"),
      prefix: "rl:signup",
    })
  : null;

const limiterMap: Record<string, Ratelimit | null> = {
  login: loginLimiter,
  signup: signupLimiter,
};

/**
 * Rate limit a request by key.
 * Uses Upstash Redis in production (serverless-safe).
 * Falls back to in-memory Map for local development.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  // Extract prefix for limiter lookup (e.g., "login" from "login:192.168.1.1")
  const prefix = key.split(":")[0];
  const limiter = limiterMap[prefix];

  if (limiter) {
    const { success } = await limiter.limit(key);
    return success;
  }

  // Fallback: in-memory (dev only)
  return localRateLimit(key, limit, windowMs);
}
