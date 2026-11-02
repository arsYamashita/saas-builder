import { createAdminClient } from "@/lib/db/supabase/admin";
import { slugify } from "@/lib/utils/slugify";
import { findAffiliateByCode } from "@/lib/affiliate/find-affiliate-by-code";
import { findOrCreateReferral } from "@/lib/affiliate/find-or-create-referral";

type SignupFlowArgs = {
  userId: string;
  email: string;
  displayName: string;
  tenantName: string;
  affiliateCode?: string | null;
  visitorToken?: string | null;
};

type AdminClient = ReturnType<typeof createAdminClient>;

type SignupTenant = {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string | null;
  plan_type: string;
  status: string;
};

/**
 * ユーザーの有効な所属を保証する。何度呼んでも同じテナントを返す。
 *
 * 1. tenant_users に有効な所属があれば、何も作らずそのテナントを返す。
 * 2. 無ければ RPC ensure_signup_tenant で tenants と tenant_users を
 *    1 トランザクションで作る (supabase/migrations/0020_*.sql)。RPC 側でも
 *    user_id 単位の lock と既存所属の確認をするので、同時実行でも二重に作らない。
 *
 * tenants / tenant_users への素の insert はここでは行わない。
 */
async function ensureTenantForUser(
  supabase: AdminClient,
  {
    userId,
    tenantName,
    displayName,
  }: { userId: string; tenantName: string; displayName: string }
): Promise<SignupTenant> {
  const { data: existing, error: existingError } = await supabase
    .from("tenant_users")
    .select("tenant_id, tenants(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Failed to look up tenant membership: ${existingError.message}`
    );
  }

  const existingTenant = existing?.tenants as unknown as
    | SignupTenant
    | null
    | undefined;
  if (existingTenant) {
    return existingTenant;
  }

  const resolvedName = tenantName || displayName || "workspace";
  const tenantSlug = `${slugify(resolvedName) || "workspace"}-${crypto
    .randomUUID()
    .slice(0, 8)}`;

  const { data: rows, error: rpcError } = await supabase.rpc(
    "ensure_signup_tenant",
    {
      p_user_id: userId,
      p_name: resolvedName,
      p_slug: tenantSlug,
    }
  );

  if (rpcError) {
    throw new Error(`Failed to create tenant: ${rpcError.message}`);
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new Error("Failed to create tenant: empty RPC result");
  }

  return {
    id: row.tenant_id,
    name: row.tenant_name,
    slug: row.tenant_slug,
    owner_user_id: row.owner_user_id,
    plan_type: row.plan_type,
    status: row.tenant_status,
  };
}

export async function runSignupFlow({
  userId,
  email,
  displayName,
  tenantName,
  affiliateCode,
  visitorToken,
}: SignupFlowArgs) {
  const supabase = createAdminClient();

  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        email,
        display_name: displayName,
        auth_provider: "email",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (userError) {
    throw new Error(`Failed to upsert user profile: ${userError.message}`);
  }

  const tenant = await ensureTenantForUser(supabase, {
    userId,
    tenantName,
    displayName,
  });

  if (affiliateCode) {
    const affiliate = await findAffiliateByCode(tenant.id, affiliateCode);

    if (affiliate) {
      await findOrCreateReferral({
        tenantId: tenant.id,
        affiliateId: affiliate.id,
        visitorToken,
        referredUserId: userId,
      });
    }
  }

  return {
    user: userRecord,
    tenant,
  };
}
