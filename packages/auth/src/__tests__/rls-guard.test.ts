import { describe, it, expect } from "vitest";
import { assertTenantScopedRow } from "../rls-guard";

describe("assertTenantScopedRow", () => {
  it("returns the row when tenant_id matches", () => {
    const row = { id: "1", tenant_id: "tenant-a" };
    expect(assertTenantScopedRow(row, "tenant-a")).toBe(row);
  });

  it("throws when the row is null (not found)", () => {
    expect(() => assertTenantScopedRow(null, "tenant-a")).toThrow(/not found/i);
  });

  it("throws when the row is undefined (not found)", () => {
    expect(() => assertTenantScopedRow(undefined, "tenant-a")).toThrow(
      /not found/i
    );
  });

  it("throws (does not leak the row) when tenant_id does not match — IDOR guard", () => {
    const row = { id: "1", tenant_id: "tenant-b" };
    expect(() => assertTenantScopedRow(row, "tenant-a")).toThrow(/not found/i);
  });

  it("uses a custom not-found message when provided", () => {
    expect(() =>
      assertTenantScopedRow(null, "tenant-a", "Project not found")
    ).toThrow("Project not found");
  });
});
