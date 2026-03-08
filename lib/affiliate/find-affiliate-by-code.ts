import { createAdminClient } from "@/lib/db/supabase/admin";

export async function findAffiliateByCode(
  tenantId: string,
  code: string
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("affiliates")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find affiliate: ${error.message}`);
  }

  return data;
}
