import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function getBillingAccess() {
  const user = await requireCurrentUser();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch subscription: ${error.message}`);
  }

  return {
    isActive: data?.status === "active",
    subscriptionStatus: data?.status ?? null,
  };
}
