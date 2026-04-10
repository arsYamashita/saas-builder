// GET /api/admin/tenants/[tenantId]/leaderboard — Guard: requireTenantMember
// Community leaderboard with current user's rank.

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { getLeaderboard, getMemberPoints } from "@/lib/gamification";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireTenantMember(authUser.id, tenantId);

    const url = new URL(req.url);
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1),
      100
    );
    const offset = Math.max(
      parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
      0
    );

    const leaderboard = await getLeaderboard(tenantId, limit, offset);

    // Get current user's rank and points
    const myPoints = await getMemberPoints(tenantId, authUser.id);

    // Compute current user's rank
    const supabase = createAdminClient();
    const { count } = await supabase
      .from("member_points")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gt("total_points", myPoints.total_points);

    const myRank = (count ?? 0) + 1;

    return Response.json({
      leaderboard,
      me: {
        rank: myRank,
        ...myPoints,
      },
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
