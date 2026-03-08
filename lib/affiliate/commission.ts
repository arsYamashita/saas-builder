import { createAdminClient } from "@/lib/db/supabase/admin";

type CreateCommissionArgs = {
  tenantId: string;
  affiliateId: string;
  referralId?: string | null;
  subscriptionId?: string | null;
  amount: number;
  currency?: string;
};

export async function createCommission({
  tenantId,
  affiliateId,
  referralId,
  subscriptionId,
  amount,
  currency = "jpy",
}: CreateCommissionArgs) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("commissions")
    .insert({
      tenant_id: tenantId,
      affiliate_id: affiliateId,
      referral_id: referralId ?? null,
      subscription_id: subscriptionId ?? null,
      amount,
      currency,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create commission: ${error.message}`);
  }

  return data;
}
