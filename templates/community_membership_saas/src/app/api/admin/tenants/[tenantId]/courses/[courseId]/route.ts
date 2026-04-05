// GET    /api/admin/tenants/[tenantId]/courses/[courseId] — Guard: requireRole(editor)
// PUT    /api/admin/tenants/[tenantId]/courses/[courseId] — Guard: requireRole(admin), Audit: course.update
// DELETE /api/admin/tenants/[tenantId]/courses/[courseId] — Guard: requireRole(admin), Audit: course.delete

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
  { params }: { params: Promise<{ tenantId: string; courseId: string }> }
) {
  try {
    const { tenantId, courseId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "editor");

    const supabase = createAdminClient();

    // コース取得
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("tenant_id", tenantId)
      .single();

    if (courseError || !course) {
      throw new GuardError(404, "Course not found");
    }

    // モジュール数とレッスン数を取得
    const { count: modulesCount } = await supabase
      .from("course_modules")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("tenant_id", tenantId);

    const { count: lessonsCount } = await supabase
      .from("course_lessons")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in(
        "module_id",
        (
          await supabase
            .from("course_modules")
            .select("id")
            .eq("course_id", courseId)
            .eq("tenant_id", tenantId)
        ).data?.map((m) => m.id) ?? []
      );

    return Response.json({
      course: {
        ...course,
        modules_count: modulesCount ?? 0,
        lessons_count: lessonsCount ?? 0,
      },
    });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string; courseId: string }> }
) {
  try {
    const { tenantId, courseId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存コース取得 (before)
    const { data: before, error: fetchError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !before) {
      throw new GuardError(404, "Course not found");
    }

    const body = await req.json();
    const {
      title,
      slug,
      description,
      cover_image_url,
      status,
      visibility_mode,
      sort_order,
    } = body;

    const { data: course, error } = await supabase
      .from("courses")
      .update({
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(description !== undefined && { description }),
        ...(cover_image_url !== undefined && { cover_image_url }),
        ...(status !== undefined && { status }),
        ...(visibility_mode !== undefined && { visibility_mode }),
        ...(sort_order !== undefined && { sort_order }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", courseId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to update course: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "course.update",
      resourceType: "course",
      resourceId: courseId,
      before,
      after: course,
    });

    return Response.json({ course });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; courseId: string }> }
) {
  try {
    const { tenantId, courseId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存コース取得 (before)
    const { data: before, error: fetchError } = await supabase
      .from("courses")
      .select("*")
      .eq("id", courseId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !before) {
      throw new GuardError(404, "Course not found");
    }

    // CASCADE: レッスン → モジュール → コース の順に削除
    // モジュール ID 一覧を取得
    const { data: modules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", courseId)
      .eq("tenant_id", tenantId);

    const moduleIds = modules?.map((m) => m.id) ?? [];

    // レッスン削除
    if (moduleIds.length > 0) {
      await supabase
        .from("course_lessons")
        .delete()
        .eq("tenant_id", tenantId)
        .in("module_id", moduleIds);
    }

    // モジュール削除
    await supabase
      .from("course_modules")
      .delete()
      .eq("course_id", courseId)
      .eq("tenant_id", tenantId);

    // コースアクセスルール削除
    await supabase
      .from("course_access_rules")
      .delete()
      .eq("course_id", courseId)
      .eq("tenant_id", tenantId);

    // コース削除
    const { error } = await supabase
      .from("courses")
      .delete()
      .eq("id", courseId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new GuardError(500, `Failed to delete course: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "course.delete",
      resourceType: "course",
      resourceId: courseId,
      before,
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
