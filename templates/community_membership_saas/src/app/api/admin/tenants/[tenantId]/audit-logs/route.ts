// GET /api/admin/tenants/[tenantId]/audit-logs
// Guard: requireRole(admin)
// Audit: なし
//
// Query params: ?limit=50&offset=0&resource_type=content&action=content.create

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 100);
    const offset = Number(url.searchParams.get("offset") || "0");
    const resourceType = url.searchParams.get("resource_type");
    const action = url.searchParams.get("action");

    const supabase = createAdminClient();

    let query = supabase
      .from("audit_logs")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (resourceType) {
      query = query.eq("resource_type", resourceType);
    }
    if (action) {
      query = query.eq("action", action);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      throw new GuardError(500, `Failed to fetch audit logs: ${error.message}`);
    }

    return Response.json({
      logs: logs ?? [],
      total: count ?? 0,
      limit,
      offset,
    });
  } catch (error) {
    return handleGuardError(error);
  }
}
