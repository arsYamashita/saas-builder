import { getAuthSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/db/supabase/admin";

export async function requireCurrentUser() {
  const session = await getAuthSession();

  if (!session.user) {
    throw new Error("Unauthorized");
  }

  const supabase = createAdminClient();

  const { data: userRecord, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (error) {
    throw new Error(`User profile not found: ${error.message}`);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    displayName: userRecord.display_name ?? null,
  };
}
