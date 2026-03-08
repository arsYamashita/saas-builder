import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = [
  "/dashboard",
  "/users",
  "/billing",
  "/affiliate",
  "/content",
  "/plans",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!needsAuth) {
    return NextResponse.next();
  }

  const hasSupabaseCookie =
    req.cookies.get("sb-access-token") ||
    req.cookies.get("sb-refresh-token");

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
  ],
};
