-- ============================================================================
-- Migration 0017: idempotency_keys — backing table for @saas/idempotency
--
-- Instruction: 2026-07-17_116_saas_idempotency_shared_package.md
--
-- Backs packages/idempotency's IdempotencyStore (see src/store.ts for the
-- full atomicity rationale). Consolidates the recurring "retry / concurrent
-- execution double-runs a side effect" root pattern documented across
-- multiple error-KB entries into one reviewed table + package instead of a
-- bespoke fix per call site: [[stripe_recurring_subscription_missing_conflict_guard]],
-- [[cron_owner_digest_no_idempotency]], [[affiliate_commission_idempotency_missing]],
-- [[redis_nx_lock_ttl_too_short]].
--
-- Design notes:
--
--   * PRIMARY KEY (scope, key) is the actual idempotency guarantee — not
--     an incidental index. `scope` MUST be tenant-derived at every call
--     site where `key` is client-supplied (see packages/idempotency
--     README.md "Tenant isolation"); the DB enforces that two different
--     scopes can never collide on the same row even if two tenants happen
--     to choose the identical `Idempotency-Key` header value.
--   * `token` is a per-claim fencing token (see
--     packages/idempotency/src/types.ts ClaimOutcome["own"].token doc):
--     `complete`/`release` only mutate a row if the caller's token still
--     matches, so a caller whose TTL lapsed mid-flight (and was
--     legitimately reclaimed by someone else) can never clobber the new
--     owner's in-flight claim with its own stale result.
--   * This table is written exclusively by the service-role client (via
--     @saas/idempotency's Supabase store adapter) — no end-user or
--     tenant-facing code path touches it directly. RLS is enabled as
--     defense-in-depth per docs/rules/08-db-rules.md ("Row Level
--     Security (mandatory)") with deliberately ZERO policies, following
--     the same posture as commissions_duplicates_backup
--     (0015_commissions_idempotency.sql): no policy means every command
--     is denied by default for anon/authenticated roles, while the
--     service_role key (which bypasses RLS entirely) is unaffected.
--   * No cleanup job ships in this migration — see
--     packages/idempotency/README.md "Retention" for the operational
--     follow-up (periodic delete of rows past `expires_at`).
-- ============================================================================

-- Written exclusively by the service-role client (@saas/idempotency's
-- Supabase store adapter) — no end-user or tenant-facing code path
-- touches this table directly. RLS is enabled below as defense-in-depth
-- with deliberately ZERO policies (same posture as
-- commissions_duplicates_backup, 0015_commissions_idempotency.sql): no
-- policy means every command is denied by default for
-- anon/authenticated roles, while service_role (which bypasses RLS
-- entirely) is unaffected.
-- rls-exempt: service-role-only backing store for @saas/idempotency, deliberately zero client-facing policies (defense-in-depth deny-by-default, same posture as commissions_duplicates_backup) — not an oversight.
create table if not exists idempotency_keys (
  scope text not null,
  key text not null,
  token text not null,
  status text not null check (status in ('processing', 'completed')),
  response_status int,
  response_body jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (scope, key)
);

comment on table idempotency_keys is
  '@saas/idempotency shared package backing store. Written exclusively by '
  'the service-role client (packages/idempotency/src/store.ts). scope MUST '
  'be tenant-derived wherever key is client-supplied — see '
  'packages/idempotency/README.md "Tenant isolation".';

comment on column idempotency_keys.token is
  'Per-claim fencing token: complete()/release() only mutate a row when '
  'the caller-supplied token still matches, preventing a stale (reclaimed) '
  'caller from clobbering the new owner''s in-flight claim.';

comment on column idempotency_keys.expires_at is
  'While status=processing: when this claim is considered abandoned and '
  'may be reclaimed. After status=completed: retained for replay until an '
  'operational cleanup job prunes it (see README "Retention") — not '
  'auto-expired by Postgres.';

-- Supports the reclaim-a-stale-claim query
-- (WHERE status = 'processing' AND expires_at < now()) and a future
-- cleanup job's (WHERE expires_at < now()) scan.
create index if not exists idx_idempotency_keys_status_expires_at
  on idempotency_keys (status, expires_at);

-- docs/rules/08: every table created by a migration MUST enable RLS.
-- Zero policies defined below is intentional (service-role-only access —
-- see table comment above), not an oversight.
alter table idempotency_keys enable row level security;
