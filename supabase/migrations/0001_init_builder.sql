create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_user_id uuid,
  plan_type text not null default 'starter',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key,
  email text unique not null,
  display_name text,
  photo_url text,
  auth_provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tenant_users (
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

create index if not exists idx_tenant_users_tenant_id on tenant_users(tenant_id);
create index if not exists idx_tenant_users_user_id on tenant_users(user_id);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  name text not null,
  industry text not null,
  template_key text not null,
  status text not null default 'draft',
  description text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_tenant_id on projects(tenant_id);
create index if not exists idx_projects_template_key on projects(template_key);

create table if not exists blueprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  version int not null default 1,
  prd_json jsonb not null,
  entities_json jsonb not null,
  screens_json jsonb not null,
  roles_json jsonb not null,
  permissions_json jsonb not null default '[]'::jsonb,
  billing_json jsonb not null,
  affiliate_json jsonb not null,
  kpi_json jsonb not null default '[]'::jsonb,
  assumptions_json jsonb not null default '[]'::jsonb,
  events_json jsonb not null default '[]'::jsonb,
  mvp_scope_json jsonb not null default '[]'::jsonb,
  future_scope_json jsonb not null default '[]'::jsonb,
  raw_prompt text,
  source text not null default 'gemini',
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_blueprints_project_id on blueprints(project_id);
