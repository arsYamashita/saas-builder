// PUT    /api/admin/tenants/[tenantId]/comments/[commentId] — Guard: requireTenantMember (own or admin), Audit: comment.update
// DELETE /api/admin/tenants/[tenantId]/comments/[commentId] — Guard: requireTenantMember (own or admin), Audit: comment.delete

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";
import { ROLE_PRIORITY } from "@/types/database";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; commentId: string }> }
) {
  try {
    const { tenantId, commentId } = await params;
    const authUser = await requireAuth();
    const member = await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    // Fetch existing comment
    const { data: existing, error: fetchError } = await supabase
      .from("comments")
      .select("*")
      .eq("id", commentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !existing) {
      throw new GuardError(404, "Comment not found");
    }

    const isAdmin = ROLE_PRIORITY[member.role] >= ROLE_PRIORITY["admin"];
    const isOwner = existing.author_id === authUser.id;

    if (!isAdmin && !isOwner) {
      throw new GuardError(403, "You can only edit your own comments");
    }

    const body = await req.json();
    const { body: commentBody } = body;

    if (!commentBody) {
      throw new GuardError(400, "body is required");
    }

    const { data: comment, error } = await supabase
      .from("comments")
      .update({
        body: commentBody,
        updated_at: new Date().toISOString(),
      })
      .eq("id", commentId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to update comment: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "comment.update",
      resourceType: "comment",
      resourceId: commentId,
      before: existing,
      after: comment,
    });

    return Response.json({ comment });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; commentId: string }> }
) {
  try {
    const { tenantId, commentId } = await params;
    const authUser = await requireAuth();
    const member = await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    // Fetch existing comment
    const { data: existing, error: fetchError } = await supabase
      .from("comments")
      .select("*")
      .eq("id", commentId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !existing) {
      throw new GuardError(404, "Comment not found");
    }

    const isAdmin = ROLE_PRIORITY[member.role] >= ROLE_PRIORITY["admin"];
    const isOwner = existing.author_id === authUser.id;

    if (!isAdmin && !isOwner) {
      throw new GuardError(403, "You can only delete your own comments");
    }

    const { error } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new GuardError(500, `Failed to delete comment: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "comment.delete",
      resourceType: "comment",
      resourceId: commentId,
      before: existing,
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
