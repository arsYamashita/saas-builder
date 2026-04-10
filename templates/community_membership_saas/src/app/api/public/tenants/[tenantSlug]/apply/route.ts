// GET  /api/public/tenants/[tenantSlug]/apply — Guard: なし (公開)
// POST /api/public/tenants/[tenantSlug]/apply — Guard: requireAuth
//
// 公開面の申請フォーム取得 + 申請送信。
// slug から tenant を解決し、admin applications POST と同等の処理を実行。

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError, GuardError } from "@/lib/guards";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const supabase = createAdminClient();

    // tenant を slug で検索
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, join_mode, status")
      .eq("slug", tenantSlug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    // questions 取得
    const { data: questions, error: questionsError } = await supabase
      .from("membership_questions")
      .select("id, question_text, is_required, sort_order")
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true });

    if (questionsError) {
      throw new GuardError(500, `Failed to fetch questions: ${questionsError.message}`);
    }

    return Response.json({
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        join_mode: tenant.join_mode,
      },
      questions: questions ?? [],
    });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const authUser = await requireAuth();

    const supabase = createAdminClient();

    // tenant を slug で検索
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, join_mode, status")
      .eq("slug", tenantSlug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    if (tenant.join_mode !== "application") {
      throw new GuardError(400, "This tenant does not accept applications");
    }

    // 既存 active membership チェック
    const { data: existingMembership } = await supabase
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", authUser.id)
      .eq("status", "active")
      .maybeSingle();

    if (existingMembership) {
      throw new GuardError(409, "Already a member of this tenant");
    }

    // 既存 pending application チェック
    const { data: existingApp } = await supabase
      .from("membership_applications")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", authUser.id)
      .eq("status", "pending")
      .maybeSingle();

    if (existingApp) {
      throw new GuardError(409, "Application already pending");
    }

    const body = await req.json();
    const { answers } = body;

    if (!Array.isArray(answers)) {
      throw new GuardError(400, "answers must be an array");
    }

    // required questions の検証
    const { data: questions } = await supabase
      .from("membership_questions")
      .select("id, is_required")
      .eq("tenant_id", tenant.id);

    const requiredIds = (questions ?? [])
      .filter((q) => q.is_required)
      .map((q) => q.id);

    const answeredIds = answers.map(
      (a: { question_id: string }) => a.question_id
    );

    for (const reqId of requiredIds) {
      if (!answeredIds.includes(reqId)) {
        throw new GuardError(400, `Required question ${reqId} is not answered`);
      }
    }

    // users upsert (初回ログイン対応)
    await supabase.from("users").upsert(
      { id: authUser.id, email: authUser.email },
      { onConflict: "id" }
    );

    const { data: application, error } = await supabase
      .from("membership_applications")
      .insert({
        tenant_id: tenant.id,
        user_id: authUser.id,
        status: "pending",
        answers,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create application: ${error.message}`);
    }

    return Response.json({ application }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
