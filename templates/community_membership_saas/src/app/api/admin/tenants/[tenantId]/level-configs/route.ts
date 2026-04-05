// GET  /api/admin/tenants/[tenantId]/level-configs — Guard: requireTenantMember
// PUT  /api/admin/tenants/[tenantId]/level-configs — Guard: requireRole(admin), Audit: level_config.update

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireTenantMember,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";
import { getLevelConfigs } from "@/lib/gamification";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireTenantMember(authUser.id, tenantId);

    const configs = await getLevelConfigs(tenantId);

    return Response.json({ level_configs: configs });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { level_configs } = body;

    if (!Array.isArray(level_configs) || level_configs.length === 0) {
      throw new GuardError(400, "level_configs array is required");
    }

    // Validate each entry
    for (const config of level_configs) {
      if (
        typeof config.level !== "number" ||
        typeof config.name !== "string" ||
        typeof config.min_points !== "number"
      ) {
        throw new GuardError(
          400,
          "Each level_config must have level (number), name (string), min_points (number)"
        );
      }
    }

    const supabase = createAdminClient();

    // Fetch existing configs for audit before-state
    const { data: before } = await supabase
      .from("level_configs")
      .select("*")
      .eq("tenant_id", tenantId);

    // Delete existing configs for this tenant
    const { error: deleteError } = await supabase
      .from("level_configs")
      .delete()
      .eq("tenant_id", tenantId);

    if (deleteError) {
      throw new GuardError(
        500,
        `Failed to delete existing level_configs: ${deleteError.message}`
      );
    }

    // Insert new configs
    const rows = level_configs.map(
      (c: { level: number; name: string; min_points: number; rewards?: unknown }) => ({
        tenant_id: tenantId,
        level: c.level,
        name: c.name,
        min_points: c.min_points,
        rewards: c.rewards ?? null,
      })
    );

    const { data: inserted, error: insertError } = await supabase
      .from("level_configs")
      .insert(rows)
      .select("*");

    if (insertError) {
      throw new GuardError(
        500,
        `Failed to insert level_configs: ${insertError.message}`
      );
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "level_config.update",
      resourceType: "level_config",
      resourceId: tenantId,
      before: before ?? [],
      after: inserted ?? [],
    });

    return Response.json({ level_configs: inserted ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}
