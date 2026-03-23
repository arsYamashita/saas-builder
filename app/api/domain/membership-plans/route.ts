import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/supabase/admin";
import { requireTenantRole } from "@/lib/rbac/guards";
import { membershipPlanFormSchema } from "@/lib/validation/membership-plan";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { writeAuditLog } from "@/lib/audit/write-audit-log";

export async function GET() {
  try {
    const membership = await requireTenantRole("admin");
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("tenant_id", membership.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch plans error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch plans" },
        { status: 500 }
      );
    }

    return NextResponse.json({ plans: data });
  } catch (error) {
    console.error("Fetch plans unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to fetch plans" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
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

    const { data, error } = await supabase
      .from("membership_plans")
      .insert({
        tenant_id: membership.tenant_id,
        name: input.name,
        description: input.description || null,
        price_id: input.price_id || null,
        status: input.status,
      })
      .select()
      .single();

    if (error) {
      console.error("Create plan error:", error.message);
      return NextResponse.json(
        { error: "Failed to create plan" },
        { status: 500 }
      );
    }

    await writeAuditLog({
      tenantId: membership.tenant_id,
      actorUserId: user.id,
      action: "membership_plan.create",
      resourceType: "membership_plan",
      resourceId: data.id,
      afterJson: data,
    });

    return NextResponse.json({ plan: data }, { status: 201 });
  } catch (error) {
    console.error("Create plan unexpected error:", error);

    return NextResponse.json(
      { error: "Failed to create plan" },
      { status: 500 }
    );
  }
}
