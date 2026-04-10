-- =============================================
-- Enable RLS on ALL tables + tenant-scoped policies
-- Strategy: tenant isolation via tenant_users membership check
-- =============================================

-- Helper: check if current user belongs to a tenant
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(t_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE tenant_id = t_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

-- ============================================================
-- 1. tenants
-- ============================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenants"
  ON public.tenants FOR SELECT
  USING (public.user_belongs_to_tenant(id));

CREATE POLICY "Owner can update tenant"
  ON public.tenants FOR UPDATE
  USING (owner_user_id = auth.uid());

-- ============================================================
-- 2. users
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

-- ============================================================
-- 3. tenant_users (membership / RBAC)
-- ============================================================
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view co-members"
  ON public.tenant_users FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Users can insert own membership"
  ON public.tenant_users FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own membership"
  ON public.tenant_users FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- 4. projects
-- ============================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view projects"
  ON public.projects FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (public.user_belongs_to_tenant(tenant_id) AND created_by = auth.uid());

CREATE POLICY "Tenant members can update projects"
  ON public.projects FOR UPDATE
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can delete projects"
  ON public.projects FOR DELETE
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 5. blueprints (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view blueprints"
  ON public.blueprints FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = blueprints.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can create blueprints"
  ON public.blueprints FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = blueprints.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ) AND created_by = auth.uid());

CREATE POLICY "Tenant members can update blueprints"
  ON public.blueprints FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = blueprints.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- 6. generated_modules (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.generated_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view generated_modules"
  ON public.generated_modules FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generated_modules.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can manage generated_modules"
  ON public.generated_modules FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generated_modules.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- 7. billing_products
-- ============================================================
ALTER TABLE public.billing_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view billing_products"
  ON public.billing_products FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can manage billing_products"
  ON public.billing_products FOR ALL
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 8. billing_prices
-- ============================================================
ALTER TABLE public.billing_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view billing_prices"
  ON public.billing_prices FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can manage billing_prices"
  ON public.billing_prices FOR ALL
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 9. subscriptions
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Tenant admins can view tenant subscriptions"
  ON public.subscriptions FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 10. affiliates
-- ============================================================
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own affiliate"
  ON public.affiliates FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Tenant members can view affiliates"
  ON public.affiliates FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Users can create own affiliate"
  ON public.affiliates FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 11. referrals
-- ============================================================
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view referrals"
  ON public.referrals FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can manage referrals"
  ON public.referrals FOR ALL
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 12. commissions
-- ============================================================
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view commissions"
  ON public.commissions FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can manage commissions"
  ON public.commissions FOR ALL
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 13. audit_logs
-- ============================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

-- No INSERT/UPDATE/DELETE for users — service_role only

-- ============================================================
-- 14. notifications
-- ============================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (target_user_id = auth.uid());

CREATE POLICY "Tenant members can view tenant notifications"
  ON public.notifications FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 15. contents
-- ============================================================
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view contents"
  ON public.contents FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can manage contents"
  ON public.contents FOR ALL
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 16. membership_plans
-- ============================================================
ALTER TABLE public.membership_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view membership_plans"
  ON public.membership_plans FOR SELECT
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE POLICY "Tenant members can manage membership_plans"
  ON public.membership_plans FOR ALL
  USING (public.user_belongs_to_tenant(tenant_id));

-- ============================================================
-- 17. implementation_runs (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.implementation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view implementation_runs"
  ON public.implementation_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = implementation_runs.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can manage implementation_runs"
  ON public.implementation_runs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = implementation_runs.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- 18. generated_files (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.generated_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view generated_files"
  ON public.generated_files FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generated_files.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can manage generated_files"
  ON public.generated_files FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generated_files.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- 19. generation_runs (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view generation_runs"
  ON public.generation_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generation_runs.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can manage generation_runs"
  ON public.generation_runs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = generation_runs.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- 20. quality_runs (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.quality_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view quality_runs"
  ON public.quality_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = quality_runs.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can manage quality_runs"
  ON public.quality_runs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = quality_runs.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- 21. baseline_promotions (linked via projects.tenant_id)
-- ============================================================
ALTER TABLE public.baseline_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view baseline_promotions"
  ON public.baseline_promotions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = baseline_promotions.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

CREATE POLICY "Tenant members can manage baseline_promotions"
  ON public.baseline_promotions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = baseline_promotions.project_id
      AND public.user_belongs_to_tenant(p.tenant_id)
  ));

-- ============================================================
-- Grant helper function to authenticated role
-- ============================================================
GRANT EXECUTE ON FUNCTION public.user_belongs_to_tenant(uuid) TO authenticated;
