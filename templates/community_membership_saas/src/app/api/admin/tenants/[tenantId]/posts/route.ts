// GET  /api/admin/tenants/[tenantId]/posts — Guard: requireRole(member)
// POST /api/admin/tenants/[tenantId]/posts — Guard: requireRole(member), Audit: post.create

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "member");

    const supabase = createAdminClient();
    const url = new URL(req.url);
    const categoryId = url.searchParams.get("category_id");
    const status = url.searchParams.get("status"); // draft | published
    const pinned = url.searchParams.get("pinned"); // true | false

    let query = supabase
      .from("posts")
      .select(
        "*, author:users!posts_author_id_fkey(display_name, avatar_url)"
      )
      .eq("tenant_id", tenantId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (status) {
      if (status === "published") {
        query = query.not("published_at", "is", null);
      } else if (status === "draft") {
        query = query.is("published_at", null);
      }
    }

    if (pinned === "true") {
      query = query.eq("is_pinned", true);
    } else if (pinned === "false") {
      query = query.eq("is_pinned", false);
    }

    const { data: posts, error } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch posts: ${error.message}`);
    }

    return Response.json({ posts: posts ?? [] });
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
    await requireRole(authUser.id, tenantId, "member");

    const body = await req.json();
    const { category_id, title, body: postBody } = body;

    if (!category_id || !title) {
      throw new GuardError(400, "category_id and title are required");
    }

    const supabase = createAdminClient();

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        tenant_id: tenantId,
        category_id,
        author_id: authUser.id,
        title,
        body: postBody ?? {},
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create post: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "post.create",
      resourceType: "post",
      resourceId: post.id,
      after: post,
    });

    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
