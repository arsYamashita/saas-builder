// ============================================================
// community_membership_saas v1 — Audit Log Writer
// ============================================================
// service_role で audit_logs に insert する。
// 失敗してもビジネスロジックをブロックしない (console.error のみ)。
// ============================================================

import { createAdminClient } from "@/lib/db/supabase/admin";

export type AuditAction =
  | "content.create"
  | "content.update"
  | "content.delete"
  | "content.publish"
  | "content.archive"
  | "membership.create"
  | "membership.update"
  | "membership.delete"
  | "plan.create"
  | "plan.update"
  | "plan.delete"
  | "tag.create"
  | "tag.update"
  | "tag.delete"
  | "user_tag.assign"
  | "user_tag.remove"
  | "tenant.update"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "purchase.completed"
  | "purchase.refunded";

export async function writeAuditLog(params: {
  tenantId: string;
  actorUserId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase.from("audit_logs").insert({
      tenant_id: params.tenantId,
      actor_user_id: params.actorUserId,
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      before_json: params.before ?? null,
      after_json: params.after ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
    });

    if (error) {
      console.error(
        `[audit] Failed to write audit log:`,
        JSON.stringify({
          error: error.message,
          tenantId: params.tenantId,
          actorUserId: params.actorUserId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
        })
      );
    }
  } catch (err) {
    console.error(
      `[audit] Unexpected error:`,
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
        tenantId: params.tenantId,
        actorUserId: params.actorUserId,
        action: params.action,
      })
    );
  }
}
