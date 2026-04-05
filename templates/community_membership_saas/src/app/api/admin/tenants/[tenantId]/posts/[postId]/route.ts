// GET    /api/admin/tenants/[tenantId]/posts/[postId] — Guard: requireTenantMember
// PUT    /api/admin/tenants/[tenantId]/posts/[postId] — Guard: requireRole(member) own / admin any, Audit: post.update
// DELETE /api/admin/tenants/[tenantId]/posts/[postId] — Guard: requireRole(admin), Audit: post.delete

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";
import { ROLE_PRIORITY } from "@/types/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; postId: string }> }
) {
  try {
    const { tenantId, postId } = await params;
    const authUser = await requireAuth();
    await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    const { data: post, error } = await supabase
      .from("posts")
      .select(
        "*, author:users!posts_author_id_fkey(display_name, avatar_url), category:categories!posts_category_id_fkey(id, name, slug, emoji)"
      )
      .eq("id", postId)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !post) {
      throw new GuardError(404, "Post not found");
    }

    return Response.json({ post });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; postId: string }> }
) {
  try {
    const { tenantId, postId } = await params;
    const authUser = await requireAuth();
    const member = await requireRole(authUser.id, tenantId, "member");

    const supabase = createAdminClient();

    // Fetch existing post
    const { data: existing, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !existing) {
      throw new GuardError(404, "Post not found");
    }

    const isAdmin = ROLE_PRIORITY[member.role] >= ROLE_PRIORITY["admin"];
    const isOwner = existing.author_id === authUser.id;

    if (!isAdmin && !isOwner) {
      throw new GuardError(403, "You can only edit your own posts");
    }

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.body !== undefined) updates.body = body.body;
    if (body.category_id !== undefined) updates.category_id = body.category_id;

    // Admin-only fields
    if (isAdmin) {
      if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
      if (body.is_locked !== undefined) updates.is_locked = body.is_locked;
    }

    updates.updated_at = new Date().toISOString();

    const { data: post, error } = await supabase
      .from("posts")
      .update(updates)
      .eq("id", postId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to update post: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "post.update",
      resourceType: "post",
      resourceId: postId,
      before: existing,
      after: post,
    });

    return Response.json({ post });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; postId: string }> }
) {
  try {
    const { tenantId, postId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    const { data: existing, error: fetchError } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !existing) {
      throw new GuardError(404, "Post not found");
    }

    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new GuardError(500, `Failed to delete post: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "post.delete",
      resourceType: "post",
      resourceId: postId,
      before: existing,
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
