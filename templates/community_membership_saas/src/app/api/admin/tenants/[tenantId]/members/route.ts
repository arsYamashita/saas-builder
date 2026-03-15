// GET  /api/admin/tenants/[tenantId]/members — Guard: requireRole(admin)
// POST /api/admin/tenants/[tenantId]/members — Guard: requireRole(admin), Audit: membership.create
//
// POST は admin がメンバーを直接追加する (users テーブルに存在するユーザーのみ)。
// role escalation ガード: 自分より上の role は付与不可。
//
// v1 仕様:
//   - membership の UPDATE / DELETE API は未実装。
//   - 最後の owner 保護は未実装 (v2 で追加予定)。
//   - self-downgrade は未対応 (v2 で追加予定)。
//   - owner 作成は owner 自身のみ可能 (admin は owner を付与不可)。

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";
import { ROLE_PRIORITY } from "@/types/database";
import type { AppRole } from "@/types/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    const { data: members, error } = await supabase
      .from("memberships")
      .select("id, user_id, role, status, joined_at, invited_by, users(id, email, display_name, avatar_url)")
      .eq("tenant_id", tenantId)
      .order("joined_at", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch members: ${error.message}`);
    }

    return Response.json({ members: members ?? [] });
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
    const actor = await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { userId, role } = body;

    if (!userId) {
      throw new GuardError(400, "userId is required");
    }

    const targetRole: AppRole = role ?? "member";

    // role escalation ガード: actor の role 以上は付与不可
    if (ROLE_PRIORITY[targetRole] >= ROLE_PRIORITY[actor.role]) {
      throw new GuardError(403, "Cannot assign role equal to or higher than your own");
    }

    const supabase = createAdminClient();

    // 既存チェック
    const { data: existing } = await supabase
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      throw new GuardError(409, "User is already a member");
    }

    // users テーブル存在確認
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!user) {
      throw new GuardError(404, "User not found");
    }

    const { data: membership, error } = await supabase
      .from("memberships")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        role: targetRole,
        status: "active",
        invited_by: authUser.id,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create membership: ${error.message}`);
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
