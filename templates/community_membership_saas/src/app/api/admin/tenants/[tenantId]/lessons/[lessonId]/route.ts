// PUT    /api/admin/tenants/[tenantId]/lessons/[lessonId] — Guard: requireRole(admin), Audit: lesson.update
// DELETE /api/admin/tenants/[tenantId]/lessons/[lessonId] — Guard: requireRole(admin), Audit: lesson.delete

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
  { params }: { params: Promise<{ tenantId: string; lessonId: string }> }
) {
  try {
    const { tenantId, lessonId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存レッスン取得 (before)
    const { data: before, error: fetchError } = await supabase
      .from("course_lessons")
      .select("*")
      .eq("id", lessonId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !before) {
      throw new GuardError(404, "Lesson not found");
    }

    const body = await req.json();
    const {
      title,
      slug,
      body: lessonBody,
      video_url,
      video_duration_seconds,
      transcript,
      sort_order,
      is_preview,
      drip_days,
      unlock_level,
    } = body;

    const { data: lesson, error } = await supabase
      .from("course_lessons")
      .update({
        ...(title !== undefined && { title }),
        ...(slug !== undefined && { slug }),
        ...(lessonBody !== undefined && { body: lessonBody }),
        ...(video_url !== undefined && { video_url }),
        ...(video_duration_seconds !== undefined && { video_duration_seconds }),
        ...(transcript !== undefined && { transcript }),
        ...(sort_order !== undefined && { sort_order }),
        ...(is_preview !== undefined && { is_preview }),
        ...(drip_days !== undefined && { drip_days }),
        ...(unlock_level !== undefined && { unlock_level }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", lessonId)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to update lesson: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "lesson.update",
      resourceType: "course_lesson",
      resourceId: lessonId,
      before,
      after: lesson,
    });

    return Response.json({ lesson });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; lessonId: string }> }
) {
  try {
    const { tenantId, lessonId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    // 既存レッスン取得 (before)
    const { data: before, error: fetchError } = await supabase
      .from("course_lessons")
      .select("*")
      .eq("id", lessonId)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchError || !before) {
      throw new GuardError(404, "Lesson not found");
    }

    // 進捗データも削除
    await supabase
      .from("user_lesson_progress")
      .delete()
      .eq("lesson_id", lessonId)
      .eq("tenant_id", tenantId);

    const { error } = await supabase
      .from("course_lessons")
      .delete()
      .eq("id", lessonId)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new GuardError(500, `Failed to delete lesson: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "lesson.delete",
      resourceType: "course_lesson",
      resourceId: lessonId,
      before,
    });

    return Response.json({ success: true });
  } catch (error) {
    return handleGuardError(error);
  }
}
