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

  const tenantSlugBase = slugify(tenantName || displayName || "workspace");
  const tenantSlug = `${tenantSlugBase}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: tenantName,
      slug: tenantSlug,
      owner_user_id: userId,
      plan_type: "starter",
      status: "active",
    })
    .select()
    .single();

  if (tenantError) {
    throw new Error(`Failed to create tenant: ${tenantError.message}`);
  }

  const { error: membershipError } = await supabase
    .from("tenant_users")
    .insert({
      tenant_id: tenant.id,
      user_id: userId,
      role: "owner",
      status: "active",
      joined_at: new Date().toISOString(),
    });

  if (membershipError) {
    throw new Error(
      `Failed to create tenant membership: ${membershipError.message}`
    );
  }

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
