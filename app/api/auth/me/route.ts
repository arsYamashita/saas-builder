import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const tenantMembership = await getCurrentTenantForUser();

    return NextResponse.json({
      user,
      tenantMembership,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: "Failed to fetch current auth state", details: message },
      { status: 401 }
    );
  }
}
