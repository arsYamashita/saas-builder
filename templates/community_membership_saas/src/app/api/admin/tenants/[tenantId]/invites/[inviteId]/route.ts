// DELETE /api/admin/tenants/[tenantId]/invites/[inviteId] — Guard: requireRole(admin), Audit: invite.delete

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
  assertTenantAccess,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; inviteId: string }> }
) {
  try {
    const { tenantId, inviteId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存チェック
    const { data: invite, error: fetchError } = await supabase
      .from("invites")
      .select("*")
      .eq("id", inviteId)
      .single();

    if (fetchError || !invite) {
      throw new GuardError(404, "Invite not found");
    }

    assertTenantAccess(invite.tenant_id, tenantId);

    const { error } = await supabase
      .from("invites")
      .delete()
      .eq("id", inviteId);

    if (error) {
      throw new GuardError(500, `Failed to delete invite: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "invite.delete",
      resourceType: "invite",
      resourceId: inviteId,
      before: invite,
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
