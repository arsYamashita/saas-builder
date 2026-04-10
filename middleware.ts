import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rate limiter instances (lazy-initialized when env vars are present)
// TODO: Apply same pattern to aria-for-salon-app and day_care_web_app when LINE integration is added
let ratelimitApi: Ratelimit | null = null;
let ratelimitAi: Ratelimit | null = null;
let ratelimitStripe: Ratelimit | null = null;

function getRatelimiters(): { api: Ratelimit; ai: Ratelimit; stripe: Ratelimit } | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!ratelimitApi) {
    const redis = Redis.fromEnv();
    ratelimitApi = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "60 s"), prefix: "rl:api" });
    ratelimitAi = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "rl:ai" });
    // Stripe endpoints: strict limit to prevent webhook replay attacks and cost explosion
    ratelimitStripe = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:stripe" });
  }
  return { api: ratelimitApi!, ai: ratelimitAi!, stripe: ratelimitStripe! };
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
    if (limiters) {
      const isAiEndpoint =
        pathname.startsWith("/api/ai") || pathname.startsWith("/api/generate");
      const isStripeEndpoint = pathname.startsWith("/api/stripe") || pathname.startsWith("/api/webhook");
      const limiter = isAiEndpoint ? limiters.ai : isStripeEndpoint ? limiters.stripe : limiters.api;
      const identifier =
        req.ip ?? req.headers.get("x-forwarded-for") ?? "anonymous";
      const { success, limit, remaining, reset } = await limiter.limit(identifier);
      if (!success) {
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
