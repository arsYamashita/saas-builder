// GET /api/public/tenants/[tenantSlug]/contents
// Guard: なし (公開) / requireAuth (optional, member判定用)
// Audit: なし
//
// 公開面のコンテンツ一覧。
// - 未認証: public のみ
// - 認証済み + active member: public + members_only + rules_based (一覧レベル)
// - 一覧ではアクセスルール詳細判定はしない (詳細取得時に checkContentAccess)

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

    // クエリ構築
    let query = supabase
      .from("contents")
      .select("id, title, slug, excerpt, cover_image_url, content_type, visibility_mode, published_at")
      .eq("tenant_id", tenant.id)
      .eq("status", "published")
      .order("published_at", { ascending: false });

    if (!isMember) {
      query = query.eq("visibility_mode", "public");
    }
    // member の場合は全 visibility_mode を返す (一覧レベル)

    const { data: contents, error } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch contents: ${error.message}`);
    }

    return Response.json({ contents: contents ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}
