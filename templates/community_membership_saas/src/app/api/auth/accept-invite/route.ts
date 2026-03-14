// POST /api/auth/accept-invite
// Guard: requireAuth
// Audit: membership.create
//
// v1 仕様:
//   - invite テーブルは存在しない。tenantId を知っていれば参加可能。
//   - role は固定で "member"。昇格は admin が別途行う (v1 では未実装)。
//   - 1 user : 1 tenant の制約はアプリ層では強制しない
//     (DB の UNIQUE(tenant_id, user_id) で同一 tenant への二重参加のみ防止)。
//   - v2 で invite トークン + 有効期限 + invited_role を追加予定。
//
// フロー:
//   1. 認証ユーザーを取得
//   2. tenant 存在・active 確認
//   3. 既存 membership がないことを確認
//   4. users テーブルに upsert (初回ログイン対応)
//   5. memberships に member として insert

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError, GuardError } from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const authUser = await requireAuth();
    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      throw new GuardError(400, "tenantId is required");
    }

    const supabase = createAdminClient();

    // tenant 存在確認
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, status")
      .eq("id", tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    if (tenant.status !== "active") {
      throw new GuardError(403, "Tenant is not active");
    }

    // 既存 membership チェック
    const { data: existing } = await supabase
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (existing) {
      throw new GuardError(409, "Already a member of this tenant");
    }

    // users upsert (初回ログイン対応)
    await supabase.from("users").upsert(
      { id: authUser.id, email: authUser.email },
      { onConflict: "id" }
    );

    // membership 作成
    const { data: membership, error: memberError } = await supabase
      .from("memberships")
      .insert({
        tenant_id: tenantId,
        user_id: authUser.id,
        role: "member",
        status: "active",
      })
      .select()
      .single();

    if (memberError || !membership) {
      throw new GuardError(500, `Failed to create membership: ${memberError?.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "membership.create",
      resourceType: "membership",
      resourceId: membership.id,
      after: membership,
    });

    return Response.json({ membership }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
