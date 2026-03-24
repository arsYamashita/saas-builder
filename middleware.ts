import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
    "/api/projects/:path*",
    "/api/billing/:path*",
    "/api/generation-runs/:path*",
    "/api/domain/:path*",
    "/api/documents/:path*",
    "/api/scoreboard/:path*",
    "/api/provider-scoreboard/:path*",
  ],
};
