export const PERMISSIONS = {
  'subscription_plans:read': ['owner', 'admin'],
  'subscription_plans:write': ['owner'],
  'subscriptions:read': ['owner', 'admin'],
  'contents:read': ['owner', 'admin', 'member'],
  'contents:write': ['owner', 'admin'],
  'members:read': ['owner', 'admin'],
  'members:write': ['owner'],
  'affiliates:read': ['owner', 'admin', 'member'],
  'affiliates:write': ['owner', 'admin', 'member'],
  'commissions:read': ['owner', 'admin'],
  'commissions:write': ['owner'],
  'tenant_settings:write': ['owner'],
  'analytics:read': ['owner', 'admin'],
} as const;

export type Role = 'owner' | 'admin' | 'member';
export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(
  role: Role,
  permission: Permission
): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function requirePermission(
  role: Role,
  permission: Permission
): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}