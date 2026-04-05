// GET /api/public/tenants/[tenantSlug]/leaderboard
// Guard: なし (公開)
// Audit: なし
//
// Public leaderboard. Top 20 with limited user info (no email).

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";
import { getLeaderboard } from "@/lib/gamification";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const supabase = createAdminClient();

    // Resolve tenantSlug to tenantId
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    const leaderboard = await getLeaderboard(tenant.id, 20, 0);

    return Response.json({ leaderboard });
  } catch (error) {
    return handleGuardError(error);
  }
}
