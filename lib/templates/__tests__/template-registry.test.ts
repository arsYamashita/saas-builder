import { describe, it, expect } from "vitest";
import {
  TEMPLATE_MANIFESTS,
  TEMPLATE_REGISTRY,
  SUPPORTED_TEMPLATE_KEYS,
  getTemplateEntry,
  isSupportedTemplate,
  getTemplateOptions,
  getTemplateShortName,
  getRegisteredTemplateKeys,
} from "../template-registry";

const EXPECTED_KEYS = [
  "membership_content_affiliate",
  "reservation_saas",
  "community_membership_saas",
  "simple_crm_saas",
  "internal_admin_ops_saas",
];

describe("TEMPLATE_MANIFESTS", () => {
  it("contains exactly 5 templates", () => {
    expect(TEMPLATE_MANIFESTS).toHaveLength(5);
  });

  it("has unique templateKeys", () => {
    const keys = TEMPLATE_MANIFESTS.map((m) => m.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique shortNames", () => {
    const shorts = TEMPLATE_MANIFESTS.map((m) => m.shortName);
    expect(new Set(shorts).size).toBe(shorts.length);
  });

  it("every manifest has required paths", () => {
    for (const m of TEMPLATE_MANIFESTS) {
      expect(m.finalPromptDir).toBeTruthy();
      expect(m.rulesRoot).toBeTruthy();
      expect(m.fixturePath).toBeTruthy();
      expect(m.baselineDocPath).toBeTruthy();
      expect(m.baselineJsonPath).toBeTruthy();
      expect(m.presetModule).toBeTruthy();
      expect(m.prefixPrompt).toBeTruthy();
    }
  });

  it("every manifest has all 5 prompt kinds", () => {
    for (const m of TEMPLATE_MANIFESTS) {
      for (const kind of ["blueprint", "schema", "api", "ui", "file_split"] as const) {
        expect(m.finalPrompts[kind]).toBeTruthy();
      }
    }
  });
});

describe("TEMPLATE_REGISTRY", () => {
  it("is indexed by all expected keys", () => {
    for (const key of EXPECTED_KEYS) {
      expect(TEMPLATE_REGISTRY[key]).toBeDefined();
    }
  });

  it("matches TEMPLATE_MANIFESTS entries", () => {
    for (const m of TEMPLATE_MANIFESTS) {
      expect(TEMPLATE_REGISTRY[m.templateKey]).toBe(m);
    }
  });
});

describe("SUPPORTED_TEMPLATE_KEYS", () => {
  it("contains all expected keys", () => {
    for (const key of EXPECTED_KEYS) {
      expect(SUPPORTED_TEMPLATE_KEYS).toContain(key);
    }
  });
});

describe("getTemplateEntry", () => {
  it("returns manifest for valid key", () => {
    const entry = getTemplateEntry("reservation_saas");
    expect(entry.templateKey).toBe("reservation_saas");
    expect(entry.shortName).toBe("rsv");
  });

  it("throws for unknown key", () => {
    expect(() => getTemplateEntry("nonexistent")).toThrow("Unsupported template_key");
  });
});

describe("isSupportedTemplate", () => {
  it("returns true for registered key", () => {
    expect(isSupportedTemplate("community_membership_saas")).toBe(true);
  });

  it("returns false for unknown key", () => {
    expect(isSupportedTemplate("unknown")).toBe(false);
  });
});

describe("getTemplateOptions", () => {
  it("returns array of key-label pairs", () => {
    const options = getTemplateOptions();
    expect(options).toHaveLength(TEMPLATE_MANIFESTS.length);
    for (const opt of options) {
      expect(opt.key).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });
});

describe("getTemplateShortName", () => {
  it("returns short name for registered key", () => {
    expect(getTemplateShortName("membership_content_affiliate")).toBe("mca");
    expect(getTemplateShortName("internal_admin_ops_saas")).toBe("iao");
  });

  it("returns truncated key for unknown key", () => {
    const result = getTemplateShortName("unknown_key");
    expect(result).toBe("unknow");
  });
});

describe("getRegisteredTemplateKeys", () => {
  it("returns non-empty tuple", () => {
    const keys = getRegisteredTemplateKeys();
    expect(keys.length).toBeGreaterThan(0);
  });

  it("contains all expected keys", () => {
    const keys = getRegisteredTemplateKeys();
    for (const key of EXPECTED_KEYS) {
      expect(keys).toContain(key);
    }
  });
});

describe("regression/compare paths", () => {
  it("all templates have non-empty regressionCommand and compareScriptPath", () => {
    for (const m of TEMPLATE_MANIFESTS) {
      expect(m.regressionCommand).toBeTruthy();
      expect(m.compareScriptPath).toBeTruthy();
    }
  });
});
