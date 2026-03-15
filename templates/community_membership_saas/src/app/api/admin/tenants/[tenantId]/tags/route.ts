// GET  /api/admin/tenants/[tenantId]/tags — Guard: requireRole(admin)
// POST /api/admin/tenants/[tenantId]/tags — Guard: requireRole(admin), Audit: tag.create

import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    const { data: tags, error } = await supabase
      .from("tags")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch tags: ${error.message}`);
    }

    return Response.json({ tags: tags ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const body = await req.json();
    const { name, slug, description, color } = body;

    if (!name || !slug) {
      throw new GuardError(400, "name and slug are required");
    }

    const supabase = createAdminClient();

    const { data: tag, error } = await supabase
      .from("tags")
      .insert({
        tenant_id: tenantId,
        name,
        slug,
        description: description ?? null,
        color: color ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create tag: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "tag.create",
      resourceType: "tag",
      resourceId: tag.id,
      after: tag,
    });

    return Response.json({ tag }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
