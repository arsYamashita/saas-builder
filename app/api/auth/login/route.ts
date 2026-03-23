import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/db/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!rateLimit(`login:${ip}`, 5, 60_000)) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてからお試しください。" },
        { status: 429 }
      );
    }

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
      console.error("Login error:", error.message);
      return NextResponse.json(
        { error: "Failed to login" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    console.error("Login unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to login" },
      { status: 500 }
    );
  }
}
