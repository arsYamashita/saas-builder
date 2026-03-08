import { AppRole } from "@/types/roles";
import { hasRequiredRole } from "@/lib/rbac/roles";
import { getCurrentTenantForUser } from "@/lib/tenant/current-tenant";

export async function requireTenantRole(requiredRole: AppRole) {
  const tenantMembership = await getCurrentTenantForUser();
  const role = tenantMembership.role as AppRole;

  if (!hasRequiredRole(role, requiredRole)) {
    throw new Error("Forbidden");
  }

  return tenantMembership;
}
