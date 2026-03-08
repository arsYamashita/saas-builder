import { AppRole } from "@/types/roles";

export const ROLE_PRIORITY: Record<AppRole, number> = {
  owner: 100,
  admin: 80,
  affiliate_manager: 70,
  staff: 60,
  member: 10,
};

export function hasRequiredRole(userRole: AppRole, requiredRole: AppRole) {
  return ROLE_PRIORITY[userRole] >= ROLE_PRIORITY[requiredRole];
}
