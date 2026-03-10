import { TenantRole } from './database';

export type ResourceType = 'services' | 'customers' | 'reservations' | 'staff' | 'tenant';
export type ActionType = 'read' | 'create' | 'update' | 'delete' | 'invite' | 'manage';

export interface PermissionCheck {
  tenantId: string;
  userId: string;
  resource: ResourceType;
  action: ActionType;
}

export type PermissionMatrix = Record<TenantRole, Record<ResourceType, ActionType[]>>;

export const PERMISSIONS: PermissionMatrix = {
  owner: {
    services: ['read', 'create', 'update', 'delete'],
    customers: ['read', 'create', 'update', 'delete'],
    reservations: ['read', 'create', 'update', 'delete'],
    staff: ['read', 'invite', 'update', 'delete'],
    tenant: ['read', 'update', 'delete']
  },
  admin: {
    services: ['read', 'create', 'update', 'delete'],
    customers: ['read', 'create', 'update', 'delete'],
    reservations: ['read', 'create', 'update', 'delete'],
    staff: ['read', 'invite', 'update', 'delete'],
    tenant: ['read', 'update']
  },
  member: {
    services: ['read'],
    customers: ['read', 'create', 'update', 'delete'],
    reservations: ['read', 'create', 'update', 'delete'],
    staff: ['read'],
    tenant: ['read']
  }
};