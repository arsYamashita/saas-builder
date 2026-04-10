// GET /api/me/points?tenant_id=xxx — Guard: requireAuth
// Returns my points, level, level_name, progress to next level,
// and recent point events (last 20).

import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireAuth, handleGuardError, GuardError } from "@/lib/guards";
import { getMemberPoints } from "@/lib/gamification";

export async function GET(req: Request) {
  try {
    const authUser = await requireAuth();

    const url = new URL(req.url);
    const tenantId =
      url.searchParams.get("tenant_id") ??
      req.headers.get("x-tenant-id");

    if (!tenantId) {
      throw new GuardError(
        400,
        "tenant_id query param or x-tenant-id header is required"
      );
    }

    const pointsInfo = await getMemberPoints(tenantId, authUser.id);

    // Fetch recent point events
    const supabase = createAdminClient();
    const { data: recentEvents, error } = await supabase
      .from("point_events")
      .select("id, event_type, points, source_type, source_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("user_id", authUser.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new GuardError(
        500,
        `Failed to fetch point events: ${error.message}`
      );
    }

    return Response.json({
      ...pointsInfo,
      recent_events: recentEvents ?? [],
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
