// GET /api/me/courses/[courseId]/progress — Guard: requireAuth

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError, GuardError } from "@/lib/guards";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const { courseId } = await params;
    const authUser = await requireAuth();

    const supabase = createAdminClient();

    // コース取得
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, tenant_id, title")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      throw new GuardError(404, "Course not found");
    }

    // コースのモジュール一覧
    const { data: modules } = await supabase
      .from("course_modules")
      .select("id")
      .eq("course_id", courseId)
      .eq("tenant_id", course.tenant_id);

    const moduleIds = modules?.map((m) => m.id) ?? [];

    if (moduleIds.length === 0) {
      return Response.json({
        course_id: courseId,
        total_lessons: 0,
        completed_lessons: 0,
        completion_percentage: 0,
      });
    }

    // 全レッスン数
    const { count: totalLessons } = await supabase
      .from("course_lessons")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", course.tenant_id)
      .in("module_id", moduleIds);

    // レッスン ID 一覧を取得
    const { data: lessons } = await supabase
      .from("course_lessons")
      .select("id")
      .eq("tenant_id", course.tenant_id)
      .in("module_id", moduleIds);

    const lessonIds = lessons?.map((l) => l.id) ?? [];

    let completedLessons = 0;

    if (lessonIds.length > 0) {
      // 完了済みレッスン数
      const { count } = await supabase
        .from("user_lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authUser.id)
        .eq("tenant_id", course.tenant_id)
        .eq("completed", true)
        .in("lesson_id", lessonIds);

      completedLessons = count ?? 0;
    }

    const total = totalLessons ?? 0;
    const percentage = total > 0 ? Math.round((completedLessons / total) * 100) : 0;

    return Response.json({
      course_id: courseId,
      total_lessons: total,
      completed_lessons: completedLessons,
      completion_percentage: percentage,
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
