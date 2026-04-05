// GET  /api/admin/tenants/[tenantId]/courses/[courseId]/modules — Guard: requireRole(editor)
// POST /api/admin/tenants/[tenantId]/courses/[courseId]/modules — Guard: requireRole(admin), Audit: module.create

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ tenantId: string; courseId: string }> }
) {
  try {
    const { tenantId, courseId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "editor");

    const supabase = createAdminClient();

    // コースの存在確認
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("tenant_id", tenantId)
      .single();

    if (courseError || !course) {
      throw new GuardError(404, "Course not found");
    }

    // モジュール一覧 + 各モジュールのレッスン数
    const { data: modules, error } = await supabase
      .from("course_modules")
      .select("*")
      .eq("course_id", courseId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch modules: ${error.message}`);
    }

    // 各モジュールのレッスン数を取得
    const modulesWithCount = await Promise.all(
      (modules ?? []).map(async (mod) => {
        const { count } = await supabase
          .from("course_lessons")
          .select("id", { count: "exact", head: true })
          .eq("module_id", mod.id)
          .eq("tenant_id", tenantId);

        return { ...mod, lessons_count: count ?? 0 };
      })
    );

    return Response.json({ modules: modulesWithCount });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  {
    params,
  }: { params: Promise<{ tenantId: string; courseId: string }> }
) {
  try {
    const { tenantId, courseId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // コースの存在確認
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("tenant_id", tenantId)
      .single();

    if (courseError || !course) {
      throw new GuardError(404, "Course not found");
    }

    const body = await req.json();
    const { title, description, sort_order } = body;

    if (!title) {
      throw new GuardError(400, "title is required");
    }

    const { data: mod, error } = await supabase
      .from("course_modules")
      .insert({
        course_id: courseId,
        tenant_id: tenantId,
        title,
        description: description ?? null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create module: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "module.create",
      resourceType: "course_module",
      resourceId: mod.id,
      after: mod,
    });

    return Response.json({ module: mod }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
