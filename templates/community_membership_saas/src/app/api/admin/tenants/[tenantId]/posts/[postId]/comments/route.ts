// GET  /api/admin/tenants/[tenantId]/posts/[postId]/comments — Guard: requireTenantMember
// POST /api/admin/tenants/[tenantId]/posts/[postId]/comments — Guard: requireTenantMember, Audit: comment.create

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; postId: string }> }
) {
  try {
    const { tenantId, postId } = await params;
    const authUser = await requireAuth();
    await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    const { data: comments, error } = await supabase
      .from("comments")
      .select(
        "*, author:users!comments_author_id_fkey(display_name, avatar_url)"
      )
      .eq("tenant_id", tenantId)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch comments: ${error.message}`);
    }

    // Build threaded structure: top-level comments with nested replies
    const topLevel = (comments ?? []).filter((c) => c.parent_id === null);
    const replies = (comments ?? []).filter((c) => c.parent_id !== null);

    const threaded = topLevel.map((comment) => ({
      ...comment,
      replies: replies.filter((r) => r.parent_id === comment.id),
    }));

    return Response.json({ comments: threaded });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; postId: string }> }
) {
  try {
    const { tenantId, postId } = await params;
    const authUser = await requireAuth();
    await requireTenantMember(authUser.id, tenantId);

    const supabase = createAdminClient();

    // Check if post exists and is not locked
    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, is_locked")
      .eq("id", postId)
      .eq("tenant_id", tenantId)
      .single();

    if (postError || !post) {
      throw new GuardError(404, "Post not found");
    }

    if (post.is_locked) {
      throw new GuardError(403, "This post is locked and does not accept new comments");
    }

    const body = await req.json();
    const { body: commentBody, parent_id } = body;

    if (!commentBody) {
      throw new GuardError(400, "body is required");
    }

    // If parent_id is provided, verify the parent comment exists on this post
    if (parent_id) {
      const { data: parent, error: parentError } = await supabase
        .from("comments")
        .select("id")
        .eq("id", parent_id)
        .eq("post_id", postId)
        .eq("tenant_id", tenantId)
        .single();

      if (parentError || !parent) {
        throw new GuardError(404, "Parent comment not found");
      }
    }

    const { data: comment, error } = await supabase
      .from("comments")
      .insert({
        tenant_id: tenantId,
        post_id: postId,
        parent_id: parent_id ?? null,
        author_id: authUser.id,
        body: commentBody,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create comment: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "comment.create",
      resourceType: "comment",
      resourceId: comment.id,
      after: comment,
    });

    return Response.json({ comment }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
