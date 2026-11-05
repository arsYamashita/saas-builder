import { NextResponse } from "next/server";
import { createClient } from "@/lib/db/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      // 詳細はサーバーログにだけ残し、応答には入れない
      console.error("Logout signOut error:", error);
      return NextResponse.json(
        { ok: false, error: "ログアウトに失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      redirectTo: "/auth/login",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json(
      { error: "Failed to logout" },
      { status: 500 }
    );
  }
}
