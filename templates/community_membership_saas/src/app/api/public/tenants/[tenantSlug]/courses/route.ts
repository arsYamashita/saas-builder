// GET /api/public/tenants/[tenantSlug]/courses
// Guard: なし (公開) / requireAuth (optional, member判定用)
// Audit: なし
//
// 公開面のコース一覧。
// - published のみ
// - 未認証: public のみ
// - 認証済み + active member: 全 visibility_mode を返す (一覧レベル)

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";
import { createClient } from "@/lib/db/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
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

    // 認証チェック (optional)
    let isMember = false;
    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: membership } = await supabase
          .from("memberships")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("user_id", user.id)
          .eq("status", "active")
          .maybeSingle();
        isMember = !!membership;
      }
    } catch {
      // 未認証は無視
    }

    // コース一覧
    let query = supabase
      .from("courses")
      .select("id, title, slug, description, cover_image_url, visibility_mode, sort_order, created_at")
      .eq("tenant_id", tenant.id)
      .eq("status", "published")
      .order("sort_order", { ascending: true });

    if (!isMember) {
      query = query.eq("visibility_mode", "public");
    }

    const { data: courses, error } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch courses: ${error.message}`);
    }

    // 各コースのモジュール数・レッスン数を付与
    const coursesWithCounts = await Promise.all(
      (courses ?? []).map(async (course) => {
        const { data: modules } = await supabase
          .from("course_modules")
          .select("id")
          .eq("course_id", course.id)
          .eq("tenant_id", tenant.id);

        const moduleIds = modules?.map((m) => m.id) ?? [];
        let lessonsCount = 0;

        if (moduleIds.length > 0) {
          const { count } = await supabase
            .from("course_lessons")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenant.id)
            .in("module_id", moduleIds);
          lessonsCount = count ?? 0;
        }

        return {
          ...course,
          modules_count: moduleIds.length,
          lessons_count: lessonsCount,
        };
      })
    );

    return Response.json({ courses: coursesWithCounts });
  } catch (error) {
    return handleGuardError(error);
  }
}
