import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({
      ok: true,
      redirectTo: "/auth/login",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to logout", details: message },
      { status: 500 }
    );
  }
}
