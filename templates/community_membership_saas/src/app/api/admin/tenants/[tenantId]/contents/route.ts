// GET  /api/admin/tenants/[tenantId]/contents — Guard: requireRole(editor)
// POST /api/admin/tenants/[tenantId]/contents — Guard: requireRole(editor), Audit: content.create

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
    await requireRole(authUser.id, tenantId, "editor");

    const supabase = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status"); // draft | published | archived

    let query = supabase
      .from("contents")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: contents, error } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch contents: ${error.message}`);
    }

    return Response.json({ contents: contents ?? [] });
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
    await requireRole(authUser.id, tenantId, "editor");

    const body = await req.json();
    const {
      title,
      slug,
      body: contentBody,
      excerpt,
      cover_image_url,
      content_type,
      visibility_mode,
      price_amount,
      currency,
    } = body;

    if (!title || !slug) {
      throw new GuardError(400, "title and slug are required");
    }

    const supabase = createAdminClient();

    const { data: content, error } = await supabase
      .from("contents")
      .insert({
        tenant_id: tenantId,
        title,
        slug,
        body: contentBody ?? null,
        excerpt: excerpt ?? null,
        cover_image_url: cover_image_url ?? null,
        content_type: content_type ?? "article",
        status: "draft",
        visibility_mode: visibility_mode ?? "members_only",
        price_amount: price_amount ?? null,
        currency: currency ?? "jpy",
        created_by: authUser.id,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create content: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "content.create",
      resourceType: "content",
      resourceId: content.id,
      after: content,
    });

    return Response.json({ content }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
