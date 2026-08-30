-- audit_log_failures was added after 0012_enable_rls_tenant_isolation.sql,
-- so it missed that migration's blanket RLS enablement. Apply the same
-- tenant-scoped SELECT policy here (defense-in-depth against the anon/
-- authenticated PostgREST path — service-role app access is unaffected,
-- see 0012's header comment for the full rationale). Writes stay
-- service-role-only by omission, same as audit_logs.
do $$
begin
  if to_regclass('public.audit_log_failures') is not null then
    execute 'alter table audit_log_failures enable row level security';
    execute 'drop policy if exists audit_log_failures_select_tenant on audit_log_failures';
    execute 'create policy audit_log_failures_select_tenant on audit_log_failures for select using (tenant_id in (select public.current_user_tenant_ids()))';
  end if;
end $$;
