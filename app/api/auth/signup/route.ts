import { NextRequest, NextResponse } from "next/server";
import { signupSchema } from "@/lib/validation/auth";
import { createClient } from "@/lib/db/supabase/server";
import { runSignupFlow } from "@/lib/auth/signup-flow";
import { rateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api/errors";

/**
 * このルートは 1 リクエストの中で次を順に待つ。
 *   1. supabase.auth.signUp                                  (1 回)
 *   2. runSignupFlow                                         (最大 7 回)
 *      users upsert, 所属の確認, ensure_signup_tenant RPC,
 *      紹介コードがあれば affiliate 検索と referral の確認・作成(最大 4 回)
 *   3. supabase.auth.signInWithPassword                      (1 回)
 * 合計で最大 9 回。Supabase の応答が遅い時間帯を 1 回 7 秒と見ると、
 * 最悪で 63 秒かかる。maxDuration はこれより長い 90 秒にして、途中で
 * プラットフォームに打ち切られ「認証ユーザーだけ残る」状態になるのを避ける。
 * 値を変えるときは、この見積もりと lib/auth/__tests__/signup-flow.test.ts の
 * 遅延試験も合わせて見直すこと。
 * (Next.js はこの値を静的に読むため、リテラルで書く必要がある。デプロイ先の
 * プランの上限が 90 秒未満なら、上限に合わせて下げ、待ちの回数を減らすこと。)
 */
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!(await rateLimit(`signup:${ip}`, 3, 60_000))) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくしてからお試しください。" },
        { status: 429 }
      );
    }

    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = signupSchema.safeParse(parsedBody.data);

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
