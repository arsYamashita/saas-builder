import { NextRequest, NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/db/supabase/server";
import { runSignupFlow } from "@/lib/auth/signup-flow";

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json(
        { error: "Failed to sign up", details: signUpError.message },
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
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to complete signup", details: message },
      { status: 500 }
    );
  }
}
