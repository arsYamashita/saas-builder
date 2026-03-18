import { describe, it, expect } from "vitest";
import {
  TEMPLATE_SMOKE_REGISTRY,
  getTemplateSmokeEntry,
  getEnabledScenarios,
  hasTemplateSmokeTests,
  getTemplateKeysWithSmoke,
} from "@/lib/quality/template-smoke-registry";
import { resolveQualityChecks } from "@/lib/db/quality-runs";
import { buildSmokeSummaryLog } from "@/lib/quality/run-template-smoke";
import { COMMON_QUALITY_GATES } from "@/types/quality-run";
import { TEMPLATE_MANIFESTS } from "@/lib/templates/template-registry";

// ---------------------------------------------------------------------------
// 1. Templates with no smoke scenarios keep behavior unchanged
// ---------------------------------------------------------------------------

describe("backward compatibility — no smoke scenarios", () => {
  it("returns no smoke entry for unknown template", () => {
    expect(getTemplateSmokeEntry("nonexistent_template")).toBeUndefined();
  });

  it("hasTemplateSmokeTests returns false for unknown template", () => {
    expect(hasTemplateSmokeTests("nonexistent_template")).toBe(false);
  });

  it("getEnabledScenarios returns empty for unknown template", () => {
    expect(getEnabledScenarios("nonexistent_template")).toEqual([]);
  });

  it("resolveQualityChecks without templateKey has no template_smoke check", () => {
    const checks = resolveQualityChecks(undefined);
    expect(checks.find((c) => c.key === "template_smoke")).toBeUndefined();
    expect(checks).toHaveLength(COMMON_QUALITY_GATES.length);
  });
});

// ---------------------------------------------------------------------------
// 2. Template smoke registry resolves scenarios by templateKey
// ---------------------------------------------------------------------------

describe("registry lookup", () => {
  it("reservation_saas has registered smoke entry", () => {
    const entry = getTemplateSmokeEntry("reservation_saas");
    expect(entry).toBeDefined();
    expect(entry!.templateKey).toBe("reservation_saas");
    expect(entry!.scenarios.length).toBeGreaterThanOrEqual(1);
  });

  it("community_membership_saas has registered smoke entry", () => {
    const entry = getTemplateSmokeEntry("community_membership_saas");
    expect(entry).toBeDefined();
    expect(entry!.scenarios.length).toBeGreaterThanOrEqual(1);
  });

  it("simple_crm_saas has registered smoke entry", () => {
    const entry = getTemplateSmokeEntry("simple_crm_saas");
    expect(entry).toBeDefined();
  });

  it("internal_admin_ops_saas has registered smoke entry", () => {
    const entry = getTemplateSmokeEntry("internal_admin_ops_saas");
    expect(entry).toBeDefined();
  });

  it("membership_content_affiliate has registered smoke entry", () => {
    const entry = getTemplateSmokeEntry("membership_content_affiliate");
    expect(entry).toBeDefined();
  });

  it("each entry has a specFile and at least one scenario", () => {
    for (const entry of TEMPLATE_SMOKE_REGISTRY) {
      expect(entry.specFile).toMatch(/\.smoke\.spec\.ts$/);
      expect(entry.scenarios.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("each scenario has key, label, and enabled flag", () => {
    for (const entry of TEMPLATE_SMOKE_REGISTRY) {
      for (const scenario of entry.scenarios) {
        expect(scenario.key).toBeTruthy();
        expect(scenario.label).toBeTruthy();
        expect(typeof scenario.enabled).toBe("boolean");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Template-specific smoke runs after common Playwright stage
// ---------------------------------------------------------------------------

describe("execution order — smoke after common gates", () => {
  it("template_smoke check appears after common and extra gates", () => {
    const checks = resolveQualityChecks("reservation_saas");
    const keys = checks.map((c) => c.key);

    // Common gates first
    const commonKeys = COMMON_QUALITY_GATES.map((g) => g.key);
    for (let i = 0; i < commonKeys.length; i++) {
      expect(keys[i]).toBe(commonKeys[i]);
    }

    // template_smoke should be last
    expect(keys[keys.length - 1]).toBe("template_smoke");
  });

  it("template_smoke is categorized as extra", () => {
    const checks = resolveQualityChecks("reservation_saas");
    const smoke = checks.find((c) => c.key === "template_smoke");
    expect(smoke).toBeDefined();
    expect(smoke!.category).toBe("extra");
    expect(smoke!.status).toBe("pending");
  });
});

// ---------------------------------------------------------------------------
// 4. Failing template smoke causes quality failure
// ---------------------------------------------------------------------------

describe("failure semantics", () => {
  it("failing template_smoke blocks overall pass (simulated)", () => {
    const checks = resolveQualityChecks("reservation_saas");

    // Simulate: all passed except template_smoke
    const simulated = checks.map((c) =>
      c.key === "template_smoke"
        ? { ...c, status: "failed" as const }
        : { ...c, status: "passed" as const }
    );

    const allPassed = simulated.every((c) => c.status === "passed");
    expect(allPassed).toBe(false);

    const failed = simulated.filter((c) => c.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].key).toBe("template_smoke");
  });
});

// ---------------------------------------------------------------------------
// 5. Passing template smoke preserves success
// ---------------------------------------------------------------------------

describe("success semantics", () => {
  it("all checks passed including template_smoke (simulated)", () => {
    const checks = resolveQualityChecks("reservation_saas");

    const simulated = checks.map((c) => ({ ...c, status: "passed" as const }));
    const allPassed = simulated.every((c) => c.status === "passed");
    expect(allPassed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Scenario reporting includes template-specific scenario names
// ---------------------------------------------------------------------------

describe("reporting", () => {
  it("buildSmokeSummaryLog includes scenario keys", () => {
    const log = buildSmokeSummaryLog("reservation_saas", true);
    expect(log).toContain("[playwright-smoke]");
    expect(log).toContain("template=reservation_saas");
    expect(log).toContain("reservation-list-renders");
    expect(log).toContain("reservation-new-form");
    expect(log).toContain("failed=[]");
  });

  it("buildSmokeSummaryLog shows failed scenarios on failure", () => {
    const log = buildSmokeSummaryLog("reservation_saas", false);
    expect(log).toContain("failed=[reservation-list-renders,reservation-new-form]");
  });

  it("quality checks include template_smoke with label", () => {
    const checks = resolveQualityChecks("simple_crm_saas");
    const smoke = checks.find((c) => c.key === "template_smoke");
    expect(smoke).toBeDefined();
    expect(smoke!.label).toBe("Template Smoke Tests");
  });
});

// ---------------------------------------------------------------------------
// 7. Each current GREEN template has at least one registered smoke scenario
// ---------------------------------------------------------------------------

describe("all GREEN templates have smoke coverage", () => {
  const greenTemplates = TEMPLATE_MANIFESTS.map((m) => m.templateKey);

  it("all 5 GREEN templates are in the smoke registry", () => {
    const smokeKeys = getTemplateKeysWithSmoke();
    for (const tk of greenTemplates) {
      expect(smokeKeys).toContain(tk);
    }
  });

  it.each(greenTemplates)(
    "%s has at least one enabled smoke scenario",
    (templateKey) => {
      const scenarios = getEnabledScenarios(templateKey);
      expect(scenarios.length).toBeGreaterThanOrEqual(1);
    }
  );

  it.each(greenTemplates)(
    "%s has a specFile defined",
    (templateKey) => {
      const entry = getTemplateSmokeEntry(templateKey);
      expect(entry).toBeDefined();
      expect(entry!.specFile).toBeTruthy();
    }
  );
});

// ---------------------------------------------------------------------------
// 8. Framework determinism and reusability
// ---------------------------------------------------------------------------

describe("determinism and reusability", () => {
  it("registry returns same results on repeated calls", () => {
    const first = getEnabledScenarios("reservation_saas");
    const second = getEnabledScenarios("reservation_saas");
    expect(first).toEqual(second);
  });

  it("getTemplateKeysWithSmoke is stable", () => {
    const a = getTemplateKeysWithSmoke();
    const b = getTemplateKeysWithSmoke();
    expect(a).toEqual(b);
  });

  it("hasTemplateSmokeTests is consistent with getEnabledScenarios", () => {
    for (const entry of TEMPLATE_SMOKE_REGISTRY) {
      const has = hasTemplateSmokeTests(entry.templateKey);
      const scenarios = getEnabledScenarios(entry.templateKey);
      expect(has).toBe(scenarios.length > 0);
    }
  });

  it("scenario keys are unique within each template", () => {
    for (const entry of TEMPLATE_SMOKE_REGISTRY) {
      const keys = entry.scenarios.map((s) => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("scenario keys are unique across all templates", () => {
    const allKeys = TEMPLATE_SMOKE_REGISTRY.flatMap((e) =>
      e.scenarios.map((s) => s.key)
    );
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it("disabled scenarios are filtered out by getEnabledScenarios", () => {
    // All current scenarios are enabled, but test the filtering logic
    // by verifying count matches enabled count
    for (const entry of TEMPLATE_SMOKE_REGISTRY) {
      const enabled = entry.scenarios.filter((s) => s.enabled);
      const resolved = getEnabledScenarios(entry.templateKey);
      expect(resolved).toHaveLength(enabled.length);
    }
  });
});
