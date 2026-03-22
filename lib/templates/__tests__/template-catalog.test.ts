import { describe, it, expect } from "vitest";
import { TEMPLATE_CATALOG, getCatalogEntry } from "../template-catalog";

describe("TEMPLATE_CATALOG", () => {
  it("has 5 templates", () => {
    expect(TEMPLATE_CATALOG).toHaveLength(5);
  });

  it("all entries have required fields", () => {
    for (const entry of TEMPLATE_CATALOG) {
      expect(entry.templateKey).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.shortDescription).toBeTruthy();
      expect(entry.coreEntities.length).toBeGreaterThan(0);
      expect(["GREEN", "DRAFT"]).toContain(entry.statusBadge);
    }
  });

  it("all entries have unique templateKeys", () => {
    const keys = TEMPLATE_CATALOG.map((e) => e.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("getCatalogEntry", () => {
  it("returns entry for valid key", () => {
    const entry = getCatalogEntry("reservation_saas");
    expect(entry).toBeDefined();
    expect(entry!.label).toContain("予約");
  });

  it("returns undefined for invalid key", () => {
    expect(getCatalogEntry("nonexistent")).toBeUndefined();
  });
});
