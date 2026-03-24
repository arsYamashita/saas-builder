import { NextRequest, NextResponse } from "next/server";

function createVisitorToken() {
  return crypto.randomUUID();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // Input validation: alphanumeric, dash, underscore, max 50 chars
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(code)) {
    return NextResponse.json(
      { error: "Invalid affiliate code" },
      { status: 400 }
    );
  }

  const isProduction = process.env.NODE_ENV === "production";

  const response = NextResponse.redirect(
    new URL(
      "/signup",
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    )
  );

  response.cookies.set("affiliate_code", code, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set("visitor_token", createVisitorToken(), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
