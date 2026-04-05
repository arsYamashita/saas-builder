// GET  /api/admin/tenants/[tenantId]/categories — Guard: requireRole(admin)
// POST /api/admin/tenants/[tenantId]/categories — Guard: requireRole(admin), Audit: category.create

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

    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch categories: ${error.message}`);
    }

    return Response.json({ categories: categories ?? [] });
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
    const { name, slug, description, sort_order, emoji } = body;

    if (!name || !slug) {
      throw new GuardError(400, "name and slug are required");
    }

    const supabase = createAdminClient();

    const { data: category, error } = await supabase
      .from("categories")
      .insert({
        tenant_id: tenantId,
        name,
        slug,
        description: description ?? null,
        sort_order: sort_order ?? 0,
        emoji: emoji ?? null,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create category: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "category.create",
      resourceType: "category",
      resourceId: category.id,
      after: category,
    });

    return Response.json({ category }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
