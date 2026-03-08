import { Blueprint } from "@/types/blueprint";

function normalizeRole(role: string): string {
  const value = role.trim().toLowerCase();

  if (["owner"].includes(value)) return "owner";
  if (["admin", "administrator"].includes(value)) return "admin";
  if (["staff", "manager"].includes(value)) return "staff";
  if (["member", "user", "customer"].includes(value)) return "member";
  if (["affiliate_manager", "affiliate-admin"].includes(value)) {
    return "affiliate_manager";
  }

  return value;
}

export function normalizeBlueprint(input: Blueprint): Blueprint {
  return {
    ...input,
    roles: input.roles.map((role) => ({
      ...role,
      name: normalizeRole(role.name),
    })),
    permissions: input.permissions.map((permission) => ({
      ...permission,
      role: normalizeRole(permission.role),
    })),
    entities: input.entities.map((entity) => ({
      ...entity,
      name: entity.name.trim().toLowerCase(),
    })),
    screens: input.screens.map((screen) => ({
      ...screen,
      name: screen.name.trim().toLowerCase(),
      role_access: screen.role_access.map(normalizeRole),
    })),
  };
}
