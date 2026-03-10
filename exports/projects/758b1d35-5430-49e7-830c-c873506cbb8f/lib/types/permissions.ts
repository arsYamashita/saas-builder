import { UserRole } from './database';

export type PermissionAction =
  | 'contents:read'
  | 'contents:write'
  | 'contents:delete'
  | 'comments:write'
  | 'comments:delete'
  | 'members:read'
  | 'members:write'
  | 'members:suspend'
  | 'plans:read'
  | 'plans:write'
  | 'subscription:read'
  | 'subscription:cancel'
  | 'affiliates:generate_link'
  | 'affiliates:read'
  | 'affiliates:payout'
  | 'settings:write'
  | 'analytics:read';

export const PERMISSIONS: Record<PermissionAction, UserRole[]> = {
  'contents:read': ['owner', 'admin', 'member'],
  'contents:write': ['owner', 'admin'],
  'contents:delete': ['owner', 'admin'],
  'comments:write': ['owner', 'admin', 'member'],
  'comments:delete': ['owner', 'admin', 'member'],
  'members:read': ['owner', 'admin'],
  'members:write': ['owner'],
  'members:suspend': ['owner', 'admin'],
  'plans:read': ['owner', 'admin', 'member'],
  'plans:write': ['owner'],
  'subscription:read': ['owner', 'admin', 'member'],
  'subscription:cancel': ['owner', 'admin', 'member'],
  'affiliates:generate_link': ['owner', 'admin', 'member'],
  'affiliates:read': ['owner', 'admin', 'member'],
  'affiliates:payout': ['owner'],
  'settings:write': ['owner'],
  'analytics:read': ['owner', 'admin'],
};

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  return PERMISSIONS[action]?.includes(role) ?? false;
}

export interface TenantContext {
  user: {
    id: string;
    email: string;
  };
  tenantId: string;
  role: UserRole;
}