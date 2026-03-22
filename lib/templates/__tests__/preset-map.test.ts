import { describe, it, expect } from "vitest";
import { PRESET_MAP, getPreset } from "../preset-map";

describe("PRESET_MAP", () => {
  it("has all 5 template presets", () => {
    expect(Object.keys(PRESET_MAP)).toHaveLength(5);
    expect(PRESET_MAP).toHaveProperty("membership_content_affiliate");
    expect(PRESET_MAP).toHaveProperty("reservation_saas");
    expect(PRESET_MAP).toHaveProperty("simple_crm_saas");
    expect(PRESET_MAP).toHaveProperty("community_membership_saas");
    expect(PRESET_MAP).toHaveProperty("internal_admin_ops_saas");
  });

  it("each preset has a templateKey", () => {
    for (const [key, preset] of Object.entries(PRESET_MAP)) {
      expect(preset.templateKey).toBe(key);
    }
  });
});

describe("getPreset", () => {
  it("returns preset for valid key", () => {
    const p = getPreset("reservation_saas");
    expect(p).toBeDefined();
    expect(p!.templateKey).toBe("reservation_saas");
  });

  it("returns undefined for unknown key", () => {
    expect(getPreset("nonexistent")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getPreset("")).toBeUndefined();
  });
});
