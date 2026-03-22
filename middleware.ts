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
    const loginUrl = new URL("/auth/login", req.url);
    return NextResponse.redirect(loginUrl);
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
  ],
};
