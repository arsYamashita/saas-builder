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
