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
      console.error("Fetch plan error:", error.message);
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ plan: data });
  } catch (error) {
    console.error("Fetch plan unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to fetch plan" },
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
      console.error("Fetch plan for update error:", beforeError.message);
      return NextResponse.json(
        { error: "Plan not found" },
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
      console.error("Update plan error:", error.message);
      return NextResponse.json(
        { error: "Failed to update plan" },
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
    console.error("Update plan unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to update plan" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  try {
    const { planId } = await params;
    const membership = await requireTenantRole("admin");
    const user = await requireCurrentUser();
    const supabase = createAdminClient();

    const { data: before, error: beforeError } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .eq("tenant_id", membership.tenant_id)
      .single();

    if (beforeError) {
      console.error("Fetch plan for delete error:", beforeError.message);
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("membership_plans")
      .delete()
      .eq("id", planId)
      .eq("tenant_id", membership.tenant_id);

    if (error) {
      const isFkViolation = error.code === "23503" || error.message?.includes("foreign key");
      console.error("Delete plan error:", error.message);
      return NextResponse.json(
        {
          error: isFkViolation
            ? "Cannot delete plan: it is referenced by other records"
            : "Failed to delete plan",
        },
        { status: isFkViolation ? 409 : 500 }
      );
    }

    await writeAuditLog({
      tenantId: membership.tenant_id,
      actorUserId: user.id,
      action: "membership_plan.delete",
      resourceType: "membership_plan",
      resourceId: planId,
      beforeJson: before,
      afterJson: null,
    });

    return NextResponse.json({ ok: true, deletedId: planId });
  } catch (error) {
    console.error("Delete plan unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to delete plan" },
      { status: 500 }
    );
  }
}
