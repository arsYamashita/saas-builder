import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Upstash Redis が設定されている場合のみ実際のレート制限を適用
function createRatelimit(requests: number, window: `${number} ${'s' | 'm' | 'h' | 'd'}`) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(requests, window),
    analytics: true,
  })
}

// AI生成系エンドポイント: 10req/分
export const aiRatelimit = createRatelimit(10, '60 s')

// 認証系エンドポイント: 5req/分
export const authRatelimit = createRatelimit(5, '60 s')

export async function checkRateLimit(
  ratelimiter: Ratelimit | null,
  identifier: string,
): Promise<{ success: boolean; limit: number; remaining: number; reset: number } | null> {
  if (!ratelimiter) return null
  return ratelimiter.limit(identifier)
}

export function getIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'anonymous'
}

export function rateLimitResponse(limit: number, remaining: number, reset: number): Response {
  return new Response(JSON.stringify({ error: 'Too Many Requests' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': reset.toString(),
    },
  })
}
