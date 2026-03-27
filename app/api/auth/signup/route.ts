import { NextRequest, NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/db/supabase/server";
import { runSignupFlow } from "@/lib/auth/signup-flow";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!(await rateLimit(`signup:${ip}`, 3, 60_000))) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてからお試しください。" },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input = parsed.data;
    const supabase = await createClient();

    const affiliateCode = req.cookies.get("affiliate_code")?.value ?? null;
    const visitorToken = req.cookies.get("visitor_token")?.value ?? null;

    const { data: signUpData, error: signUpError } =
      await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            display_name: input.displayName,
          },
        },
      });

    if (signUpError) {
      console.error("Signup error:", signUpError.message);
      return NextResponse.json(
        { error: "Failed to sign up" },
        { status: 400 }
      );
    }

    if (!signUpData.user) {
      return NextResponse.json(
        { error: "Signup did not return user" },
        { status: 500 }
      );
    }

    await runSignupFlow({
      userId: signUpData.user.id,
      email: input.email,
      displayName: input.displayName,
      tenantName: input.tenantName,
      affiliateCode,
      visitorToken,
    });

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (signInError) {
      return NextResponse.json(
        {
          ok: true,
          needsEmailConfirmation: true,
          message: "Signup completed, but sign in requires confirmation.",
        },
        { status: 200 }
      );
    }

    const response = NextResponse.json(
      {
        ok: true,
        redirectTo: "/dashboard",
      },
      { status: 201 }
    );

    response.cookies.set("affiliate_code", "", {
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Signup unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to complete signup" },
      { status: 500 }
    );
  }
}
