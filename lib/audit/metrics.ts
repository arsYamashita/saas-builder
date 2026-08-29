/**
 * In-process counters for audit-log write failures.
 *
 * This is the minimal "メトリクス化" the instruction asks for: a counter
 * that increments every time `writeAuditLog()` fails to insert into
 * `audit_logs`, split out by which failure mode handled it
 * (`fail-closed` vs `fail-recorded`) and, for `fail-recorded`, whether the
 * dead-letter write itself also failed (a "double failure" — the worst
 * case, since at that point nothing durable records the loss except this
 * counter and the logger call next to it).
 *
 * This is process-local (resets on redeploy/restart) — it is NOT a
 * substitute for the `audit_log_failures` table, which is the durable
 * record. It exists so a metrics scraper / `/api/admin/health` route can
 * expose "audit log failures since boot" without querying the DB on every
 * request. Wiring this into an actual metrics backend (Prometheus/Datadog/
 * etc.) is left for whenever this app gets one; today it's read via
 * `getAuditLogFailureMetrics()`.
 */

export type AuditLogFailureKind =
  | "fail-closed"
  | "fail-recorded"
  | "fail-recorded-double-failure";

type MetricsState = Record<AuditLogFailureKind, number>;

function emptyState(): MetricsState {
  return {
    "fail-closed": 0,
    "fail-recorded": 0,
    "fail-recorded-double-failure": 0,
  };
}

let state: MetricsState = emptyState();

/** Increments the counter for the given failure kind. */
export function incrementAuditLogFailure(kind: AuditLogFailureKind): void {
  state[kind] += 1;
}

/** Returns a snapshot of all counters. */
export function getAuditLogFailureMetrics(): MetricsState {
  return { ...state };
}

/** Test-only: resets all counters to zero. */
export function resetAuditLogFailureMetrics(): void {
  state = emptyState();
}
