-- ============================================================================
-- TENANTS & USERS
-- ============================================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_users_tenant_id ON tenant_users(tenant_id);
CREATE INDEX idx_tenant_users_user_id ON tenant_users(user_id);
CREATE INDEX idx_tenant_users_role ON tenant_users(tenant_id, role);

-- ============================================================================
-- BUSINESS ENTITIES
-- ============================================================================

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_services_tenant_id ON services(tenant_id);
CREATE INDEX idx_services_tenant_active ON services(tenant_id, is_active);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_tenant_id ON customers(tenant_id);
CREATE INDEX idx_customers_tenant_email ON customers(tenant_id, email);
CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX idx_customers_full_name ON customers(tenant_id, full_name);

CREATE TABLE reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  staff_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_datetime_range CHECK (end_datetime > start_datetime)
);

CREATE INDEX idx_reservations_tenant_id ON reservations(tenant_id);
CREATE INDEX idx_reservations_service_id ON reservations(service_id);
CREATE INDEX idx_reservations_customer_id ON reservations(customer_id);
CREATE INDEX idx_reservations_staff_id ON reservations(staff_id);
CREATE INDEX idx_reservations_start_datetime ON reservations(tenant_id, start_datetime);
CREATE INDEX idx_reservations_status ON reservations(tenant_id, status);
CREATE INDEX idx_reservations_staff_datetime ON reservations(staff_id, start_datetime, end_datetime);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's role in tenant
CREATE OR REPLACE FUNCTION get_user_tenant_role(p_tenant_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM tenant_users 
  WHERE tenant_id = p_tenant_id AND user_id = p_user_id
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function to check if user has access to tenant
CREATE OR REPLACE FUNCTION user_has_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM tenant_users 
    WHERE tenant_id = p_tenant_id AND user_id = auth.uid()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Tenants policies
CREATE POLICY tenant_isolation_policy ON tenants
  FOR ALL
  USING (
    EXISTS(
      SELECT 1 FROM tenant_users 
      WHERE tenant_users.tenant_id = tenants.id 
      AND tenant_users.user_id = auth.uid()
    )
  );

-- Users policies
CREATE POLICY users_self_read ON users
  FOR SELECT
  USING (id = auth.uid());

-- Tenant users policies
CREATE POLICY tenant_users_isolation ON tenant_users
  FOR SELECT
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY tenant_users_owner_admin_manage ON tenant_users
  FOR ALL
  USING (
    get_user_tenant_role(tenant_id, auth.uid()) IN ('owner', 'admin')
  );

-- Services policies
CREATE POLICY services_read ON services
  FOR SELECT
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY services_owner_admin_write ON services
  FOR INSERT
  WITH CHECK (
    get_user_tenant_role(tenant_id, auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY services_owner_admin_update ON services
  FOR UPDATE
  USING (
    get_user_tenant_role(tenant_id, auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY services_owner_admin_delete ON services
  FOR DELETE
  USING (
    get_user_tenant_role(tenant_id, auth.uid()) IN ('owner', 'admin')
  );

-- Customers policies
CREATE POLICY customers_read ON customers
  FOR SELECT
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY customers_write ON customers
  FOR INSERT
  WITH CHECK (user_has_tenant_access(tenant_id));

CREATE POLICY customers_update ON customers
  FOR UPDATE
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY customers_delete ON customers
  FOR DELETE
  USING (user_has_tenant_access(tenant_id));

-- Reservations policies
CREATE POLICY reservations_read ON reservations
  FOR SELECT
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY reservations_write ON reservations
  FOR INSERT
  WITH CHECK (user_has_tenant_access(tenant_id));

CREATE POLICY reservations_update ON reservations
  FOR UPDATE
  USING (user_has_tenant_access(tenant_id));

CREATE POLICY reservations_delete ON reservations
  FOR DELETE
  USING (user_has_tenant_access(tenant_id));

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tenant_users_updated_at BEFORE UPDATE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();