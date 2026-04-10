// GET  /api/admin/tenants/[tenantId]/invites — Guard: requireRole(admin)
// POST /api/admin/tenants/[tenantId]/invites — Guard: requireRole(admin), Audit: invite.create

import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/db/supabase/admin";
import {
  requireAuth,
  requireRole,
  handleGuardError,
  GuardError,
} from "@/lib/guards";
import { writeAuditLog } from "@/lib/audit";
import type { AppRole } from "@/types/database";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;
    const authUser = await requireAuth();
    await requireRole(authUser.id, tenantId, "admin");

    const supabase = createAdminClient();

    const { data: invites, error } = await supabase
      .from("invites")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new GuardError(500, `Failed to fetch invites: ${error.message}`);
    }

    const now = new Date().toISOString();
    const enriched = (invites ?? []).map((invite) => ({
      ...invite,
      expired: invite.expires_at < now,
    }));

    return Response.json({ invites: enriched });
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
      invited_email,
      invited_role,
      expires_in_days,
      max_uses,
    } = body;

    const role: AppRole = invited_role ?? "member";
    const days = expires_in_days ?? 7;
    const token = randomBytes(16).toString("hex");
    const expiresAt = new Date(
      Date.now() + days * 24 * 60 * 60 * 1000
    ).toISOString();

    const supabase = createAdminClient();

    const { data: invite, error } = await supabase
      .from("invites")
      .insert({
        tenant_id: tenantId,
        token,
        invited_email: invited_email ?? null,
        invited_role: role,
        created_by: authUser.id,
        expires_at: expiresAt,
        max_uses: max_uses ?? null,
        use_count: 0,
      })
      .select()
      .single();

    if (error) {
      throw new GuardError(500, `Failed to create invite: ${error.message}`);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: authUser.id,
      action: "invite.create",
      resourceType: "invite",
      resourceId: invite.id,
      after: invite,
    });

    return Response.json({ invite }, { status: 201 });
  } catch (error) {
    return handleGuardError(error);
  }
}
