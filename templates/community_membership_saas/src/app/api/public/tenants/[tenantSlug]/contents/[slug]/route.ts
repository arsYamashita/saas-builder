// GET /api/public/tenants/[tenantSlug]/contents/[slug]
// Guard: なし (公開) / checkContentAccess
// Audit: なし
//
// 公開面のコンテンツ詳細。
// checkContentAccess で visibility_mode + rules を評価。
// アクセス不可の場合は body を除外してメタ情報のみ返す。

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";
import { checkContentAccess } from "@/lib/access";
import { createClient } from "@/lib/db/supabase/server";
import type { AppRole } from "@/types/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantSlug: string; slug: string }> }
) {
  try {
    const { tenantSlug, slug } = await params;
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

    // コンテンツ取得 — 公開面では published のみ (draft/archived は存在しない扱い)
    const { data: content, error: contentError } = await supabase
      .from("contents")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (contentError || !content) {
      throw new GuardError(404, "Content not found");
    }

    // 認証情報取得
    let userId: string | null = null;
    let userRole: AppRole | null = null;
    let membershipStatus: string | null = null;

    try {
      const userClient = await createClient();
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: membership } = await supabase
          .from("memberships")
          .select("role, status")
          .eq("tenant_id", tenant.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (membership) {
          userRole = membership.role as AppRole;
          membershipStatus = membership.status;
        }
      }
    } catch {
      // 未認証は無視
    }

    // アクセス判定
    const access = await checkContentAccess({
      contentId: content.id,
      tenantId: tenant.id,
      userId,
      userRole,
      membershipStatus,
    });

    if (access.allowed) {
      return Response.json({ content, access });
    }

    // アクセス不可: body を除外してメタ情報のみ
    const { body: _body, ...meta } = content;
    return Response.json({
      content: { ...meta, body: null },
      access,
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
