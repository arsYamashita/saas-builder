// GET /api/public/tenants/[tenantSlug]/courses/[courseSlug]
// Guard: なし (公開) / checkCourseAccess + checkLessonAccess
// Audit: なし
//
// 公開面のコース詳細。
// checkCourseAccess で visibility_mode + rules を評価。
// 各レッスンの is_preview を参照し、ロック済みレッスンは body/video を除外。

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";
import { checkCourseAccess, checkLessonAccess } from "@/lib/course-access";
import { createClient } from "@/lib/db/supabase/server";
import type { AppRole } from "@/types/database";

export async function GET(
  _req: Request,
  {
    params,
  }: { params: Promise<{ tenantSlug: string; courseSlug: string }> }
) {
  try {
    const { tenantSlug, courseSlug } = await params;
    const supabase = createAdminClient();

    // tenant を slug で検索
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    // コース取得 — 公開面では published のみ
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("slug", courseSlug)
      .eq("status", "published")
      .single();

    if (courseError || !course) {
      throw new GuardError(404, "Course not found");
    }

    // 認証情報取得
    let userId: string | null = null;
    let userRole: AppRole | null = null;
    let membershipStatus: string | null = null;
    let membershipJoinedAt: string | null = null;

    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: membership } = await supabase
          .from("memberships")
          .select("role, status, joined_at")
          .eq("tenant_id", tenant.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (membership) {
          userRole = membership.role as AppRole;
          membershipStatus = membership.status;
          membershipJoinedAt = membership.joined_at;
        }
      }
    } catch {
      // 未認証は無視
    }

    // コースアクセス判定
    const courseAccess = await checkCourseAccess({
      courseId: course.id,
      tenantId: tenant.id,
      userId,
      userRole,
      membershipStatus,
    });

    // モジュール + レッスン構造を取得
    const { data: modules } = await supabase
      .from("course_modules")
      .select("*")
      .eq("course_id", course.id)
      .eq("tenant_id", tenant.id)
      .order("sort_order", { ascending: true });

    const moduleIds = modules?.map((m) => m.id) ?? [];

    let lessons: Record<string, unknown>[] = [];
    if (moduleIds.length > 0) {
      const { data: rawLessons } = await supabase
        .from("course_lessons")
        .select("*")
        .eq("tenant_id", tenant.id)
        .in("module_id", moduleIds)
        .order("sort_order", { ascending: true });

      lessons = rawLessons ?? [];
    }

    // レッスンごとのアクセス判定 + ロック済みレッスンの body/video 除外
    const processedLessons = await Promise.all(
      lessons.map(async (lesson: Record<string, unknown>) => {
        const lessonId = lesson.id as string;
        const isPreview = lesson.is_preview as boolean;

        // コースアクセス不可かつプレビューでないレッスン → body/video 除外
        if (!courseAccess.allowed && !isPreview) {
          const {
            body: _body,
            video_url: _video,
            transcript: _transcript,
            ...meta
          } = lesson;
          return { ...meta, body: null, video_url: null, transcript: null, locked: true };
        }

        // コースアクセス可の場合でも drip/level ロックを確認
        if (courseAccess.allowed && userId && membershipJoinedAt) {
          const lessonAccess = await checkLessonAccess({
            lessonId,
            tenantId: tenant.id,
            userId,
            membershipJoinedAt,
          });

          if (!lessonAccess.allowed) {
            const {
              body: _body,
              video_url: _video,
              transcript: _transcript,
              ...meta
            } = lesson;
            return {
              ...meta,
              body: null,
              video_url: null,
              transcript: null,
              locked: true,
              lock_reason: lessonAccess.reason,
              ...(lessonAccess.unlock_date && { unlock_date: lessonAccess.unlock_date }),
              ...(lessonAccess.required_level && { required_level: lessonAccess.required_level }),
            };
          }
        }

        return { ...lesson, locked: false };
      })
    );

    // モジュールにレッスンをネスト
    const modulesWithLessons = (modules ?? []).map((mod) => ({
      ...mod,
      lessons: processedLessons.filter(
        (l) => l.module_id === mod.id
      ),
    }));

    return Response.json({
      course: {
        ...course,
        modules: modulesWithLessons,
      },
      access: courseAccess,
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
