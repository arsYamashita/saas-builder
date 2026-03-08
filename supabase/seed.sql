-- Seed data for development

-- Default roles reference (enforced in application layer)
-- owner, admin, staff, member, affiliate_manager

-- Demo tenant
insert into tenants (id, name, slug, plan_type, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Demo Tenant', 'demo-tenant', 'starter', 'active')
on conflict do nothing;

-- Demo membership plan
insert into membership_plans (id, tenant_id, name, description, status)
values
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Standard Plan',
    'Demo plan',
    'active'
  )
on conflict do nothing;

-- Demo affiliate
insert into affiliates (
  id,
  tenant_id,
  user_id,
  code,
  commission_type,
  commission_value,
  status
)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'demo-affiliate',
  'percentage',
  20,
  'active'
)
on conflict do nothing;
