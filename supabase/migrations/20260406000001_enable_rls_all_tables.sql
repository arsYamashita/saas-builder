-- =============================================
-- Migration: 20260406000001_enable_rls_all_tables
-- Verify and harden RLS on all tables.
--
-- Context:
--   0012_enable_rls.sql covers the original 21 tables.
--   0013_stripe_webhook_events.sql covers stripe_webhook_events.
--   This migration adds any tables introduced after 0012 that
--   may be missing RLS, and tightens policies to prevent
--   accidental USING(true) open-access patterns.
-- =============================================

-- ============================================================
-- Re-verify stripe_webhook_events
-- (defined in 0013 but repeated here as a guard)
-- The USING(false)/WITH CHECK(false) policy ensures
-- authenticated users cannot read or write this table.
-- service_role bypasses RLS entirely.
-- ============================================================
ALTER TABLE IF EXISTS public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to make the intent explicit
DROP POLICY IF EXISTS "service_role_only" ON public.stripe_webhook_events;

CREATE POLICY "deny_all_authenticated"
  ON public.stripe_webhook_events
  AS RESTRICTIVE
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- Helper function: ensure it is marked SECURITY DEFINER
-- and search_path is pinned to prevent privilege escalation.
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(t_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = t_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_belongs_to_tenant(uuid) TO authenticated;

-- ============================================================
-- Confirm all expected tables have RLS enabled.
-- These are idempotent — safe to run on an already-configured DB.
-- ============================================================
ALTER TABLE IF EXISTS public.tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.blueprints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.generated_modules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.billing_products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.billing_prices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscriptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.affiliates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.commissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.membership_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.implementation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.generated_files    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.generation_runs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.quality_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.baseline_promotions ENABLE ROW LEVEL SECURITY;
