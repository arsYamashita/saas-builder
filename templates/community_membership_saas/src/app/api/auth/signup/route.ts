// POST /api/auth/signup
// Guard: なし (未認証ユーザーが使う)
// Audit: なし (tenant 未作成時点)
//
// フロー:
//   1. Supabase Auth でユーザー作成
//   2. users テーブルに insert
//   3. tenants テーブルに新規 tenant 作成
//   4. memberships に owner として insert
//   ※ 2〜4 で失敗した場合は auth user を削除して孤児を防ぐ
//
// 冪等性:
//   email 重複 → auth.admin.createUser が失敗 (400)
//   slug 重複 → 事前チェック + DB UNIQUE 制約 (409)

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Unauthenticated endpoint — MUST be rate limited per
    // docs/rules/06-api-rules.md, "Rate Limiting (mandatory for auth +
    // paid-API endpoints)". See [[saas_builder_security_debt_inheritance]].
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    if (!(await rateLimit(`signup:${ip}`, 3, 60_000))) {
      throw new GuardError(429, "Too many requests. Please try again later.");
    }

    const body = await req.json();
    const { email, password, displayName, tenantName, tenantSlug } = body;

    if (!email || !password || !tenantName || !tenantSlug) {
      throw new GuardError(400, "email, password, tenantName, tenantSlug are required");
    }

    const supabase = createAdminClient();

    // 1. slug 重複チェック (DB UNIQUE もあるが先に返すほうが UX 良い)
    const { data: existingTenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .maybeSingle();

    if (existingTenant) {
      throw new GuardError(409, "Tenant slug already exists");
    }

    // 2. Supabase Auth ユーザー作成
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      throw new GuardError(400, authError?.message ?? "Failed to create auth user");
    }

    const userId = authData.user.id;

    // 以降は auth user が作成済み → 失敗時は cleanup
    try {
      // 3. users テーブル
      const { error: userError } = await supabase.from("users").insert({
        id: userId,
        email,
        display_name: displayName || null,
      });

      if (userError) {
        throw new Error(`Failed to create user record: ${userError.message}`);
      }

      // 4. tenant 作成
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ name: tenantName, slug: tenantSlug })
        .select()
        .single();

      if (tenantError || !tenant) {
        throw new Error(`Failed to create tenant: ${tenantError?.message}`);
      }

      // 5. owner membership
      const { error: memberError } = await supabase.from("memberships").insert({
        tenant_id: tenant.id,
        user_id: userId,
        role: "owner",
        status: "active",
      });

      if (memberError) {
        throw new Error(`Failed to create membership: ${memberError.message}`);
      }

      return Response.json({
        user: { id: userId, email },
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
      }, { status: 201 });
    } catch (innerError) {
      // cleanup: auth user を削除して孤児を防ぐ
      await supabase.auth.admin.deleteUser(userId).catch((e) => {
        console.error(`[signup] Failed to cleanup auth user ${userId}: ${e}`);
      });
      // app DB の孤児も削除 (tenant/users は CASCADE or まだ未作成)
      // Note: PostgrestFilterBuilder is PromiseLike, not a real Promise —
      // it has no .catch()/.finally() in this @supabase/supabase-js
      // version's types (compiles under looser type defs but fails
      // `tsc`/`next build` type checking). Use try/catch instead.
      try {
        await supabase.from("users").delete().eq("id", userId);
      } catch {
        // best-effort cleanup — signup already failed, don't mask that error
      }

      throw new GuardError(
        500,
        innerError instanceof Error ? innerError.message : "Signup failed"
      );
    }
  } catch (error) {
    return handleGuardError(error);
  }
}
