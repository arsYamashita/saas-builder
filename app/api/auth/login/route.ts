import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/db/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      return NextResponse.json(
        { error: "Failed to login", details: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to login", details: message },
      { status: 500 }
    );
  }
}
