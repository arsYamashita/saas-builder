-- Fixes [[tenant_creation_non_transactional_orphan]] (high):
-- app/api/projects/route.ts POST previously ran the tenants -> tenant_users
-- -> projects INSERTs as three separate, unguarded round-trips. The
-- tenant_users INSERT's error was not even checked, so a failure there
-- (e.g. a transient connection blip, or a future NOT NULL/FK addition)
-- left an orphan tenants row with no tenant_users row pointing at it. The
-- creating user then hit GET /api/projects (which resolves the caller's
-- tenant via tenant_users) and saw an empty project list forever, with no
-- error and no way to recover — the tenant existed but was unreachable.
--
-- Fix: collapse all three INSERTs into one plpgsql function invoked via a
-- single supabase.rpc() call. A function body executes as part of the
-- caller's single statement/transaction, so if the tenant_users or
-- projects INSERT raises, every INSERT already performed inside this
-- function (including the tenants row) is rolled back automatically —
-- there is no code path that can leave a tenants row without its
-- tenant_users owner row.
--
-- SECURITY DEFINER + fixed search_path: this function must run as its
-- (migration-owning, RLS-bypassing) owner regardless of caller role, and
-- must not be hijackable via a hostile search_path
-- ([[supabase_default_acl_function_revoke_public_insufficient]]).
--
-- SERVICE-ROLE ONLY — this is a privileged, server-side-only RPC. It is
-- invoked exclusively from app/api/projects/route.ts via the service-role
-- admin client (createAdminClient -> createAdminSupabaseClient, which uses
-- SUPABASE_SERVICE_ROLE_KEY; see packages/auth/src/clients/admin.ts). The
-- function takes `p_user_id` as a *parameter* and does NOT (and cannot,
-- under service_role where auth.uid() is null) verify it against the
-- caller's own auth.uid(); the API route is the trust boundary that binds
-- the row to the authenticated user (requireCurrentUser()).
--
-- Therefore it must NEVER be executable by `authenticated`/`anon`: a
-- logged-in client calling this RPC directly could forge an arbitrary
-- `p_user_id` and mint an owner membership / project for another user
-- (privilege escalation / IDOR). The revoke/grant below closes that path
-- by granting execute to `service_role` only. (Codex gpt-5.5 P1,
-- 2026-07-08.)

create or replace function public.create_tenant_with_owner(
  p_name text,
  p_slug text,
  p_user_id uuid,
  p_template_key text,
  p_industry text default null,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  tenant_id uuid,
  name text,
  industry text,
  template_key text,
  status text,
  description text,
  metadata_json jsonb,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_project_id uuid;
begin
  if p_user_id is null then
    raise exception 'create_tenant_with_owner: p_user_id is required'
      using errcode = 'P0001';
  end if;

  begin
    insert into tenants (name, slug, plan_type, status)
    values (p_name, p_slug, 'starter', 'active')
    returning tenants.id into v_tenant_id;

    insert into tenant_users (tenant_id, user_id, role, status)
    values (v_tenant_id, p_user_id, 'owner', 'active');

    insert into projects (
      tenant_id, name, industry, template_key, status,
      description, metadata_json, created_by
    )
    values (
      v_tenant_id, p_name, coalesce(p_industry, p_template_key), p_template_key,
      'draft', p_description, coalesce(p_metadata, '{}'::jsonb), p_user_id
    )
    returning projects.id into v_project_id;
  exception
    when others then
      -- Rollback of the tenants/tenant_users/projects rows above happens
      -- automatically: this whole block runs inside the single statement
      -- the caller issued (the supabase.rpc() call), and plpgsql
      -- propagates the error rather than swallowing it, so Postgres aborts
      -- and undoes every write this function made. We re-raise a generic,
      -- caller-safe error (never the raw constraint/column text) so the
      -- route handler can surface a clean 500 without an error-leak
      -- audit finding (see docs/testing/error-leak-surfaces.md).
      raise exception 'create_tenant_with_owner: tenant creation failed'
        using errcode = 'P0001';
  end;

  return query
  select
    p.id, p.tenant_id, p.name, p.industry, p.template_key, p.status,
    p.description, p.metadata_json, p.created_by, p.created_at, p.updated_at
  from projects p
  where p.id = v_project_id;
end;
$$;

-- Least privilege: revoke the implicit PUBLIC execute grant every new
-- function gets, and also explicitly revoke from `authenticated`/`anon`
-- (belt-and-suspenders — PUBLIC covers them, but naming them documents the
-- intent and survives a future blanket grant to authenticated). Then grant
-- execute to `service_role` only
-- ([[supabase_default_acl_function_revoke_public_insufficient]]).
--
-- Rationale (Codex gpt-5.5 P1): this RPC trusts its `p_user_id` argument,
-- so only the trusted server (service-role admin client in
-- app/api/projects/route.ts) may call it. A logged-in `authenticated`
-- client must NOT be able to invoke it directly and forge an owner
-- membership for an arbitrary user id.
--
-- The `revoke from public` is unconditional (the PUBLIC pseudo-role always
-- exists and already covers anon/authenticated). The Supabase-specific
-- roles (`authenticated`, `anon`, `service_role`) are NOT guaranteed to
-- exist on a plain/local Postgres, so — following the same `pg_roles`
-- existence guard the repo already uses in
-- 0014_restore_unapplied_tables.sql — each per-role statement is wrapped
-- in a role-exists check so this migration applies cleanly on both
-- Supabase and vanilla Postgres (Codex gpt-5.5 P2, 2026-07-08).
revoke all on function public.create_tenant_with_owner(
  text, text, uuid, text, text, text, jsonb
) from public;

do $$
begin
  -- Explicit least-privilege revokes (redundant with the PUBLIC revoke
  -- above, kept for intent + future-proofing); skipped where absent.
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.create_tenant_with_owner(
      text, text, uuid, text, text, text, jsonb
    ) from authenticated;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.create_tenant_with_owner(
      text, text, uuid, text, text, text, jsonb
    ) from anon;
  end if;

  -- The one role that MAY execute this RPC — the trusted server.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_tenant_with_owner(
      text, text, uuid, text, text, text, jsonb
    ) to service_role;
  end if;
end $$;
