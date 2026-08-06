import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// TODO: Apply same pattern to aria-for-salon-app and day_care_web_app when LINE integration is added

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

type Limiters = { api: Ratelimit; ai: Ratelimit; stripe: Ratelimit };

// Lazily construct (and cache) the Upstash-backed limiters, resolved on
// first request rather than at module import (middleware.ts is imported
// for every request bundle, and `next build` runs with
// NODE_ENV=production). Construction is wrapped in try/catch so this can
// NEVER throw — a truthy-but-invalid Upstash config previously escaped
// this function uncaught (it was called outside any try/catch in
// middleware() below), which would surface as an unhandled 500 instead of
// the intended fail-closed 503. Any construction failure now degrades to
// "unavailable" (null), which middleware()'s existing null-handling
// already fails closed on in production.
let cachedLimiters: Limiters | null | undefined;

function getRatelimiters(): Limiters | null {
  if (cachedLimiters !== undefined) return cachedLimiters;

  if (!hasUpstashConfigured()) {
    cachedLimiters = null;
    return cachedLimiters;
  }

  try {
    const redis = Redis.fromEnv();
    cachedLimiters = {
      api: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "60 s"), prefix: "rl:api" }),
      ai: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "rl:ai" }),
      // Stripe endpoints: strict limit to prevent webhook replay attacks and cost explosion
      stripe: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:stripe" }),
    };
  } catch (err) {
    if (isProduction()) {
      console.error(
        "[middleware] Failed to construct Upstash-backed rate limiters despite Upstash env vars being set; " +
          "treating as unavailable (will fail closed).",
        err
      );
    } else {
      console.warn(
        "[middleware] Failed to construct Upstash-backed rate limiters in development; treating as unavailable.",
        err
      );
    }
    cachedLimiters = null;
  }

  return cachedLimiters;
}

// 503 response used when rate limiting itself is unavailable in production
// (Upstash unset, or the Upstash `.limit()` call itself errors). Serving
// requests unmetered in that state would defeat rate limiting entirely on
// serverless (per-instance in-memory state doesn't help here, and there is
// no in-memory fallback in middleware), so we fail closed instead.
function serviceUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "Service Unavailable" },
    {
      status: 503,
      headers: {
        "Retry-After": "30",
      },
    }
  );
}

const protectedPrefixes = [
  "/dashboard",
  "/users",
  "/billing",
  "/affiliate",
  "/content",
  "/plans",
  "/projects",
  "/templates",
  "/settings",
  "/scoreboard",
  "/provider-scoreboard",
  "/api/projects",
  "/api/billing",
  "/api/generation-runs",
  "/api/domain",
  "/api/documents",
  "/api/scoreboard",
  "/api/provider-scoreboard",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rate limiting for all /api/* routes
  if (pathname.startsWith("/api/")) {
    const limiters = getRatelimiters();

    if (!limiters) {
      // Upstash not configured. In production this must NOT be a silent
      // pass-through (that would mean rate limiting is a no-op in
      // production on serverless — see KB serverless_inmemory_ratelimit).
      // Fail closed instead. In dev, keep letting requests through so
      // local development doesn't require Redis.
      if (isProduction()) {
        console.error(
          `[middleware] Rate limiting unavailable for "${pathname}" in production (Upstash not configured); ` +
            "failing closed (503). Configure UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN — " +
            "see scripts/preflight-env.ts."
        );
        return serviceUnavailableResponse();
      }
      console.warn(
        `[middleware] Rate limiting unavailable for "${pathname}" in development (Upstash not configured); ` +
          "passing through without rate limiting."
      );
    } else {
      const isAiEndpoint =
        pathname.startsWith("/api/ai") || pathname.startsWith("/api/generate");
      const isStripeEndpoint = pathname.startsWith("/api/stripe") || pathname.startsWith("/api/webhook");
      const limiter = isAiEndpoint ? limiters.ai : isStripeEndpoint ? limiters.stripe : limiters.api;
      const identifier =
        req.ip ?? req.headers.get("x-forwarded-for") ?? "anonymous";

      let result: { success: boolean; limit: number; remaining: number; reset: number } | null =
        null;
      try {
        result = await limiter.limit(identifier);
      } catch (err) {
        // Upstash itself errored (network/auth/outage). Fail closed in
        // production rather than letting the exception propagate as a 500
        // or, worse, silently continuing without rate limiting.
        if (isProduction()) {
          console.error(
            `[middleware] Upstash rate limit check failed for "${pathname}"; failing closed (503).`,
            err
          );
          return serviceUnavailableResponse();
        }
        console.warn(
          `[middleware] Upstash rate limit check failed for "${pathname}" in development; passing through.`,
          err
        );
      }

      if (result && !result.success) {
        const { limit, remaining, reset } = result;
        return NextResponse.json(
          { error: "Too Many Requests" },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": limit.toString(),
              "X-RateLimit-Remaining": remaining.toString(),
              "X-RateLimit-Reset": reset.toString(),
              "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
            },
          }
        );
      }
    }
  }

  const needsAuth = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!needsAuth) {
    return NextResponse.next();
  }

  const hasSupabaseCookie = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  if (!hasSupabaseCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/auth/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // CSRF: verify Origin for state-changing API requests
  if (pathname.startsWith("/api/") && req.method !== "GET") {
    const origin = req.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (origin && appUrl && !origin.startsWith(appUrl)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/users/:path*",
    "/billing/:path*",
    "/affiliate/:path*",
    "/content/:path*",
    "/plans/:path*",
    "/projects/:path*",
    "/templates/:path*",
    "/settings/:path*",
    "/scoreboard/:path*",
    "/provider-scoreboard/:path*",
    "/api/:path*",
  ],
};
