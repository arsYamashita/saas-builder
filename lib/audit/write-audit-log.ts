import { createAdminClient } from "@/lib/db/supabase/admin";
import { createLogger } from "@/lib/utils/logger";
import { incrementAuditLogFailure } from "./metrics";

const log = createLogger("audit");

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
 * How a failed `audit_logs` insert is handled. See the classification
 * table below `writeAuditLog` for which call sites use which mode.
 *
 * - "fail-closed": the write throws immediately on the first failure. The
 *   caller's own try/catch turns this into a failed response — the
 *   triggering operation must NOT be reported as successful when its own
 *   audit trail could not be recorded. Use for destructive operations
 *   (hard delete, etc.) where "it happened but nobody can prove it" is
 *   unacceptable.
 * - "fail-recorded" (default): the write is retried into a dead-letter
 *   table (`audit_log_failures`) instead of the caller's operation being
 *   failed. A metric is incremented and the failure is logged either way.
 *   Use for lower-blast-radius mutations where blocking the whole
 *   operation on an audit-log hiccup would itself be a worse outage than
 *   a delayed/retryable audit trail.
 */
export type AuditLogOnFailure = "fail-closed" | "fail-recorded";

/**
 * Thrown when the audit log write could not be recorded ANYWHERE —
 * either because the caller opted into "fail-closed", or because both the
 * primary `audit_logs` insert AND the `audit_log_failures` dead-letter
 * insert failed (a double failure with no other durable trail).
 *
 * Audit trail is the last line of defense for detecting every other
 * silent failure in the system (compliance / fraud investigation). It
 * must never be allowed to vanish behind a bare `console.error` — see
 * 30_Knowledge/errors/audit_log_write_best_effort_silent_loss.md.
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

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Writes a row to `audit_logs`. On failure, the behavior depends on
 * `options.onFailure` (default `"fail-recorded"`):
 *
 *   fail-recorded (default):
 *     1. Log the failure (console.error via the shared logger).
 *     2. Increment the `fail-recorded` metric
 *        (lib/audit/metrics.ts).
 *     3. Insert a dead-letter row into `audit_log_failures` carrying the
 *        full original payload + the error, so the audit entry can be
 *        replayed/inspected later instead of being lost.
 *     4. If the dead-letter insert ALSO fails (a double failure — nothing
 *        durable now records the loss except this call's own logging),
 *        increment the `fail-recorded-double-failure` metric and throw
 *        `AuditLogWriteError` as a last-resort fail-closed fallback.
 *     Otherwise resolves normally — the calling mutation still succeeds,
 *     but the audit gap is now observable (metric + dead-letter row),
 *     which is the difference between this and the old best-effort
 *     `console.error`-only behavior this replaces.
 *
 *   fail-closed:
 *     Throws `AuditLogWriteError` immediately on the first failure. No
 *     dead-letter attempt is made — the caller's own try/catch is
 *     expected to turn this into a failed response for the operation
 *     that triggered it.
 *
 * ## Classification of call sites (see action item 4 of the instruction
 * this fix implements — 2026-07-13_084)
 *
 * | Call site                                         | Mode          | Why |
 * |----------------------------------------------------|---------------|-----|
 * | membership-plans POST (create)                     | fail-recorded | Non-destructive create; blocking plan creation on an audit hiccup is a worse outage than a delayed trail. |
 * | membership-plans/[planId] PATCH (update)            | fail-recorded | Same — non-destructive, reversible via another update. |
 * | membership-plans/[planId] DELETE                    | fail-closed   | Destructive/irreversible — "deleted with no audit trail" is unacceptable; the delete itself must fail. |
 * | content POST (create)                               | fail-recorded | Non-destructive create. |
 * | content/[contentId] PATCH (update)                  | fail-recorded | Non-destructive, reversible. |
 * | content/[contentId] DELETE                          | fail-closed   | Destructive/irreversible, same reasoning as plan delete. |
 *
 * If a future call site performs a billing charge or a permission/role
 * change, classify it as fail-closed too (see the instruction's own
 * default: destructive / billing / permission-changing operations).
 */
export async function writeAuditLog(
  args: WriteAuditLogArgs,
  options?: { onFailure?: AuditLogOnFailure }
): Promise<void> {
  const onFailure = options?.onFailure ?? "fail-recorded";
  const supabase = createAdminClient();

  const row = {
    tenant_id: args.tenantId,
    actor_user_id: args.actorUserId ?? null,
    action: args.action,
    resource_type: args.resourceType,
    resource_id: args.resourceId,
    before_json: args.beforeJson ?? null,
    after_json: args.afterJson ?? null,
    ip_address: args.ipAddress ?? null,
    user_agent: args.userAgent ?? null,
  };

  const { error } = await supabase.from("audit_logs").insert(row);

  if (!error) {
    return;
  }

  const errorMessage = extractErrorMessage(error);
  log.error("failed to write audit_logs row", {
    action: args.action,
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    tenantId: args.tenantId,
    onFailure,
    error: errorMessage,
  });

  if (onFailure === "fail-closed") {
    incrementAuditLogFailure("fail-closed");
    throw new AuditLogWriteError(
      `Audit log write failed for action="${args.action}" resource=${args.resourceType}/${args.resourceId} ` +
        `tenant=${args.tenantId}: ${errorMessage}`,
      error
    );
  }

  // fail-recorded: dead-letter the failed write instead of failing the
  // caller's operation, so the loss is durable and countable instead of
  // console.error-only.
  incrementAuditLogFailure("fail-recorded");

  const { error: deadLetterError } = await supabase
    .from("audit_log_failures")
    .insert({
      tenant_id: args.tenantId,
      action: args.action,
      resource_type: args.resourceType,
      resource_id: args.resourceId,
      payload_json: row,
      error_message: errorMessage,
    });

  if (deadLetterError) {
    // Double failure: the primary write AND the dead-letter write both
    // failed. Nothing durable records this loss besides the log line and
    // metric below, so this is the one fail-recorded case that still
    // throws — there is no safer fallback left.
    const deadLetterMessage = extractErrorMessage(deadLetterError);
    incrementAuditLogFailure("fail-recorded-double-failure");
    log.error(
      "audit_log_failures dead-letter write ALSO failed — audit trail loss is not recorded anywhere durable",
      {
        action: args.action,
        resourceType: args.resourceType,
        resourceId: args.resourceId,
        tenantId: args.tenantId,
        originalError: errorMessage,
        deadLetterError: deadLetterMessage,
      }
    );
    throw new AuditLogWriteError(
      `Audit log write AND its dead-letter fallback both failed for action="${args.action}" ` +
        `resource=${args.resourceType}/${args.resourceId} tenant=${args.tenantId}: ` +
        `primary=${errorMessage}; dead-letter=${deadLetterMessage}`,
      { primaryError: error, deadLetterError }
    );
  }
}
