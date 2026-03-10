import { TenantRole } from './database';

export type ResourceType = 'customer' | 'deal' | 'task' | 'note' | 'user' | 'tenant' | 'dashboard';
export type Action = 'read' | 'create' | 'update' | 'delete';
export type Scope = 'all' | 'own';

export interface Permission {
  resource: ResourceType;
  action: Action;
  scope: Scope;
}

export interface PermissionCheck {
  resource: ResourceType;
  action: Action;
  resourceOwnerId?: string;
}

export interface UserPermissions {
  role: TenantRole;
  userId: string;
  tenantId: string;
  can: (check: PermissionCheck) => boolean;
}

export const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  owner: [
    { resource: 'customer', action: 'read', scope: 'all' },
    { resource: 'customer', action: 'create', scope: 'all' },
    { resource: 'customer', action: 'update', scope: 'all' },
    { resource: 'customer', action: 'delete', scope: 'all' },
    { resource: 'deal', action: 'read', scope: 'all' },
    { resource: 'deal', action: 'create', scope: 'all' },
    { resource: 'deal', action: 'update', scope: 'all' },
    { resource: 'deal', action: 'delete', scope: 'all' },
    { resource: 'task', action: 'read', scope: 'all' },
    { resource: 'task', action: 'create', scope: 'all' },
    { resource: 'task', action: 'update', scope: 'all' },
    { resource: 'task', action: 'delete', scope: 'all' },
    { resource: 'note', action: 'read', scope: 'all' },
    { resource: 'note', action: 'create', scope: 'all' },
    { resource: 'note', action: 'update', scope: 'all' },
    { resource: 'note', action: 'delete', scope: 'all' },
    { resource: 'user', action: 'read', scope: 'all' },
    { resource: 'user', action: 'create', scope: 'all' },
    { resource: 'user', action: 'update', scope: 'all' },
    { resource: 'user', action: 'delete', scope: 'all' },
    { resource: 'tenant', action: 'read', scope: 'all' },
    { resource: 'tenant', action: 'update', scope: 'all' },
    { resource: 'tenant', action: 'delete', scope: 'all' },
    { resource: 'dashboard', action: 'read', scope: 'all' },
  ],
  admin: [
    { resource: 'customer', action: 'read', scope: 'all' },
    { resource: 'customer', action: 'create', scope: 'all' },
    { resource: 'customer', action: 'update', scope: 'all' },
    { resource: 'customer', action: 'delete', scope: 'all' },
    { resource: 'deal', action: 'read', scope: 'all' },
    { resource: 'deal', action: 'create', scope: 'all' },
    { resource: 'deal', action: 'update', scope: 'all' },
    { resource: 'deal', action: 'delete', scope: 'all' },
    { resource: 'task', action: 'read', scope: 'all' },
    { resource: 'task', action: 'create', scope: 'all' },
    { resource: 'task', action: 'update', scope: 'all' },
    { resource: 'task', action: 'delete', scope: 'all' },
    { resource: 'note', action: 'read', scope: 'all' },
    { resource: 'note', action: 'create', scope: 'all' },
    { resource: 'note', action: 'update', scope: 'all' },
    { resource: 'note', action: 'delete', scope: 'all' },
    { resource: 'user', action: 'read', scope: 'all' },
    { resource: 'user', action: 'create', scope: 'all' },
    { resource: 'user', action: 'update', scope: 'all' },
    { resource: 'user', action: 'delete', scope: 'all' },
    { resource: 'tenant', action: 'read', scope: 'all' },
    { resource: 'tenant', action: 'update', scope: 'all' },
    { resource: 'dashboard', action: 'read', scope: 'all' },
  ],
  member: [
    { resource: 'customer', action: 'read', scope: 'all' },
    { resource: 'customer', action: 'create', scope: 'all' },
    { resource: 'customer', action: 'update', scope: 'own' },
    { resource: 'customer', action: 'delete', scope: 'own' },
    { resource: 'deal', action: 'read', scope: 'all' },
    { resource: 'deal', action: 'create', scope: 'all' },
    { resource: 'deal', action: 'update', scope: 'own' },
    { resource: 'deal', action: 'delete', scope: 'own' },
    { resource: 'task', action: 'read', scope: 'all' },
    { resource: 'task', action: 'create', scope: 'all' },
    { resource: 'task', action: 'update', scope: 'own' },
    { resource: 'task', action: 'delete', scope: 'own' },
    { resource: 'note', action: 'read', scope: 'all' },
    { resource: 'note', action: 'create', scope: 'all' },
  ],
};