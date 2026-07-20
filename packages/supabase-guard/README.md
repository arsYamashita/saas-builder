# @saas/supabase-guard

Serverless-safe rate limiting, factored out of the app so installing the
package actually does something.

## Background

Before this package, `packages/supabase-guard/src/rate-limit.ts` was a
config-only stub — a `RateLimitConfig` type, a default config object, and a
comment showing how you'd wire `@upstash/ratelimit` by hand. The real
implementation lived entirely in `saas-builder/lib/rate-limit.ts`. Anyone
who "adopted the package" for a new project got nothing: the stub exported
no working rate limiter. See the rate-limit unification lane
(`refactor/rate-limit-unification`) for the migration.

`rate-limit.ts` in this package is now the real implementation. The app's
`lib/rate-limit.ts` is a thin config + re-export: it defines saas-builder's
buckets (`login`, `signup`, `generate`, `generate-template`) and wires a
real Upstash `Redis` client when `UPSTASH_REDIS_REST_URL` /
`UPSTASH_REDIS_REST_TOKEN` are set, then delegates to `createRateLimiter()`
here. The public `rateLimit(key, limit, windowMs)` function signature that
every route imports did not change.

## API

```ts
import {
  createRateLimiter,
  createUpstashBucketLimiter,
} from "@saas/supabase-guard/rate-limit";

const redis = /* @upstash/redis client, or null if not configured */;

const limiter = createRateLimiter({
  buckets: {
    login: { limit: 5, window: "60 s", prefix: "rl:login" },
  },
  // Resolves the backing limiter for a bucket. Return null when no
  // Redis-backed limiter is available for that bucket.
  getBucketLimiter: redis
    ? (_name, cfg) => createUpstashBucketLimiter(redis, cfg)
    : () => null,
  // Default "fail-open": falls back to an in-process Map when no limiter
  // is available. NOT effective across multiple serverless instances —
  // see [[serverless_inmemory_ratelimit]]. Set "fail-closed" to deny
  // instead of silently under-limiting.
  onUnavailable: "fail-open",
});

await limiter.check("login:203.0.113.4", 5, 60_000); // boolean
```

`getBucketLimiter` is dependency-injected on purpose: production code
passes `createUpstashBucketLimiter(redis, cfg)`, tests inject a fake
`BucketLimiter` (`{ limit: async () => ({ success }) }`). Nothing in this
package's test suite mocks `@upstash/ratelimit` or talks to a network.

## Fail-open vs. fail-closed

`onUnavailable` controls what happens when Redis isn't configured (or a
key's prefix matches no configured bucket):

- `"fail-open"` (default) — matches the pre-existing behavior: requests
  fall back to an in-process in-memory limiter. Fine for local dev and for
  a single-instance deployment; **not a real limit** once you have more
  than one serverless instance, since each instance has its own counter.
  A warning is logged the first time this path is hit.
- `"fail-closed"` — deny every request instead. Use this in an environment
  where "no rate limiting" is worse than "briefly reject requests" (e.g. a
  production deployment that forgot to set the Upstash env vars).

The warning is always logged regardless of policy — silently doing either
thing with no signal is what let the original stub go unnoticed.
