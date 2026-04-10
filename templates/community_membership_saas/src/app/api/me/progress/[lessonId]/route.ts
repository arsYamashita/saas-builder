// GET  /api/me/progress/[lessonId] — Guard: requireAuth
// POST /api/me/progress/[lessonId] — Guard: requireAuth (upsert)

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError, GuardError } from "@/lib/guards";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const authUser = await requireAuth();

    const supabase = createAdminClient();

    // レッスンの存在確認 + tenant_id 取得
    const { data: lesson, error: lessonError } = await supabase
      .from("course_lessons")
      .select("id, tenant_id")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      throw new GuardError(404, "Lesson not found");
    }

    const { data: progress } = await supabase
      .from("user_lesson_progress")
      .select("completed, completed_at, last_position_seconds")
      .eq("lesson_id", lessonId)
      .eq("user_id", authUser.id)
      .eq("tenant_id", lesson.tenant_id)
      .maybeSingle();

    return Response.json({ progress: progress ?? null });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params;
    const authUser = await requireAuth();

    const supabase = createAdminClient();

    // レッスンの存在確認 + tenant_id 取得
    const { data: lesson, error: lessonError } = await supabase
      .from("course_lessons")
      .select("id, tenant_id")
      .eq("id", lessonId)
      .single();

    if (lessonError || !lesson) {
      throw new GuardError(404, "Lesson not found");
    }

    const body = await req.json();
    const { completed, last_position_seconds } = body;

    // 既存の progress を取得
    const { data: existing } = await supabase
      .from("user_lesson_progress")
      .select("id, completed")
      .eq("lesson_id", lessonId)
      .eq("user_id", authUser.id)
      .eq("tenant_id", lesson.tenant_id)
      .maybeSingle();

    const now = new Date().toISOString();

    // completed_at: completed=true かつ以前は未完了の場合のみ設定
    const shouldSetCompletedAt =
      completed === true && (!existing || !existing.completed);

    if (existing) {
      // UPDATE
      const { data: progress, error } = await supabase
        .from("user_lesson_progress")
        .update({
          ...(completed !== undefined && { completed }),
          ...(last_position_seconds !== undefined && { last_position_seconds }),
          ...(shouldSetCompletedAt && { completed_at: now }),
          updated_at: now,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        throw new GuardError(
          500,
          `Failed to update progress: ${error.message}`
        );
      }

      return Response.json({ progress });
    } else {
      // INSERT
      const { data: progress, error } = await supabase
        .from("user_lesson_progress")
        .insert({
          tenant_id: lesson.tenant_id,
          user_id: authUser.id,
          lesson_id: lessonId,
          completed: completed ?? false,
          completed_at: completed === true ? now : null,
          last_position_seconds: last_position_seconds ?? null,
        })
        .select()
        .single();

      if (error) {
        throw new GuardError(
          500,
          `Failed to create progress: ${error.message}`
        );
      }

      return Response.json({ progress }, { status: 201 });
    }
  } catch (error) {
    return handleGuardError(error);
  }
}
