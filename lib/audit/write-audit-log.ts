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

/**
 * Thrown when the audit log write fails.
 *
 * Audit trail is the last line of defense for detecting every other
 * silent failure in the system (compliance / fraud investigation).
 * A dropped audit log must therefore fail the calling mutation
 * (fail-closed) instead of being swallowed behind a console.error —
 * see 30_Knowledge/errors/audit_log_write_best_effort_silent_loss.md.
 *
 * Note: this is a single-attempt, fail-closed write, not retried. A
 * retry-on-failure was considered but rejected: `audit_logs` has no
 * caller-supplied idempotency key, so retrying an insert whose response
 * was merely lost (rather than truly failed) risks writing duplicate
 * audit rows. Making the domain mutation and this insert atomic (same
 * transaction/RPC) would remove the throw-after-commit trade-off below
 * entirely; that is tracked as follow-up work, not part of this fix.
 */
export class AuditLogWriteError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AuditLogWriteError";
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

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
}: WriteAuditLogArgs): Promise<void> {
  const supabase = createAdminClient();

  const row = {
    tenant_id: tenantId,
    actor_user_id: actorUserId ?? null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    before_json: beforeJson ?? null,
    after_json: afterJson ?? null,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  };

  const { error } = await supabase.from("audit_logs").insert(row);

  if (!error) {
    return;
  }

  console.error(
    `[audit] Failed to write audit log action=${action} ` +
      `resource=${resourceType}/${resourceId} tenant=${tenantId}: ${error.message}`
  );

  // Fail-closed: the operation that triggered this audit log must not be
  // reported as successful when its own audit trail could not be recorded.
  throw new AuditLogWriteError(
    `Audit log write failed for action="${action}" resource=${resourceType}/${resourceId} ` +
      `tenant=${tenantId}: ${error.message}`,
    error
  );
}
