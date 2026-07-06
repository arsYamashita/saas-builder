import { NextResponse } from "next/server";

export async function GET() {
  try {
    throw new Error("supabase: relation contents_v2 does not exist");
  } catch (error) {
    const err = error as Error;
    // Intentional fixture violation: forwards the raw exception message —
    // should trigger `no-error-detail-leak`.
    return NextResponse.json(
      { error: "Failed", details: err.message },
      { status: 500 }
    );
  }
}
