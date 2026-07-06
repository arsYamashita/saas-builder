import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Intentional fixture violation: swallows a malformed body into `{}`
  // instead of using parseJsonBody() — should trigger `no-silent-catch`.
  const body = await req.json().catch(() => ({}));

  return NextResponse.json({ ok: true, body });
}
