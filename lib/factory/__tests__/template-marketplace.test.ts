import { describe, it, expect, beforeEach } from "vitest";
import {
  buildMarketplaceCatalog,
  listMarketplaceItems,
  evaluateMarketplaceEligibility,
  publishTemplate,
  unpublishTemplate,
  markExperimental,
  recordTemplateAdoptionIntent,
  recordTemplateDerivationIntent,
  buildMarketplaceReport,
  formatMarketplaceReport,
  useInMemoryStore,
} from "../template-marketplace";

import type { TemplateCatalogEntry } from "@/lib/templates/template-catalog";
import type { TemplateGovernanceResult } from "@/lib/factory/template-health-governance";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGreenCatalog(templateKey: string, label: string = templateKey): TemplateCatalogEntry {
  return {
    templateKey,
    label,
    shortDescription: `${label} template`,
    targetUsers: "test users",
    coreEntities: ["entity_a", "entity_b"],
    includesBilling: false,
    includesAffiliate: false,
    statusBadge: "GREEN",
    recommendedFor: "test",
  };
}

function makeDraftCatalog(templateKey: string): TemplateCatalogEntry {
  return {
    ...makeGreenCatalog(templateKey),
    statusBadge: "DRAFT",
  };
}

function makeGovernanceResult(
  templateKey: string,
  nextState: string = "green",
  decision: string = "remain_green",
): TemplateGovernanceResult {
  return {
    templateKey,
    currentState: nextState as TemplateGovernanceResult["currentState"],
    nextState: nextState as TemplateGovernanceResult["nextState"],
    decision: decision as TemplateGovernanceResult["decision"],
    reasons: [],
    signals: {
      recentPassCount: 3,
      recentDegradedCount: 0,
      recentFailCount: 0,
      consecutivePassCount: 3,
      consecutiveFailCount: 0,
      latestRegressionStatus: "pass",
      latestBaselinePassed: true,
      latestQualityGatesPassed: true,
      greenCriteriaEligible: true,
    },
    evaluatedAt: "2026-03-16T10:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Setup — use real catalog/governance (defaults to TEMPLATE_CATALOG)
// ---------------------------------------------------------------------------

beforeEach(() => {
  useInMemoryStore();
});

// ---------------------------------------------------------------------------
// 1. Only eligible green templates can be published as production_ready
// ---------------------------------------------------------------------------

describe("publishTemplate — eligibility", () => {
  it("publishes a green template as production_ready", () => {
    const result = publishTemplate("reservation_saas");
    expect(result.success).toBe(true);
    expect(result.status).toBe("published");
    expect(result.reason).toContain("production_ready");
  });

  it("rejects publishing a non-existent template", () => {
    useInMemoryStore({
      catalogOverride: [makeGreenCatalog("reservation_saas")],
      governanceOverride: [makeGovernanceResult("reservation_saas")],
    });

    const result = publishTemplate("nonexistent_saas");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("not found");
  });

  it("rejects publishing a template with at_risk health (not production_ready)", () => {
    // Use a real template so manifest/regConfig exist
    useInMemoryStore({
      governanceOverride: [
        makeGovernanceResult("reservation_saas", "at_risk", "mark_at_risk"),
        ...["membership_content_affiliate", "community_membership_saas", "simple_crm_saas", "internal_admin_ops_saas"]
          .map((k) => makeGovernanceResult(k)),
      ],
    });

    const result = publishTemplate("reservation_saas");
    expect(result.success).toBe(false);
    expect(result.reason).toContain("production_ready");
  });
});

// ---------------------------------------------------------------------------
// 2. Degraded/demoted templates are excluded or limited
// ---------------------------------------------------------------------------

describe("evaluateMarketplaceEligibility — degraded/demoted", () => {
  it("marks degraded template as unavailable", () => {
    useInMemoryStore({
      catalogOverride: [makeGreenCatalog("test_saas")],
      governanceOverride: [makeGovernanceResult("test_saas", "degraded", "mark_degraded")],
    });

    const result = evaluateMarketplaceEligibility("test_saas");
    expect(result.eligible).toBe(false);
    expect(result.maturity).toBe("unavailable");
    expect(result.reasons).toContain("Health state is degraded");
  });

  it("marks demoted template as unavailable", () => {
    useInMemoryStore({
      catalogOverride: [makeGreenCatalog("test_saas")],
      governanceOverride: [makeGovernanceResult("test_saas", "demoted", "demote")],
    });

    const result = evaluateMarketplaceEligibility("test_saas");
    expect(result.eligible).toBe(false);
    expect(result.maturity).toBe("unavailable");
  });

  it("allows at_risk template as experimental", () => {
    // Use a real template so manifest/regConfig exist
    useInMemoryStore({
      governanceOverride: [
        makeGovernanceResult("reservation_saas", "at_risk", "mark_at_risk"),
        ...["membership_content_affiliate", "community_membership_saas", "simple_crm_saas", "internal_admin_ops_saas"]
          .map((k) => makeGovernanceResult(k)),
      ],
    });

    const result = evaluateMarketplaceEligibility("reservation_saas");
    expect(result.eligible).toBe(true);
    expect(result.maturity).toBe("experimental");
  });
});

// ---------------------------------------------------------------------------
// 3. Marketplace catalog builds deterministically
// ---------------------------------------------------------------------------

describe("buildMarketplaceCatalog — determinism", () => {
  it("produces same catalog on repeated calls", () => {
    const c1 = buildMarketplaceCatalog();
    const c2 = buildMarketplaceCatalog();

    expect(c1.length).toBe(c2.length);
    for (let i = 0; i < c1.length; i++) {
      expect(c1[i]!.templateId).toBe(c2[i]!.templateId);
      expect(c1[i]!.status).toBe(c2[i]!.status);
      expect(c1[i]!.healthState).toBe(c2[i]!.healthState);
      expect(c1[i]!.maturity).toBe(c2[i]!.maturity);
    }
  });

  it("includes all catalog entries", () => {
    const items = buildMarketplaceCatalog();
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.map((i) => i.templateId)).toContain("reservation_saas");
    expect(items.map((i) => i.templateId)).toContain("simple_crm_saas");
  });

  it("includes sourceSignals and derivationHints", () => {
    const items = buildMarketplaceCatalog();
    const rsv = items.find((i) => i.templateId === "reservation_saas");
    expect(rsv).toBeDefined();
    expect(rsv!.sourceSignals.governanceState).toBe("green");
    expect(rsv!.sourceSignals.greenEligible).toBe(true);
    expect(rsv!.derivationHints.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Publish/unpublish works correctly
// ---------------------------------------------------------------------------

describe("publish/unpublish", () => {
  it("publishes and then unpublishes a template", () => {
    const pubResult = publishTemplate("reservation_saas");
    expect(pubResult.success).toBe(true);

    const items = listMarketplaceItems({ status: "published" });
    expect(items.map((i) => i.templateId)).toContain("reservation_saas");

    const unpubResult = unpublishTemplate("reservation_saas");
    expect(unpubResult.success).toBe(true);
    expect(unpubResult.status).toBe("unpublished");

    const after = listMarketplaceItems({ status: "published" });
    expect(after.map((i) => i.templateId)).not.toContain("reservation_saas");
  });

  it("published item has publishedAt timestamp", () => {
    publishTemplate("reservation_saas");
    const items = buildMarketplaceCatalog();
    const rsv = items.find((i) => i.templateId === "reservation_saas");
    expect(rsv!.publishedAt).toBeDefined();
    expect(rsv!.publishedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Experimental status works correctly
// ---------------------------------------------------------------------------

describe("markExperimental", () => {
  it("marks an eligible template as experimental", () => {
    const result = markExperimental("reservation_saas");
    expect(result.success).toBe(true);
    expect(result.status).toBe("experimental");

    const items = listMarketplaceItems({ status: "experimental" });
    expect(items.map((i) => i.templateId)).toContain("reservation_saas");
    expect(items[0]!.maturity).toBe("experimental");
  });

  it("rejects marking a degraded template as experimental", () => {
    useInMemoryStore({
      catalogOverride: [makeGreenCatalog("test_saas")],
      governanceOverride: [makeGovernanceResult("test_saas", "degraded", "mark_degraded")],
    });

    const result = markExperimental("test_saas");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Adoption intent is recorded correctly
// ---------------------------------------------------------------------------

describe("recordTemplateAdoptionIntent", () => {
  it("records an adoption intent", () => {
    const intent = recordTemplateAdoptionIntent("reservation_saas", "admin");
    expect(intent.templateId).toBe("reservation_saas");
    expect(intent.action).toBe("adopt_template");
    expect(intent.requestedBy).toBe("admin");
    expect(intent.requestedAt).toBeDefined();
    expect(intent.intentId).toContain("adopt-reservation_saas");
  });

  it("accumulates multiple adoption intents", () => {
    recordTemplateAdoptionIntent("reservation_saas");
    recordTemplateAdoptionIntent("simple_crm_saas");

    const report = buildMarketplaceReport();
    expect(report.adoptionIntents).toHaveLength(2);
    expect(report.summary.adoptionIntentCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Derivation intent is recorded correctly
// ---------------------------------------------------------------------------

describe("recordTemplateDerivationIntent", () => {
  it("records a derivation intent", () => {
    const intent = recordTemplateDerivationIntent(
      "reservation_saas",
      "restaurant_reservation_saas",
      "admin",
    );
    expect(intent.parentTemplateId).toBe("reservation_saas");
    expect(intent.requestedTemplateId).toBe("restaurant_reservation_saas");
    expect(intent.action).toBe("derive_template_intent");
    expect(intent.requestedBy).toBe("admin");
    expect(intent.intentId).toContain("derive-reservation_saas-restaurant_reservation_saas");
  });

  it("accumulates multiple derivation intents", () => {
    recordTemplateDerivationIntent("reservation_saas", "restaurant_reservation_saas");
    recordTemplateDerivationIntent("reservation_saas", "clinic_reservation_saas");

    const report = buildMarketplaceReport();
    expect(report.derivationIntents).toHaveLength(2);
    expect(report.summary.derivationIntentCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 8. List filters work correctly
// ---------------------------------------------------------------------------

describe("listMarketplaceItems — filters", () => {
  it("filters by status", () => {
    publishTemplate("reservation_saas");
    publishTemplate("simple_crm_saas");

    const published = listMarketplaceItems({ status: "published" });
    expect(published.length).toBe(2);
    expect(published.every((i) => i.status === "published")).toBe(true);

    const unpublished = listMarketplaceItems({ status: "unpublished" });
    expect(unpublished.every((i) => i.status === "unpublished")).toBe(true);
  });

  it("filters by domain", () => {
    const items = listMarketplaceItems({ domain: "reservation" });
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((i) => i.domain.includes("reservation"))).toBe(true);
  });

  it("filters by healthState", () => {
    const items = listMarketplaceItems({ healthState: "green" });
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((i) => i.healthState === "green")).toBe(true);
  });

  it("filters by maturity", () => {
    publishTemplate("reservation_saas");
    const production = listMarketplaceItems({ maturity: "production_ready" });
    expect(production.length).toBeGreaterThanOrEqual(1);
    expect(production.every((i) => i.maturity === "production_ready")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Report and formatting
// ---------------------------------------------------------------------------

describe("buildMarketplaceReport", () => {
  it("produces summary counts", () => {
    publishTemplate("reservation_saas");
    markExperimental("simple_crm_saas");
    recordTemplateAdoptionIntent("reservation_saas");
    recordTemplateDerivationIntent("reservation_saas", "restaurant_reservation_saas");

    const report = buildMarketplaceReport();
    expect(report.summary.totalItems).toBeGreaterThanOrEqual(5);
    expect(report.summary.publishedCount).toBe(1);
    expect(report.summary.experimentalCount).toBe(1);
    expect(report.summary.adoptionIntentCount).toBe(1);
    expect(report.summary.derivationIntentCount).toBe(1);
    expect(report.generatedAt).toBeDefined();
  });
});

describe("formatMarketplaceReport", () => {
  it("produces readable text output", () => {
    publishTemplate("reservation_saas");
    const report = buildMarketplaceReport();
    const text = formatMarketplaceReport(report);

    expect(text).toContain("TEMPLATE MARKETPLACE REPORT");
    expect(text).toContain("[PUBLISHED]");
    expect(text).toContain("reservation_saas");
  });
});

// ---------------------------------------------------------------------------
// 10. Same inputs yield same marketplace catalog
// ---------------------------------------------------------------------------

describe("determinism — full pipeline", () => {
  it("same state produces identical report", () => {
    publishTemplate("reservation_saas");

    const r1 = buildMarketplaceReport();
    const r2 = buildMarketplaceReport();

    expect(r1.items.length).toBe(r2.items.length);
    expect(r1.summary.publishedCount).toBe(r2.summary.publishedCount);
    expect(r1.summary.unpublishedCount).toBe(r2.summary.unpublishedCount);

    for (let i = 0; i < r1.items.length; i++) {
      expect(r1.items[i]!.templateId).toBe(r2.items[i]!.templateId);
      expect(r1.items[i]!.status).toBe(r2.items[i]!.status);
      expect(r1.items[i]!.maturity).toBe(r2.items[i]!.maturity);
    }
  });
});
