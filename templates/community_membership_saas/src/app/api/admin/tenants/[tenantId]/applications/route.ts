// GET  /api/admin/tenants/[tenantId]/applications — Guard: requireRole(admin)
// POST /api/admin/tenants/[tenantId]/applications — Guard: requireAuth (非メンバー向け)
//
// POST は admin 以外でも利用可能。申請を送信するエンドポイント。
// tenant.join_mode = 'application' のみ受付。

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // pending | approved | rejected

    let query = supabase
      .from("membership_applications")
      .select("*, users(id, email, display_name)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: applications, error } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch applications: ${error.message}`);
    }

    return Response.json({ applications: applications ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();

    const supabase = createAdminClient();

    // tenant 確認 + join_mode チェック
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, join_mode, status")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    if (tenant.status !== "active") {
      throw new GuardError(403, "Tenant is not active");
    }

    if (tenant.join_mode !== "application") {
      throw new GuardError(400, "This tenant does not accept applications");
    }

    // 既存 active membership チェック
    const { data: existingMembership } = await supabase
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantId)
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
      .eq("tenant_id", tenantId)
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
      .eq("tenant_id", tenantId);

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
        tenant_id: tenantId,
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
