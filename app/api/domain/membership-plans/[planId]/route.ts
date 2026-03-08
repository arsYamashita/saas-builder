import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { membershipPlanFormSchema } from "@/lib/validation/membership-plan";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

type Props = {
  params: Promise<{ planId: string }>;
};

export async function GET(_req: NextRequest, { params }: Props) {
  try {
    const { planId } = await params;
    const membership = await requireTenantRole("admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .eq("tenant_id", membership.tenant_id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Plan not found", details: error.message },
        { status: 404 }
      );
    }

    return NextResponse.json({ plan: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to fetch plan", details: message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Props) {
  try {
    const { planId } = await params;
    const membership = await requireTenantRole("admin");
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const body = await req.json();
    const parsed = membershipPlanFormSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input = parsed.data;

    const { data: before, error: beforeError } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .eq("tenant_id", membership.tenant_id)
      .single();

    if (beforeError) {
      return NextResponse.json(
        { error: "Plan not found", details: beforeError.message },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("membership_plans")
      .update({
        name: input.name,
        description: input.description || null,
        price_id: input.price_id || null,
        status: input.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId)
      .eq("tenant_id", membership.tenant_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update plan", details: error.message },
        { status: 500 }
      );
    }

    await writeAuditLog({
      tenantId: membership.tenant_id,
      actorUserId: user.id,
      action: "membership_plan.update",
      resourceType: "membership_plan",
      resourceId: data.id,
      beforeJson: before,
      afterJson: data,
    });

    return NextResponse.json({ plan: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to update plan", details: message },
      { status: 500 }
    );
  }
}
