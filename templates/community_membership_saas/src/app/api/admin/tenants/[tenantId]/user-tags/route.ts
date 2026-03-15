// POST /api/admin/tenants/[tenantId]/user-tags
// Guard: requireRole(admin)
// Audit: user_tag.assign / user_tag.remove
//
// body: { userId, tagId, action: "assign" | "remove" }

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { userId, tagId, action } = body;

    if (!userId || !tagId || !action) {
      throw new GuardError(400, "userId, tagId, and action are required");
    }

    if (action !== "assign" && action !== "remove") {
      throw new GuardError(400, "action must be 'assign' or 'remove'");
    }

    const supabase = createAdminClient();

    if (action === "assign") {
      // 重複チェック
      const { data: existing } = await supabase
        .from("user_tags")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", userId)
        .eq("tag_id", tagId)
        .maybeSingle();

      if (existing) {
        throw new GuardError(409, "Tag already assigned to user");
      }

      const { data: userTag, error } = await supabase
        .from("user_tags")
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          tag_id: tagId,
          assigned_by: authUser.id,
        })
        .select()
        .single();

      if (error) {
        throw new GuardError(500, `Failed to assign tag: ${error.message}`);
      }

      await writeAuditLog({
        tenantId,
        actorUserId: authUser.id,
        action: "user_tag.assign",
        resourceType: "user_tag",
        resourceId: userTag.id,
        after: userTag,
      });

      return Response.json({ userTag }, { status: 201 });
    }

    // action === "remove"
    const { data: deleted, error } = await supabase
      .from("user_tags")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("tag_id", tagId)
      .select()
      .single();

    if (error) {
      throw new GuardError(404, "User tag not found");
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "user_tag.remove",
      resourceType: "user_tag",
      resourceId: deleted.id,
      before: deleted,
    });

    return Response.json({ deleted: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
