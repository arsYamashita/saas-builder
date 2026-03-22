import { describe, it, expect } from "vitest";
import { normalizeBlueprint } from "../blueprint-normalizer";
import type { Blueprint } from "@/types/blueprint";

const makeBlueprint = (overrides: Partial<Blueprint> = {}): Blueprint => ({
  product_summary: { name: "Test", problem: "P", target: "T", category: "C" },
  entities: [{ name: "User", description: "user", main_fields: [{ name: "email", type: "text", required: true }] }],
  screens: [{ name: "Dashboard", purpose: "main", role_access: ["admin"] }],
  roles: [{ name: "admin", description: "admin" }],
  permissions: [{ role: "admin", allowed_actions: ["read", "write"] }],
  billing: { enabled: true, model: "subscription" },
  affiliate: { enabled: false },
  events: ["signup"],
  kpis: ["MRR"],
  assumptions: ["SaaS"],
  mvp_scope: ["auth"],
  future_scope: ["analytics"],
  ...overrides,
});

describe("normalizeBlueprint", () => {
  it("normalizes admin role", () => {
    const bp = normalizeBlueprint(makeBlueprint({ roles: [{ name: "Admin" }] }));
    expect(bp.roles[0].name).toBe("admin");
  });

  it("normalizes administrator to admin", () => {
    const bp = normalizeBlueprint(makeBlueprint({ roles: [{ name: "Administrator" }] }));
    expect(bp.roles[0].name).toBe("admin");
  });

  it("normalizes owner role", () => {
    const bp = normalizeBlueprint(makeBlueprint({ roles: [{ name: "  Owner  " }] }));
    expect(bp.roles[0].name).toBe("owner");
  });

  it("normalizes staff and manager", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      roles: [{ name: "Staff" }, { name: "Manager" }],
    }));
    expect(bp.roles[0].name).toBe("staff");
    expect(bp.roles[1].name).toBe("staff");
  });

  it("normalizes member/user/customer to member", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      roles: [{ name: "User" }, { name: "Customer" }, { name: "Member" }],
    }));
    expect(bp.roles.every((r) => r.name === "member")).toBe(true);
  });

  it("normalizes affiliate-admin to affiliate_manager", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      roles: [{ name: "affiliate-admin" }],
    }));
    expect(bp.roles[0].name).toBe("affiliate_manager");
  });

  it("keeps unknown roles lowercased and trimmed", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      roles: [{ name: "  SuperHero  " }],
    }));
    expect(bp.roles[0].name).toBe("superhero");
  });

  it("normalizes permission roles", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      permissions: [{ role: "Administrator", allowed_actions: ["read"] }],
    }));
    expect(bp.permissions[0].role).toBe("admin");
  });

  it("normalizes entity names to lowercase trimmed", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      entities: [{ name: "  UserProfile  ", description: "d", main_fields: [] }],
    }));
    expect(bp.entities[0].name).toBe("userprofile");
  });

  it("normalizes screen names to lowercase trimmed", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      screens: [{ name: "  Admin Panel  ", purpose: "p", role_access: ["admin"] }],
    }));
    expect(bp.screens[0].name).toBe("admin panel");
  });

  it("normalizes screen role_access", () => {
    const bp = normalizeBlueprint(makeBlueprint({
      screens: [{ name: "dash", purpose: "p", role_access: ["Administrator", "User"] }],
    }));
    expect(bp.screens[0].role_access).toEqual(["admin", "member"]);
  });

  it("preserves non-role/name fields", () => {
    const bp = normalizeBlueprint(makeBlueprint());
    expect(bp.billing.enabled).toBe(true);
    expect(bp.events).toEqual(["signup"]);
    expect(bp.kpis).toEqual(["MRR"]);
  });
});
