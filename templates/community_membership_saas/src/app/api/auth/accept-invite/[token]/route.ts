// POST /api/auth/accept-invite/[token]
// Guard: requireAuth
// Audit: membership.create
//
// v2 仕様:
//   - invite トークンで参加。有効期限・use_count・invited_email を検証。
//   - tenant.join_mode が 'application' の場合は拒否し apply ルートへ誘導。
//   - invited_role で membership を作成。

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError, GuardError } from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const authUser = await requireAuth();

    const supabase = createAdminClient();

    // invite 検索
    const { data: invite, error: inviteError } = await supabase
      .from("invites")
      .select("*")
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      throw new GuardError(404, "Invite not found");
    }

    // 有効期限チェック
    if (new Date(invite.expires_at) < new Date()) {
      throw new GuardError(410, "Invite has expired");
    }

    // use_count チェック
    if (invite.max_uses !== null && invite.use_count >= invite.max_uses) {
      throw new GuardError(410, "Invite has reached maximum uses");
    }

    // invited_email チェック (設定されている場合のみ)
    if (invite.invited_email && invite.invited_email !== authUser.email) {
      throw new GuardError(403, "This invite is for a different email address");
    }

    // tenant 確認
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id, name, slug, join_mode, status")
      .eq("id", invite.tenant_id)
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    if (tenant.status !== "active") {
      throw new GuardError(403, "Tenant is not active");
    }

    // join_mode が application の場合は拒否
    if (tenant.join_mode === "application") {
      return Response.json(
        {
          error: "This tenant requires an application to join",
          redirect: `/public/tenants/${tenant.slug}/apply`,
        },
        { status: 302 }
      );
    }

    // 既存 membership チェック
    const { data: existing } = await supabase
      .from("memberships")
      .select("id")
      .eq("tenant_id", invite.tenant_id)
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (existing) {
      throw new GuardError(409, "Already a member of this tenant");
    }

    // users upsert (初回ログイン対応)
    await supabase.from("users").upsert(
      { id: authUser.id, email: authUser.email },
      { onConflict: "id" }
    );

    // membership 作成
    const { data: membership, error: memberError } = await supabase
      .from("memberships")
      .insert({
        tenant_id: invite.tenant_id,
        user_id: authUser.id,
        role: invite.invited_role,
        status: "active",
        invited_by: invite.created_by,
      })
      .select()
      .single();

    if (memberError || !membership) {
      throw new GuardError(500, `Failed to create membership: ${memberError?.message}`);
    }

    // invite use_count + accepted 更新
    await supabase
      .from("invites")
      .update({
        use_count: invite.use_count + 1,
        accepted_at: new Date().toISOString(),
        accepted_by: authUser.id,
      })
      .eq("id", invite.id);

    await writeAuditLog({
      tenantId: invite.tenant_id,
      actorUserId: authUser.id,
      action: "membership.create",
      resourceType: "membership",
      resourceId: membership.id,
      after: membership,
    });

    return Response.json(
      {
        membership,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleGuardError(error);
  }
}
