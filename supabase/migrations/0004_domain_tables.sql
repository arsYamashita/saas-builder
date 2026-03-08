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
