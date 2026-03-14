// GET /api/me
// Guard: requireAuth
// Audit: なし

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError } from "@/lib/guards";

export async function GET() {
  try {
    const authUser = await requireAuth();
    const supabase = createAdminClient();

    // user profile
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", authUser.id)
      .single();

    // memberships with tenant info
    const { data: memberships } = await supabase
      .from("memberships")
      .select("id, tenant_id, role, status, joined_at, tenants(id, name, slug)")
      .eq("user_id", authUser.id)
      .eq("status", "active");

    return Response.json({
      user: user ?? { id: authUser.id, email: authUser.email },
      memberships: memberships ?? [],
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
