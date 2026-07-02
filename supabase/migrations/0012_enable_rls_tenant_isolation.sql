-- ローンチ前セキュリティ対応: 全 public テーブルに RLS を有効化し、
-- テナント境界を強制する（[[supabase_rls_missing]] / [[supabase_rls_enable_migration_missing]] 対応）。
--
-- 背景:
-- アプリケーションは lib/db/supabase/admin.ts の service-role クライアントで
-- 全 DB アクセスを行っており、テナント分離は application layer
-- (lib/auth/current-user.ts の requireProjectAccess 等) で担保している。
-- service-role キーは常に RLS をバイパスするため、以下のポリシーは
-- アプリの通常動作には一切影響しない。
--
-- 目的は defense-in-depth: NEXT_PUBLIC_SUPABASE_ANON_KEY はクライアントバンドルに
-- 露出しているため、有効なセッション JWT を持つユーザーが Supabase の
-- REST API (PostgREST) に直接アクセスした場合、RLS が無効だと
-- 他テナントの全データが読めてしまう。これを塞ぐ。
--
-- 書き込み系ポリシーは意図的に追加しない: アプリの insert/update/delete は
-- 全て service-role 経由のため、anon/authenticated ロールからの直接書き込みは
-- ポリシー不在によりデフォルトで拒否される（RLS はポリシーが無いコマンドを暗黙 deny する）。
--
-- デプロイ後の検証手順（PR 説明にも記載）:
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' order by tablename;
--   -> 全行で rowsecurity = true になっていること

-- ========== ヘルパー関数 ==========
-- SECURITY DEFINER のため、内部の tenant_users / projects への問い合わせは
-- テーブル所有者権限で実行され RLS を経由しない（再帰ポリシーを避けるため必須）。

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id
  from tenant_users
  where user_id = auth.uid()
    and status = 'active';
$$;

create or replace function public.current_user_project_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
  from projects
  where tenant_id in (select public.current_user_tenant_ids());
$$;

-- ========== tenant_id を直接持つテーブル ==========
do $$
declare
  t text;
begin
  foreach t in array array[
    'billing_products', 'billing_prices', 'subscriptions',
    'affiliates', 'referrals', 'commissions', 'audit_logs',
    'notifications', 'contents', 'membership_plans', 'projects'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists %I on %I', t || '_select_tenant', t);
      execute format(
        'create policy %I on %I for select using (tenant_id in (select public.current_user_tenant_ids()))',
        t || '_select_tenant', t
      );
    end if;
  end loop;
end $$;

-- ========== tenants テーブル自体（id で判定） ==========
do $$
begin
  if to_regclass('public.tenants') is not null then
    execute 'alter table tenants enable row level security';
    execute 'drop policy if exists tenants_select_own on tenants';
    execute 'create policy tenants_select_own on tenants for select using (id in (select public.current_user_tenant_ids()))';
  end if;
end $$;

-- ========== project_id 経由でテナントに紐づくテーブル ==========
do $$
declare
  t text;
begin
  foreach t in array array[
    'blueprints', 'generated_modules', 'implementation_runs',
    'generated_files', 'generation_runs', 'quality_runs', 'baseline_promotions'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists %I on %I', t || '_select_tenant', t);
      execute format(
        'create policy %I on %I for select using (project_id in (select public.current_user_project_ids()))',
        t || '_select_tenant', t
      );
    end if;
  end loop;
end $$;

-- ========== users / tenant_users（特殊ケース） ==========
do $$
begin
  if to_regclass('public.users') is not null then
    execute 'alter table users enable row level security';
    execute 'drop policy if exists users_select_self on users';
    execute 'create policy users_select_self on users for select using (id = auth.uid())';
  end if;
end $$;

do $$
begin
  if to_regclass('public.tenant_users') is not null then
    execute 'alter table tenant_users enable row level security';
    execute 'drop policy if exists tenant_users_select_own_tenant on tenant_users';
    execute 'create policy tenant_users_select_own_tenant on tenant_users for select using (tenant_id in (select public.current_user_tenant_ids()))';
  end if;
end $$;
