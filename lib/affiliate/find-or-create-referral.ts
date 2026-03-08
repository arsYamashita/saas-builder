import { createAdminClient } from "@/lib/db/supabase/admin";

type Args = {
  tenantId: string;
  affiliateId: string;
  visitorToken?: string | null;
  referredUserId?: string | null;
};

export async function findOrCreateReferral({
  tenantId,
  affiliateId,
  visitorToken,
  referredUserId,
}: Args) {
  const supabase = createAdminClient();

  if (referredUserId) {
    const { data: existingByUser } = await supabase
      .from("referrals")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("affiliate_id", affiliateId)
      .eq("referred_user_id", referredUserId)
      .maybeSingle();

    if (existingByUser) return existingByUser;
  }

  if (visitorToken) {
    const { data: existingByVisitor } = await supabase
      .from("referrals")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("affiliate_id", affiliateId)
      .eq("visitor_token", visitorToken)
      .maybeSingle();

    if (existingByVisitor) return existingByVisitor;
  }

  const { data, error } = await supabase
    .from("referrals")
    .insert({
      tenant_id: tenantId,
      affiliate_id: affiliateId,
      visitor_token: visitorToken ?? null,
      referred_user_id: referredUserId ?? null,
      first_clicked_at: new Date().toISOString(),
      status: "clicked",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create referral: ${error.message}`);
  }

  return data;
}
