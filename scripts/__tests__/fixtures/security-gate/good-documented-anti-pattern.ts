/**
 * This doc comment intentionally *mentions* the anti-patterns this gate
 * checks for, the same way lib/api/errors.ts does — it must NOT trigger
 * any violation because it is a comment, not live code:
 *
 *   const body = await req.json().catch(() => ({}));
 *   return NextResponse.json({ error: "x", details: error.message });
 */
import { NextRequest } from "next/server";
import { parseJsonBody, serverErrorResponse } from "@/lib/api/errors";

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req);
  if (!parsed.ok) return parsed.response;

  try {
    return new Response(JSON.stringify({ ok: true, data: parsed.data }));
  } catch (error) {
    return serverErrorResponse("fixture/good", error);
  }
}
