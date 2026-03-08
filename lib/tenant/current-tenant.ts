import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireCurrentUser } from "@/lib/auth/current-user";

export async function getCurrentTenantForUser() {
  const user = await requireCurrentUser();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, role, status, tenants(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch tenant: ${error.message}`);
  }

  if (!data) {
    throw new Error("Active tenant membership not found");
  }

  return data;
}
