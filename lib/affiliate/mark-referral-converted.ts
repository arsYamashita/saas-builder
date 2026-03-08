import { createAdminClient } from "@/lib/db/supabase/admin";

export async function markReferralConverted(referralId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("referrals")
    .update({
      status: "converted",
      converted_at: new Date().toISOString(),
    })
    .eq("id", referralId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to mark referral converted: ${error.message}`);
  }

  return data;
}
