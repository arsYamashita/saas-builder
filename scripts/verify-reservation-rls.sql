-- ============================================================
-- reservation_saas RLS Policy Verification Script
-- ============================================================
-- Run in Supabase SQL Editor to verify all RLS policies
-- Prerequisites: At least one tenant with owner/admin/staff users
-- ============================================================

-- Step 0: Setup test data
-- (Run only if test data doesn't exist)
/*
INSERT INTO tenants (id, name, slug, owner_user_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Tenant', 'test-tenant', auth.uid());

INSERT INTO tenant_users (tenant_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', auth.uid(), 'owner');
*/

-- ============================================================
-- Step 1: Verify all RLS is enabled
-- ============================================================
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants', 'tenant_users', 'services', 'customers',
    'reservations', 'activity_logs', 'subscriptions'
  )
ORDER BY tablename;
-- Expected: rowsecurity = true for ALL 7 tables

-- ============================================================
-- Step 2: List all RLS policies
-- ============================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual IS NOT NULL AS has_using,
  with_check IS NOT NULL AS has_with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants', 'tenant_users', 'services', 'customers',
    'reservations', 'activity_logs', 'subscriptions'
  )
ORDER BY tablename, cmd;
-- Expected: 21 policies total

-- ============================================================
-- Step 3: Policy count per table
-- ============================================================
SELECT
  tablename,
  COUNT(*) AS policy_count,
  string_agg(cmd, ', ' ORDER BY cmd) AS operations
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tenants', 'tenant_users', 'services', 'customers',
    'reservations', 'activity_logs', 'subscriptions'
  )
GROUP BY tablename
ORDER BY tablename;
-- Expected:
--   activity_logs:  2 (INSERT, SELECT)
--   customers:      3 (INSERT, SELECT, UPDATE)
--   reservations:   3 (INSERT, SELECT, UPDATE)
--   services:       3 (INSERT, SELECT, UPDATE)
--   subscriptions:  3 (INSERT, SELECT, UPDATE)
--   tenant_users:   4 (DELETE, INSERT, SELECT, UPDATE)
--   tenants:        3 (INSERT, SELECT, UPDATE)

-- ============================================================
-- Step 4: Verify helper functions exist
-- ============================================================
SELECT
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_tenant_member',
    'has_tenant_role',
    'get_user_role_in_tenant',
    'check_user_permission'
  )
ORDER BY routine_name;
-- Expected: 4 functions, all DEFINER security type

-- ============================================================
-- Step 5: Functional RLS tests (run as each role)
-- ============================================================
-- These tests require setting auth.uid() via Supabase client
-- or using service_role + set_config to simulate users.

-- 5a. Test as OWNER: should see all tenant data
-- Run via Supabase client with owner credentials
-- SELECT count(*) FROM services;        -- should return all tenant services
-- SELECT count(*) FROM customers;       -- should return all tenant customers
-- SELECT count(*) FROM reservations;    -- should return all tenant reservations
-- SELECT count(*) FROM activity_logs;   -- should return all tenant logs
-- SELECT count(*) FROM subscriptions;   -- should return tenant subscription

-- 5b. Test as ADMIN: same as owner for SELECT
-- Run via Supabase client with admin credentials
-- SELECT count(*) FROM services;        -- should return all tenant services
-- SELECT count(*) FROM customers;       -- should return all tenant customers
-- SELECT count(*) FROM reservations;    -- should return all tenant reservations
-- SELECT count(*) FROM activity_logs;   -- should return all tenant logs
-- SELECT count(*) FROM subscriptions;   -- should return tenant subscription

-- 5c. Test as STAFF: restricted access
-- Run via Supabase client with staff credentials
-- SELECT count(*) FROM services;        -- should return all tenant services (read ok)
-- SELECT count(*) FROM customers;       -- should return all tenant customers (read ok)
-- SELECT count(*) FROM reservations;    -- should return ONLY staff_id=auth.uid() rows
-- SELECT count(*) FROM activity_logs;   -- should return 0 (no access)
-- SELECT count(*) FROM subscriptions;   -- should return 0 (no access)

-- 5d. Test cross-tenant isolation
-- Run as user NOT in target tenant
-- SELECT count(*) FROM services WHERE tenant_id = '<other_tenant_id>';
-- Expected: 0 (tenant isolation enforced)

-- ============================================================
-- Step 6: Reservation status flow check
-- ============================================================
-- Verify CHECK constraint allows all valid statuses
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'reservations'::regclass
  AND contype = 'c';
-- Expected: status IN ('pending', 'confirmed', 'completed', 'cancelled')
-- Expected: end_time > start_time

-- ============================================================
-- Step 7: Permission function verification
-- ============================================================
-- Test check_user_permission for each role
-- Replace UUIDs with actual test user/tenant IDs

-- Owner: full access
-- SELECT check_user_permission('<owner_uid>', '<tenant_id>', 'services:read');     -- true
-- SELECT check_user_permission('<owner_uid>', '<tenant_id>', 'settings:write');    -- true
-- SELECT check_user_permission('<owner_uid>', '<tenant_id>', 'users:write');       -- true

-- Admin: no settings:write, no users:write
-- SELECT check_user_permission('<admin_uid>', '<tenant_id>', 'services:read');     -- true
-- SELECT check_user_permission('<admin_uid>', '<tenant_id>', 'settings:write');    -- false
-- SELECT check_user_permission('<admin_uid>', '<tenant_id>', 'users:write');       -- false

-- Staff: limited access
-- SELECT check_user_permission('<staff_uid>', '<tenant_id>', 'services:read');     -- true
-- SELECT check_user_permission('<staff_uid>', '<tenant_id>', 'reservations:write');-- true
-- SELECT check_user_permission('<staff_uid>', '<tenant_id>', 'services:write');    -- false
-- SELECT check_user_permission('<staff_uid>', '<tenant_id>', 'settings:read');     -- false
