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
create table if not exists implementation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  blueprint_id uuid not null references blueprints(id) on delete cascade,
  run_type text not null,
  version int not null default 1,
  status text not null default 'completed',
  prompt_text text,
  output_text text not null,
  output_json jsonb,
  source text not null default 'claude',
  created_at timestamptz not null default now()
);

create index if not exists idx_implementation_runs_project_id
  on implementation_runs(project_id);

create index if not exists idx_implementation_runs_blueprint_id
  on implementation_runs(blueprint_id);

create index if not exists idx_implementation_runs_run_type
  on implementation_runs(run_type);
create table if not exists generated_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  blueprint_id uuid references blueprints(id) on delete set null,
  source_run_id uuid references implementation_runs(id) on delete set null,

  file_category text not null,
  file_path text not null,
  language text not null,
  status text not null default 'generated',

  title text,
  description text,

  content_text text not null,
  content_json jsonb,

  version int not null default 1,
  source text not null default 'claude',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_generated_files_project_id
  on generated_files(project_id);

create index if not exists idx_generated_files_blueprint_id
  on generated_files(blueprint_id);

create index if not exists idx_generated_files_source_run_id
  on generated_files(source_run_id);

create index if not exists idx_generated_files_file_category
  on generated_files(file_category);

create unique index if not exists idx_generated_files_project_path_version
  on generated_files(project_id, file_path, version);
create table if not exists contents (
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

create index if not exists idx_contents_tenant_id
  on contents(tenant_id);

create table if not exists membership_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  price_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_membership_plans_tenant_id
  on membership_plans(tenant_id);
alter table users
  add column if not exists display_name text;

alter table users
  add column if not exists photo_url text;

alter table users
  add column if not exists auth_provider text;

alter table users
  add column if not exists updated_at timestamptz not null default now();

alter table tenants
  add column if not exists owner_user_id uuid references users(id);

create unique index if not exists idx_tenant_users_unique_membership
  on tenant_users(tenant_id, user_id);

create index if not exists idx_tenant_users_role
  on tenant_users(role);
create table if not exists generation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  template_key text not null,
  status text not null default 'running',
  current_step text,
  steps_json jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_generation_runs_project_id
  on generation_runs(project_id);
-- Quality Gate runs: lint / typecheck / playwright 結果を保存
create table if not exists quality_runs (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  generation_run_id uuid references generation_runs(id) on delete set null,
  status        text not null default 'running'
                check (status in ('running','passed','failed','error')),
  checks_json   jsonb not null default '[]',
  summary       text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index idx_quality_runs_project on quality_runs(project_id);
create index idx_quality_runs_generation on quality_runs(generation_run_id);
