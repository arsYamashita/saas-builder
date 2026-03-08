-- =============================================
-- SaaS Builder: Initial Schema Migration
-- Common Core + First Domain (membership_content_affiliate)
-- =============================================

-- ========== COMMON CORE ==========

-- Tenants
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid not null,
  plan_type text not null default 'starter',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Users
create table users (
  id uuid primary key,
  email text unique not null,
  display_name text,
  photo_url text,
  auth_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tenant Users (multi-tenant membership + RBAC)
create table tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  invited_by uuid,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_tenant_users_tenant_id on tenant_users(tenant_id);
create index idx_tenant_users_user_id on tenant_users(user_id);

-- Projects (Builder側)
create table projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  industry text not null,
  template_key text not null,
  status text not null default 'draft',
  description text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Blueprints
create table blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version int not null default 1,
  prd_json jsonb not null,
  entities_json jsonb not null,
  screens_json jsonb not null,
  roles_json jsonb not null,
  billing_json jsonb not null,
  affiliate_json jsonb not null,
  kpi_json jsonb not null,
  raw_prompt text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Generated Modules
create table generated_modules (
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

-- ========== BILLING (Stripe) ==========

-- Billing Products
create table billing_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  stripe_product_id text unique,
  name text not null,
  product_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Billing Prices
create table billing_prices (
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

-- Subscriptions
create table subscriptions (
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

-- ========== AFFILIATE ==========

-- Affiliates
create table affiliates (
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
create unique index idx_affiliates_tenant_code on affiliates(tenant_id, code);

-- Referrals
create table referrals (
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

-- Commissions
create table commissions (
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

-- ========== OPERATIONS ==========

-- Audit Logs
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text not null,
  before_json jsonb,
  after_json jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Notifications
create table notifications (
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

-- ========== DOMAIN: MEMBERSHIP + CONTENT ==========

-- Contents
create table contents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  body text,
  content_type text not null default 'article',
  visibility text not null default 'members',
  published boolean not null default false,
  published_at timestamptz,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_contents_tenant_id on contents(tenant_id);

-- Membership Plans
create table membership_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  price_id uuid references billing_prices(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
