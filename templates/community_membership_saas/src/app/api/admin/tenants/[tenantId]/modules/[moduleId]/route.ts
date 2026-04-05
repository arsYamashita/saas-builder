// PUT    /api/admin/tenants/[tenantId]/modules/[moduleId] — Guard: requireRole(admin), Audit: module.update
// DELETE /api/admin/tenants/[tenantId]/modules/[moduleId] — Guard: requireRole(admin), Audit: module.delete

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; moduleId: string }> }
) {
  try {
    const { tenantId, moduleId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存モジュール取得 (before)
    const { data: before, error: fetchError } = await supabase
      .from("course_modules")
      .select("*")
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !before) {
      throw new GuardError(404, "Module not found");
    }

    const body = await req.json();
    const { title, description, sort_order } = body;

    const { data: mod, error } = await supabase
      .from("course_modules")
      .update({
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(sort_order !== undefined && { sort_order }),
      })
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to update module: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "module.update",
      resourceType: "course_module",
      resourceId: moduleId,
      before,
      after: mod,
    });

    return Response.json({ module: mod });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; moduleId: string }> }
) {
  try {
    const { tenantId, moduleId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存モジュール取得 (before)
    const { data: before, error: fetchError } = await supabase
      .from("course_modules")
      .select("*")
      .eq("id", moduleId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !before) {
      throw new GuardError(404, "Module not found");
    }

    // CASCADE: レッスン削除 → モジュール削除
    await supabase
      .from("course_lessons")
      .delete()
      .eq("module_id", moduleId)
      .eq("tenant_id", tenantId);

    const { error } = await supabase
      .from("course_modules")
      .delete()
      .eq("id", moduleId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new GuardError(500, `Failed to delete module: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "module.delete",
      resourceType: "course_module",
      resourceId: moduleId,
      before,
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
