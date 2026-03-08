import { NextRequest, NextResponse } from "next/server";

function createVisitorToken() {
  return crypto.randomUUID();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const response = NextResponse.redirect(
    new URL(
      "/signup",
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    )
  );

  response.cookies.set("affiliate_code", code, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set("visitor_token", createVisitorToken(), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
