// PUT    /api/admin/tenants/[tenantId]/members/[memberId] — Guard: requireRole(admin), Audit: membership.update
// DELETE /api/admin/tenants/[tenantId]/members/[memberId] — Guard: requireRole(admin), Audit: membership.delete
//
// v2 仕様:
//   - role 変更: 自分より上の role は付与不可。owner の role は変更不可。
//   - 削除: status='inactive' にする。自分自身と owner は削除不可。

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
  assertTenantAccess,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";
import { ROLE_PRIORITY } from "@/types/database";
import type { AppRole } from "@/types/database";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; memberId: string }> }
) {
  try {
    const { tenantId, memberId } = await params;
    const authUser = await requireAuth();
    const actor = await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { role } = body;

    if (!role) {
      throw new GuardError(400, "role is required");
    }

    const targetRole = role as AppRole;

    const supabase = createAdminClient();

    // 対象 membership 取得
    const { data: membership, error: fetchError } = await supabase
      .from("memberships")
      .select("*")
      .eq("id", memberId)
      .single();

    if (fetchError || !membership) {
      throw new GuardError(404, "Member not found");
    }

    assertTenantAccess(membership.tenant_id, tenantId);

    // owner の role は変更不可
    if (membership.role === "owner") {
      throw new GuardError(403, "Cannot change owner role");
    }

    // role escalation ガード: actor の role 以上は付与不可
    if (ROLE_PRIORITY[targetRole] >= ROLE_PRIORITY[actor.role]) {
      throw new GuardError(403, "Cannot assign role equal to or higher than your own");
    }

    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({ role: targetRole })
      .eq("id", memberId)
      .select()
      .single();

    if (updateError) {
      throw new GuardError(500, `Failed to update membership: ${updateError.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "membership.update",
      resourceType: "membership",
      resourceId: memberId,
      before: membership,
      after: updated,
    });

    return Response.json({ membership: updated });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; memberId: string }> }
) {
  try {
    const { tenantId, memberId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 対象 membership 取得
    const { data: membership, error: fetchError } = await supabase
      .from("memberships")
      .select("*")
      .eq("id", memberId)
      .single();

    if (fetchError || !membership) {
      throw new GuardError(404, "Member not found");
    }

    assertTenantAccess(membership.tenant_id, tenantId);

    // 自分自身は削除不可
    if (membership.user_id === authUser.id) {
      throw new GuardError(403, "Cannot remove yourself");
    }

    // owner は削除不可
    if (membership.role === "owner") {
      throw new GuardError(403, "Cannot remove owner");
    }

    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({ status: "inactive" })
      .eq("id", memberId)
      .select()
      .single();

    if (updateError) {
      throw new GuardError(500, `Failed to remove member: ${updateError.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "membership.delete",
      resourceType: "membership",
      resourceId: memberId,
      before: membership,
      after: updated,
    });

    return Response.json({ membership: updated });
  } catch (error) {
    return handleGuardError(error);
  }
}
