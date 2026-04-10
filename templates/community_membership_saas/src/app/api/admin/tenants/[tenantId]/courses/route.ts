// GET  /api/admin/tenants/[tenantId]/courses — Guard: requireRole(editor)
// POST /api/admin/tenants/[tenantId]/courses — Guard: requireRole(admin), Audit: course.create

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
      .from("courses")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: courses, error } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch courses: ${error.message}`);
    }

    return Response.json({ courses: courses ?? [] });
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
    await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const {
      title,
      slug,
      description,
      cover_image_url,
      visibility_mode,
      sort_order,
    } = body;

    if (!title || !slug) {
      throw new GuardError(400, "title and slug are required");
    }

    const supabase = createAdminClient();

    const { data: course, error } = await supabase
      .from("courses")
      .insert({
        tenant_id: tenantId,
        title,
        slug,
        description: description ?? null,
        cover_image_url: cover_image_url ?? null,
        status: "draft",
        visibility_mode: visibility_mode ?? "members_only",
        sort_order: sort_order ?? 0,
        created_by: authUser.id,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create course: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "course.create",
      resourceType: "course",
      resourceId: course.id,
      after: course,
    });

    return Response.json({ course }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
