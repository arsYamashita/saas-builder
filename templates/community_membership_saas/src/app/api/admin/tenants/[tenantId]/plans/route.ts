// GET  /api/admin/tenants/[tenantId]/plans — Guard: requireRole(admin)
// POST /api/admin/tenants/[tenantId]/plans — Guard: requireRole(admin), Audit: plan.create

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

    const { data: plans, error } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch plans: ${error.message}`);
    }

    return Response.json({ plans: plans ?? [] });
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
    const {
      name,
      description,
      stripe_price_id,
      stripe_price_id_yearly,
      price_amount,
      currency,
      features,
      sort_order,
      status,
    } = body;

    if (!name) {
      throw new GuardError(400, "name is required");
    }

    const supabase = createAdminClient();

    const { data: plan, error } = await supabase
      .from("membership_plans")
      .insert({
        tenant_id: tenantId,
        name,
        description: description ?? null,
        stripe_price_id: stripe_price_id ?? null,
        stripe_price_id_yearly: stripe_price_id_yearly ?? null,
        price_amount: price_amount ?? null,
        currency: currency ?? "jpy",
        features: features ?? [],
        sort_order: sort_order ?? 0,
        status: status ?? "draft",
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create plan: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "plan.create",
      resourceType: "membership_plan",
      resourceId: plan.id,
      after: plan,
    });

    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
