import { describe, it, expect } from "vitest";
import { ROLE_PRIORITY, hasRequiredRole } from "../roles";

describe("ROLE_PRIORITY", () => {
  it("owner has highest priority", () => {
    expect(ROLE_PRIORITY.owner).toBeGreaterThan(ROLE_PRIORITY.admin);
  });

  it("admin > affiliate_manager > staff > member", () => {
    expect(ROLE_PRIORITY.admin).toBeGreaterThan(ROLE_PRIORITY.affiliate_manager);
    expect(ROLE_PRIORITY.affiliate_manager).toBeGreaterThan(ROLE_PRIORITY.staff);
    expect(ROLE_PRIORITY.staff).toBeGreaterThan(ROLE_PRIORITY.member);
  });
});

describe("hasRequiredRole", () => {
  it("owner can access everything", () => {
    expect(hasRequiredRole("owner", "owner")).toBe(true);
    expect(hasRequiredRole("owner", "admin")).toBe(true);
    expect(hasRequiredRole("owner", "member")).toBe(true);
  });

  it("admin can access admin and below", () => {
    expect(hasRequiredRole("admin", "admin")).toBe(true);
    expect(hasRequiredRole("admin", "staff")).toBe(true);
    expect(hasRequiredRole("admin", "member")).toBe(true);
  });

  it("admin cannot access owner", () => {
    expect(hasRequiredRole("admin", "owner")).toBe(false);
  });

  it("member can only access member", () => {
    expect(hasRequiredRole("member", "member")).toBe(true);
    expect(hasRequiredRole("member", "staff")).toBe(false);
    expect(hasRequiredRole("member", "admin")).toBe(false);
  });

  it("staff can access staff and member", () => {
    expect(hasRequiredRole("staff", "staff")).toBe(true);
    expect(hasRequiredRole("staff", "member")).toBe(true);
    expect(hasRequiredRole("staff", "admin")).toBe(false);
  });

  it("affiliate_manager can access staff and below", () => {
    expect(hasRequiredRole("affiliate_manager", "staff")).toBe(true);
    expect(hasRequiredRole("affiliate_manager", "admin")).toBe(false);
  });
});
