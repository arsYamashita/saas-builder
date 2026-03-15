// GET /api/public/tenants/[tenantSlug]/plans
// Guard: なし (公開)
// Audit: なし
//
// active プランのみ返す。料金ページ用。

import { createAdminClient } from "@/lib/db/supabase/admin";
import { handleGuardError, GuardError } from "@/lib/guards";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const supabase = createAdminClient();

    // tenant を slug で検索
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .eq("status", "active")
      .single();

    if (tenantError || !tenant) {
      throw new GuardError(404, "Tenant not found");
    }

    const { data: plans, error } = await supabase
      .from("membership_plans")
      .select("id, name, description, price_amount, currency, features, sort_order")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    if (error) {
      throw new GuardError(500, `Failed to fetch plans: ${error.message}`);
    }

    return Response.json({ plans: plans ?? [] });
  } catch (error) {
    return handleGuardError(error);
  }
}
