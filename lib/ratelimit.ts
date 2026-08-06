import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value && value.trim() !== '')
}

function hasUpstashConfigured(): boolean {
  return nonEmpty(process.env.UPSTASH_REDIS_REST_URL) && nonEmpty(process.env.UPSTASH_REDIS_REST_TOKEN)
}

// Lazily create (and cache) an Upstash-backed limiter.
//
// IMPORTANT: the returned function must not be invoked at module load —
// only from inside checkRateLimit(), on actual first use. This module is
// imported by route bundles (see app/api/projects/*/generate-*/route.ts),
// and `next build` runs with NODE_ENV=production. A previous version of
// this file called the getter eagerly at the top level
// (`export const aiRatelimit = getAiRatelimit()`), which defeated the
// laziness entirely: a truthy-but-invalid Upstash config (malformed URL,
// etc.) making `Redis.fromEnv()` / `new Ratelimit(...)` throw would crash
// at import — the exact `startup_env_validation_prod_outage` failure mode
// this design is supposed to avoid. Do not re-introduce that.
//
// Construction itself is also wrapped in try/catch so a truthy-but-broken
// config can never throw, even on first use — it degrades to "unavailable"
// (null) instead, which checkRateLimit() already handles (fail closed in
// production, pass-through with a warning in dev).
function makeLazyRatelimit(
  requests: number,
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`
): () => Ratelimit | null {
  let cached: Ratelimit | null | undefined

  return () => {
    if (cached !== undefined) return cached

    if (!hasUpstashConfigured()) {
      if (isProduction()) {
        console.error(
          '[ratelimit] Upstash Redis is not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) ' +
            'in production. checkRateLimit() will fail closed (deny) instead of silently allowing requests. ' +
            'Configure Upstash before deploying — see scripts/preflight-env.ts.'
        )
      } else {
        console.warn(
          '[ratelimit] Upstash not configured — rate limiting disabled (dev/test only, NOT for production). ' +
            'Configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN to enable it.'
        )
      }
      cached = null
      return cached
    }

    try {
      cached = new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(requests, window),
        analytics: true,
      })
    } catch (err) {
      // Config env vars were present but construction still failed
      // (malformed URL, client-side validation, etc.) — never let this
      // escape as an exception; degrade to "unavailable" like the unset
      // case above.
      if (isProduction()) {
        console.error(
          '[ratelimit] Failed to construct Upstash-backed limiter despite Upstash env vars being set; ' +
            'failing closed (deny) instead of throwing.',
          err
        )
      } else {
        console.warn(
          '[ratelimit] Failed to construct Upstash-backed limiter in development; rate limiting disabled.',
          err
        )
      }
      cached = null
    }
    return cached
  }
}

// AI生成系エンドポイント: 10req/分
const getAiRatelimit = makeLazyRatelimit(10, '60 s')

// 認証系エンドポイント: 5req/分
const getAuthRatelimit = makeLazyRatelimit(5, '60 s')

// These are THUNKS, not resolved values — do NOT call them here. Nothing
// is constructed until checkRateLimit() actually invokes one, at request
// time. Existing callers (e.g. app/api/projects/*/generate-*/route.ts)
// pass these straight through to checkRateLimit() unchanged; the exported
// binding's *type* changed (value -> getter), but the call sites didn't
// need to, since checkRateLimit() resolves either shape.
export const aiRatelimit = getAiRatelimit
export const authRatelimit = getAuthRatelimit

export type RateLimitCheck = {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

type RatelimiterOrGetter = Ratelimit | null | (() => Ratelimit | null)

/**
 * Check a rate limiter. Accepts either an already-resolved limiter
 * (`Ratelimit | null`) or a lazy getter (`() => Ratelimit | null`, as
 * exported by `aiRatelimit` / `authRatelimit` above) — the getter form is
 * resolved here, on first actual use, so construction (and any exception
 * it might throw) never happens at module import time.
 *
 * Behavior when the resolved limiter is null (Upstash not configured, or
 * construction failed):
 *   - production: FAIL CLOSED — return a deny result so callers block the
 *     request, rather than the previous silent pass-through (null was
 *     treated by callers as "no rate limiting configured, allow").
 *   - development/test: return null (pass-through, as before) and warn.
 *
 * A runtime error from Upstash itself (network/auth/outage) is handled the
 * same way: production fails closed (deny + console.error) instead of
 * letting the exception escape as an unhandled rejection / 500.
 */
export async function checkRateLimit(
  ratelimiterOrGetter: RatelimiterOrGetter,
  identifier: string,
): Promise<RateLimitCheck | null> {
  const ratelimiter =
    typeof ratelimiterOrGetter === 'function' ? ratelimiterOrGetter() : ratelimiterOrGetter

  if (!ratelimiter) {
    if (isProduction()) {
      console.error(
        `[ratelimit] checkRateLimit called with no limiter for identifier "${identifier}" in production; ` +
          'failing closed (denying request).'
      )
      return { success: false, limit: 0, remaining: 0, reset: 0 }
    }
    console.warn(
      `[ratelimit] checkRateLimit called with no limiter for identifier "${identifier}" in development; ` +
        'passing through (no rate limiting applied).'
    )
    return null
  }

  try {
    return await ratelimiter.limit(identifier)
  } catch (err) {
    if (isProduction()) {
      console.error(
        `[ratelimit] Upstash rate limit check failed for identifier "${identifier}"; failing closed (denying request).`,
        err
      )
      return { success: false, limit: 0, remaining: 0, reset: 0 }
    }
    console.warn(
      `[ratelimit] Upstash rate limit check failed for identifier "${identifier}" in development; passing through.`,
      err
    )
    return null
  }
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
