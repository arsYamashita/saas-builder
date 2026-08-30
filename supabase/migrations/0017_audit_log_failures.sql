-- Dead-letter table for failed audit_logs writes.
--
-- writeAuditLog() (lib/audit/write-audit-log.ts) previously swallowed
-- audit_logs insert failures behind a bare console.error, so a security/
-- billing/tenant mutation could complete with NO audit trail and nobody
-- would know. This table is the "fail-recorded" durable record: when the
-- primary audit_logs insert fails (and the call site isn't classified
-- fail-closed), the original payload + error is recorded here instead of
-- being lost, so it can be inspected/replayed later.
--
-- See 30_Knowledge/errors/audit_log_write_best_effort_silent_loss.md and
-- instruction 2026-07-13_084_saas_builder_audit_log_fail_recorded.md.
CREATE TABLE IF NOT EXISTS audit_log_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  error_message TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_failures_tenant ON audit_log_failures(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_failures_unresolved
  ON audit_log_failures(created_at DESC)
  WHERE resolved = false;
