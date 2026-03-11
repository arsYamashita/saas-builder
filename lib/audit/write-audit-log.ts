import { createAdminClient } from "@/lib/db/supabase/admin";

type WriteAuditLogArgs = {
  tenantId: string;
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog({
  tenantId,
  actorUserId,
  action,
  resourceType,
  resourceId,
  beforeJson,
  afterJson,
  ipAddress,
  userAgent,
}: WriteAuditLogArgs) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId ?? null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    before_json: beforeJson ?? null,
    after_json: afterJson ?? null,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  });

  if (error) {
    console.error(`[audit] Failed to write audit log: ${error.message}`);
  }
}
