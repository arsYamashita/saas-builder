-- =====================================================================
-- 0014: 本番に一度も適用されなかった定義の復元（schema drift 修復）
--
-- 背景（2026-07-06 発覚、KB: [[migration_edited_after_apply_schema_drift]]）:
-- supabase migration list 上は 00001〜0012 が全て「適用済み」だが、
-- 本番実テーブルと突き合わせた結果、以下がファイルに存在するのに
-- 本番に存在しないことが判明した:
--
--   (a) 00001_initial_schema.sql の 8 テーブル
--       billing_products, billing_prices, subscriptions,
--       affiliates, referrals, commissions,
--       generated_modules, notifications
--       → 00001 は「適用済み」マークの後にファイルが拡張されており、
--         本番の実スキーマは 0001〜0007 系の内容と一致する
--         （projects.metadata_json の存在、membership_plans.price_id が
--         text であること等から実証）。
--   (b) 0008_blueprint_review_status.sql の blueprints.review_status /
--       reviewed_at 列
--   (c) 0009_generation_run_metadata.sql の generation_runs 6 列
--   (d) 0010_baseline_promotions.sql の baseline_promotions テーブル
--       （0008〜0010 は履歴上「適用済み」だが実行痕跡が無い）
--
-- 教訓: 適用済み migration の事後編集・履歴だけの repair は
-- 「ファイルと本番の静かな乖離」を生む。適用後の migration は不変とし、
-- 変更は必ず新番号で行う。
--
-- この migration は全体を冪等（再実行安全）に書いている。
-- 既に定義が存在する環境（combined snapshot から作ったローカル等）でも
-- 二重作成エラーは起きない。
--
-- 注意: 0015_commissions_idempotency.sql（旧 0013。本番未適用のため
-- リネームで番号を後ろへ移動）は commissions テーブルの存在を前提と
-- するため、本 migration は必ずそれより前の番号でなければならない。
-- =====================================================================

create extension if not exists pgcrypto;

-- ========== (a-1) BILLING (Stripe) — 00001 の定義を忠実に復元 ==========

create table if not exists billing_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  stripe_product_id text unique,
  name text not null,
  product_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_prices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references billing_products(id) on delete cascade,
  stripe_price_id text unique,
  amount integer not null,
  currency text not null default 'jpy',
  interval text,
  interval_count integer,
  trial_days integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  price_id uuid references billing_prices(id),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== (a-2) AFFILIATE ==========

create table if not exists affiliates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  code text not null,
  commission_type text not null,
  commission_value numeric not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_affiliates_tenant_code
  on affiliates(tenant_id, code);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  visitor_token text,
  referred_user_id uuid references users(id),
  first_clicked_at timestamptz,
  converted_at timestamptz,
  status text not null default 'clicked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  affiliate_id uuid not null references affiliates(id) on delete cascade,
  referral_id uuid references referrals(id),
  subscription_id uuid references subscriptions(id),
  amount integer not null,
  currency text not null default 'jpy',
  status text not null default 'pending',
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== (a-3) BUILDER / OPERATIONS ==========

create table if not exists generated_modules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  module_type text not null,
  module_key text not null,
  status text not null default 'pending',
  source_blueprint_version int not null,
  output_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  type text not null,
  channel text not null,
  target_user_id uuid references users(id),
  payload_json jsonb not null,
  status text not null default 'queued',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========== (b) 0008 の未適用列: blueprints ==========

alter table blueprints
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz;

-- ========== (c) 0009 の未適用列: generation_runs ==========

alter table generation_runs
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists review_status text not null default 'pending',
  add column if not exists reviewed_at timestamptz,
  add column if not exists promoted_at timestamptz,
  add column if not exists baseline_tag text;

-- ========== (d) 0010 の未適用テーブル: baseline_promotions ==========

create table if not exists baseline_promotions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  generation_run_id uuid not null references generation_runs(id) on delete cascade,
  template_key text not null,
  baseline_tag text not null,
  version_label text not null,
  status text not null default 'draft',
  promoted_at timestamptz not null default now(),
  promoted_by uuid
);

create index if not exists idx_baseline_promotions_project
  on baseline_promotions(project_id);
create index if not exists idx_baseline_promotions_template
  on baseline_promotions(template_key);

-- ========== RLS（0012_enable_rls_tenant_isolation.sql と同一方針） ==========
-- 0012 は to_regclass ガード付きだったため、当時存在しなかった上記
-- テーブルには RLS が付与されていない。ここで同じパターンを再適用する。
-- ヘルパー関数 current_user_tenant_ids / current_user_project_ids は
-- 0012 で作成済み（本番に存在することを確認済み）。

-- tenant_id を直接持つテーブル
do $$
declare
  t text;
begin
  foreach t in array array[
    'billing_products', 'billing_prices', 'subscriptions',
    'affiliates', 'referrals', 'commissions', 'notifications'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select_tenant', t);
    execute format(
      'create policy %I on %I for select using (tenant_id in (select public.current_user_tenant_ids()))',
      t || '_select_tenant', t
    );
  end loop;
end $$;

-- project_id 経由でテナントに紐づくテーブル
do $$
declare
  t text;
begin
  foreach t in array array['generated_modules', 'baseline_promotions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select_tenant', t);
    execute format(
      'create policy %I on %I for select using (project_id in (select public.current_user_project_ids()))',
      t || '_select_tenant', t
    );
  end loop;
end $$;

-- ========== GRANT（本番の既存テーブルと同一の権限形） ==========
-- Supabase の default privileges でも同等の grant が付くが、
-- 実行環境（プレーン Postgres でのローカル検証等）に依存しないよう
-- 明示的に揃える。ロールが存在しない環境ではスキップ（冪等）。

do $$
declare
  r text;
  t text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = r) then
      foreach t in array array[
        'billing_products', 'billing_prices', 'subscriptions',
        'affiliates', 'referrals', 'commissions',
        'generated_modules', 'notifications', 'baseline_promotions'
      ]
      loop
        execute format('grant all on table %I to %I', t, r);
      end loop;
    end if;
  end loop;
end $$;
