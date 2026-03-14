// POST /api/auth/login
// Guard: なし
// Audit: なし

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      throw new GuardError(400, "email and password are required");
    }

    // signInWithPassword は anon key client で実行する必要があるが、
    // admin client には signInWithPassword がないため、
    // Supabase GoTrue REST API を直接呼ぶ
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      throw new GuardError(500, "Supabase environment variables missing");
    }

    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new GuardError(401, err.error_description || err.msg || "Invalid credentials");
    }

    const session = await res.json();

    // ユーザーの membership 情報を返す
    const supabase = createAdminClient();
    const { data: memberships } = await supabase
      .from("memberships")
      .select("id, tenant_id, role, status")
      .eq("user_id", session.user.id)
      .eq("status", "active");

    return Response.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      user: {
        id: session.user.id,
        email: session.user.email,
      },
      memberships: memberships ?? [],
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
