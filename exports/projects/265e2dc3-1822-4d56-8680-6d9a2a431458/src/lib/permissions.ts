import { TenantUserRole } from '@/types/database';

export const permissions = {
  'tenant:manage': ['owner'],
  'members:read': ['owner', 'admin'],
  'members:write': ['owner', 'admin'],
  'plans:read': ['owner', 'admin', 'member'],
  'plans:write': ['owner'],
  'contents:read': ['owner', 'admin', 'member'],
  'contents:write': ['owner', 'admin'],
  'contents:delete': ['owner', 'admin'],
  'comments:write': ['owner', 'admin', 'member'],
  'affiliates:read': ['owner', 'admin'],
  'affiliates:read_own': ['owner', 'admin', 'member'],
  'commissions:approve': ['owner', 'admin'],
  'billing:manage': ['owner'],
  'subscription:read_own': ['owner', 'admin', 'member'],
  'subscription:manage_own': ['owner', 'admin', 'member'],
  'profile:write': ['owner', 'admin', 'member'],
} as const;

export type Permission = keyof typeof permissions;

export function hasPermission(
  userRole: TenantUserRole,
  permission: Permission
): boolean {
  return permissions[permission].includes(userRole);
}

export async function requirePermission(
  tenantId: string,
  userId: string,
  permission: Permission
) {
  const tenantUser = await getTenantUser(tenantId, userId);
  
  if (!tenantUser || !hasPermission(tenantUser.role, permission)) {
    throw new Error('Forbidden: Insufficient permissions');
  }
  
  return tenantUser;
}

// This would be implemented with actual database query
async function getTenantUser(tenantId: string, userId: string) {
  // Implementation placeholder
  return null;
}