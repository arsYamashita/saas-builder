-- ============================================================
-- RLS + tenant isolation migration template
-- ============================================================
-- Copy the relevant section(s) below into a new numbered migration under
-- supabase/migrations/ whenever a new table is added, in this app or in
-- any generated template (see docs/rules/08-db-rules.md, "Row Level
-- Security (mandatory)").
--
-- Supabase RLS is opt-in, not opt-out: a table with RLS disabled (the
-- default) is readable/writable by any authenticated user via the anon
-- key exposed in the client bundle. See [[supabase_rls_missing]],
-- [[supabase_rls_enable_migration_missing]].
--
-- Pick ONE of the two patterns below depending on how the app talks to
-- Supabase. Do not skip both and ship a table with RLS enabled but zero
-- policies "for now" — an unpoliced table silently denies everything,
-- which usually gets "fixed" later with a `USING (true)` policy that
-- defeats RLS entirely. See [[supabase_rls_policy_too_permissive]].
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- PATTERN A — service-role app, RLS as defense-in-depth
-- ────────────────────────────────────────────────────────────
-- Use when the app always reads/writes through a service-role client
-- (createAdminClient()) and enforces tenant boundaries in the application
-- layer (e.g. lib/auth/current-user.ts). RLS here exists only to stop a
-- leaked NEXT_PUBLIC_SUPABASE_ANON_KEY + a valid user session from
-- reading other tenants' rows directly via PostgREST.
--
-- This is the pattern used by this repo's own
-- supabase/migrations/0012_enable_rls_tenant_isolation.sql.

-- helper (create once per project, reuse across migrations):
-- create or replace function public.current_user_tenant_ids()
-- returns setof uuid
-- language sql
-- security definer
-- stable
-- set search_path = public
-- as $$
--   select tenant_id
--   from tenant_users
--   where user_id = auth.uid()
--     and status = 'active';
-- $$;

alter table {{table_name}} enable row level security;

create policy {{table_name}}_select_tenant
  on {{table_name}}
  for select
  using (tenant_id in (select public.current_user_tenant_ids()));

-- Deliberately no insert/update/delete policy: all writes go through the
-- service-role client, which bypasses RLS. A missing policy for a command
-- means that command is denied by default for anon/authenticated roles —
-- this is intentional, not an oversight.


-- ────────────────────────────────────────────────────────────
-- PATTERN B — client-facing app, RLS as primary enforcement
-- ────────────────────────────────────────────────────────────
-- Use when browser/mobile clients query Supabase directly with the
-- user's session (no service-role client in the request path), e.g. a
-- multi-role membership/community app. RLS is the actual access control,
-- not a backstop, so it needs real per-role policies.
--
-- This is the pattern used by
-- templates/community_membership_saas/supabase/migrations/00002_rls.sql.

-- helper (create once per project, reuse across migrations):
-- create or replace function public.is_tenant_member(p_tenant_id uuid)
-- returns boolean as $$
--   select exists(
--     select 1 from memberships
--     where tenant_id = p_tenant_id
--       and user_id = auth.uid()
--       and status = 'active'
--   );
-- $$ language sql security definer stable;

alter table {{table_name}} enable row level security;

create policy {{table_name}}_select_member
  on {{table_name}}
  for select
  using (public.is_tenant_member(tenant_id));

create policy {{table_name}}_insert_member
  on {{table_name}}
  for insert
  with check (public.is_tenant_member(tenant_id));

create policy {{table_name}}_update_own
  on {{table_name}}
  for update
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- Add a role-gated variant (has_role(tenant_id, 'admin') etc.) for
-- mutations that should not be available to every member.


-- ────────────────────────────────────────────────────────────
-- Storage buckets — separate from table RLS
-- ────────────────────────────────────────────────────────────
-- storage.objects has its own RLS, independent of the RLS on your
-- Postgres tables. A bucket created with `public: true` (or with no
-- storage.objects policy) is world-readable regardless of table RLS.
-- See [[supabase_storage_bucket_policy_missing]].

-- update storage.buckets set public = false where id = '{{bucket_name}}';
--
-- create policy "{{bucket_name}}_tenant_isolation"
-- on storage.objects for all
-- using (
--   bucket_id = '{{bucket_name}}'
--   and (storage.foldername(name))[1] = (
--     select tenant_id::text from tenant_users
--     where user_id = auth.uid() and status = 'active'
--     limit 1
--   )
-- );
--
-- Store objects under a `{tenant_id}/...` path prefix so the policy above
-- can scope on it.


-- ────────────────────────────────────────────────────────────
-- Idempotency constraints for webhook/cron-populated tables
-- ────────────────────────────────────────────────────────────
-- Any table populated by a webhook (Stripe, etc.), cron job, or other
-- at-least-once-delivery event source needs a DB-level UNIQUE constraint
-- on the natural idempotency key, so a duplicate delivery can be upserted
-- (`onConflict`) or safely ignored instead of inserting a second row.
-- See [[affiliate_commission_idempotency_missing]],
-- [[stripe_recurring_subscription_missing_conflict_guard]],
-- [[cron_owner_digest_no_idempotency]].

-- example: Stripe-driven subscriptions table
-- alter table subscriptions
--   add constraint subscriptions_stripe_subscription_id_key
--   unique (stripe_subscription_id);

-- example: a table keyed by (tenant_id, external_event_id) rather than a
-- single global column
-- alter table {{table_name}}
--   add constraint {{table_name}}_tenant_event_unique
--   unique (tenant_id, external_event_id);
