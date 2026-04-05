// PUT /api/admin/tenants/[tenantId]/applications/[appId] — Guard: requireRole(admin), Audit: application.review

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
  assertTenantAccess,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; appId: string }> }
) {
  try {
    const { tenantId, appId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { status } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      throw new GuardError(400, "status must be 'approved' or 'rejected'");
    }

    const supabase = createAdminClient();

    // application 取得
    const { data: application, error: fetchError } = await supabase
      .from("membership_applications")
      .select("*")
      .eq("id", appId)
      .single();

    if (fetchError || !application) {
      throw new GuardError(404, "Application not found");
    }

    assertTenantAccess(application.tenant_id, tenantId);

    if (application.status !== "pending") {
      throw new GuardError(400, "Application has already been reviewed");
    }

    // application ステータス更新
    const { data: updated, error: updateError } = await supabase
      .from("membership_applications")
      .update({
        status,
        reviewed_by: authUser.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", appId)
      .select()
      .single();

    if (updateError) {
      throw new GuardError(500, `Failed to update application: ${updateError.message}`);
    }

    // approved の場合は membership 作成
    if (status === "approved") {
      const { error: memberError } = await supabase
        .from("memberships")
        .insert({
          tenant_id: tenantId,
          user_id: application.user_id,
          role: "member",
          status: "active",
          invited_by: authUser.id,
        });

      if (memberError) {
        throw new GuardError(500, `Failed to create membership: ${memberError.message}`);
      }
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "application.review",
      resourceType: "membership_application",
      resourceId: appId,
      before: application,
      after: updated,
    });

    return Response.json({ application: updated });
  } catch (error) {
    return handleGuardError(error);
  }
}
