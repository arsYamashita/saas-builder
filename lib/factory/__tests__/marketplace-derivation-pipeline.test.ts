import { describe, it, expect, beforeEach } from "vitest";
import {
  collectDerivationIntents,
  evaluateDerivationEligibility,
  classifyDerivationType,
  buildDerivationPlans,
  prepareDerivedTemplateCandidate,
  handoffDerivedCandidates,
  listDerivationHistory,
  buildDerivationReport,
  formatDerivationReport,
  useInMemoryStore,
} from "../marketplace-derivation-pipeline";

import type { MarketplaceItem, DerivationIntent } from "../template-marketplace";
import type { TemplateCatalogEntry } from "@/lib/templates/template-catalog";
import { resolveActorRole } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePublishedItem(
  templateId: string,
  overrides: Partial<MarketplaceItem> = {},
): MarketplaceItem {
  return {
    templateId,
    title: templateId,
    domain: "reservation",
    status: "published",
    healthState: "green",
    maturity: "production_ready",
    description: `${templateId} template`,
    capabilities: ["entity_a", "entity_b"],
    sourceSignals: {
      governanceState: "green",
      regressionStatus: "pass",
      greenEligible: true,
    },
    derivationHints: [],
    publishedAt: "2026-03-16T10:00:00.000Z",
    ...overrides,
  };
}

function makeIntent(
  parentId: string,
  requestedId: string,
  intentId?: string,
): DerivationIntent {
  return {
    intentId: intentId ?? `derive-${parentId}-${requestedId}-1710594600000`,
    parentTemplateId: parentId,
    requestedTemplateId: requestedId,
    action: "derive_template_intent",
    requestedAt: "2026-03-16T10:00:00.000Z",
    requestedBy: "cli",
  };
}

function makeCatalogEntry(templateKey: string): TemplateCatalogEntry {
  return {
    templateKey,
    label: templateKey,
    shortDescription: `${templateKey} template`,
    targetUsers: "test",
    coreEntities: ["entity_a"],
    includesBilling: false,
    includesAffiliate: false,
    statusBadge: "GREEN",
    recommendedFor: "test",
  };
}

function setupEligible(): void {
  useInMemoryStore({
    marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
    derivationIntentsOverride: [
      makeIntent("reservation_saas", "restaurant_reservation_saas"),
    ],
    catalogOverride: [makeCatalogEntry("reservation_saas")],
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useInMemoryStore();
});

// ---------------------------------------------------------------------------
// 1. Only published green production_ready templates are eligible
// ---------------------------------------------------------------------------

describe("evaluateDerivationEligibility — eligible parent", () => {
  it("allows derivation from published green production_ready parent", () => {
    setupEligible();

    const result = evaluateDerivationEligibility(
      "reservation_saas",
      "restaurant_reservation_saas",
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain("published");
    expect(result.reason).toContain("green");
    expect(result.reason).toContain("production_ready");
  });
});

// ---------------------------------------------------------------------------
// 2. Unpublished/experimental/degraded templates are rejected
// ---------------------------------------------------------------------------

describe("evaluateDerivationEligibility — ineligible parents", () => {
  it("rejects unpublished parent", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [
        makePublishedItem("reservation_saas", { status: "unpublished" }),
      ],
      derivationIntentsOverride: [],
      catalogOverride: [],
    });

    const result = evaluateDerivationEligibility(
      "reservation_saas",
      "restaurant_reservation_saas",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("unpublished");
  });

  it("rejects experimental parent", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [
        makePublishedItem("reservation_saas", {
          status: "experimental",
          maturity: "experimental",
        }),
      ],
      derivationIntentsOverride: [],
      catalogOverride: [],
    });

    const result = evaluateDerivationEligibility(
      "reservation_saas",
      "restaurant_reservation_saas",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("experimental");
  });

  it("rejects degraded parent", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [
        makePublishedItem("reservation_saas", {
          healthState: "degraded",
        }),
      ],
      derivationIntentsOverride: [],
      catalogOverride: [],
    });

    const result = evaluateDerivationEligibility(
      "reservation_saas",
      "restaurant_reservation_saas",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("degraded");
  });

  it("rejects non-existent parent", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [],
      derivationIntentsOverride: [],
      catalogOverride: [],
    });

    const result = evaluateDerivationEligibility(
      "nonexistent_saas",
      "derived_saas",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// 3. Duplicate requested template ids are rejected
// ---------------------------------------------------------------------------

describe("evaluateDerivationEligibility — duplicates", () => {
  it("rejects if requested template already exists in catalog", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
      derivationIntentsOverride: [],
      catalogOverride: [
        makeCatalogEntry("reservation_saas"),
        makeCatalogEntry("restaurant_reservation_saas"),
      ],
    });

    const result = evaluateDerivationEligibility(
      "reservation_saas",
      "restaurant_reservation_saas",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already exists in template catalog");
  });

  it("rejects if requested template already processed in history", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
      derivationIntentsOverride: [],
      catalogOverride: [makeCatalogEntry("reservation_saas")],
      history: [
        {
          derivationId: "derive-plan-reservation_saas-to-restaurant_reservation_saas",
          intentId: "old-intent",
          parentTemplateId: "reservation_saas",
          requestedTemplateId: "restaurant_reservation_saas",
          status: "handed_off",
          executedAt: "2026-03-16T09:00:00.000Z",
          executedBy: "admin",
        },
      ],
    });

    const result = evaluateDerivationEligibility(
      "reservation_saas",
      "restaurant_reservation_saas",
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already processed");
  });
});

// ---------------------------------------------------------------------------
// 4. Derivation type classification is deterministic
// ---------------------------------------------------------------------------

describe("classifyDerivationType", () => {
  it("classifies restaurant_reservation_saas as verticalized", () => {
    expect(
      classifyDerivationType("reservation_saas", "restaurant_reservation_saas"),
    ).toBe("verticalized");
  });

  it("classifies salon_crm_saas as specialization", () => {
    // simple_crm_saas → salon_crm_saas: same word count, swaps "simple" for "salon"
    expect(
      classifyDerivationType("simple_crm_saas", "salon_crm_saas"),
    ).toBe("specialization");
  });

  it("classifies course_platform_saas as adjacent_domain from community_membership_saas", () => {
    // No shared core words → adjacent_domain
    expect(
      classifyDerivationType("community_membership_saas", "course_platform_saas"),
    ).toBe("adjacent_domain");
  });

  it("is deterministic across repeated calls", () => {
    const r1 = classifyDerivationType("reservation_saas", "clinic_reservation_saas");
    const r2 = classifyDerivationType("reservation_saas", "clinic_reservation_saas");
    expect(r1).toBe(r2);
    expect(r1).toBe("verticalized");
  });
});

// ---------------------------------------------------------------------------
// 5. Candidate blueprint/schema/api hints are generated correctly
// ---------------------------------------------------------------------------

describe("prepareDerivedTemplateCandidate", () => {
  it("generates known hints for recognized derived template", () => {
    setupEligible();
    const candidate = prepareDerivedTemplateCandidate(
      "reservation_saas",
      "restaurant_reservation_saas",
    );

    expect(candidate.templateId).toBe("restaurant_reservation_saas");
    expect(candidate.parentTemplateId).toBe("reservation_saas");
    expect(candidate.variantType).toBe("verticalized");
    expect(candidate.blueprintHints.length).toBeGreaterThan(0);
    expect(candidate.schemaHints.length).toBeGreaterThan(0);
    expect(candidate.apiHints.length).toBeGreaterThan(0);
    expect(candidate.blueprintHints).toContain("restaurant booking flow");
    expect(candidate.schemaHints).toContain("tables");
  });

  it("generates generic hints for unknown derived template", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
      derivationIntentsOverride: [],
      catalogOverride: [makeCatalogEntry("reservation_saas")],
    });

    const candidate = prepareDerivedTemplateCandidate(
      "reservation_saas",
      "spa_reservation_saas",
    );

    expect(candidate.templateId).toBe("spa_reservation_saas");
    expect(candidate.parentTemplateId).toBe("reservation_saas");
    expect(candidate.blueprintHints.length).toBeGreaterThan(0);
    expect(candidate.blueprintHints.some((h) => h.includes("spa reservation"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Eligible derivations are handed off into candidate store
// ---------------------------------------------------------------------------

describe("handoffDerivedCandidates", () => {
  it("hands off eligible derivations into candidate store", () => {
    setupEligible();

    const { prepared, skipped, history } = handoffDerivedCandidates({
      executedBy: "admin",
    });

    expect(prepared).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(history).toHaveLength(1);

    expect(prepared[0]!.status).toBe("handed_off");
    expect(prepared[0]!.derivedCandidate!.templateId).toBe(
      "restaurant_reservation_saas",
    );
    expect(history[0]!.status).toBe("handed_off");
    expect(history[0]!.executedBy).toBe("admin");
  });

  it("records candidate in report after handoff", () => {
    setupEligible();
    handoffDerivedCandidates();

    const report = buildDerivationReport();
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]!.templateId).toBe("restaurant_reservation_saas");
  });

  it("skips already-stored candidates on re-run", () => {
    setupEligible();
    handoffDerivedCandidates();

    const { prepared, skipped } = handoffDerivedCandidates();
    expect(prepared).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });

  it("filters by intentId when specified", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
      derivationIntentsOverride: [
        makeIntent("reservation_saas", "restaurant_reservation_saas", "intent-1"),
        makeIntent("reservation_saas", "clinic_reservation_saas", "intent-2"),
      ],
      catalogOverride: [makeCatalogEntry("reservation_saas")],
    });

    const { prepared } = handoffDerivedCandidates({ intentId: "intent-1" });
    expect(prepared).toHaveLength(1);
    expect(prepared[0]!.requestedTemplateId).toBe("restaurant_reservation_saas");
  });
});

// ---------------------------------------------------------------------------
// 7. Skipped derivations record explainable reasons
// ---------------------------------------------------------------------------

describe("buildDerivationPlans — skipped plans", () => {
  it("records skip reason for ineligible parent", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [
        makePublishedItem("reservation_saas", { status: "unpublished" }),
      ],
      derivationIntentsOverride: [
        makeIntent("reservation_saas", "restaurant_reservation_saas"),
      ],
      catalogOverride: [],
    });

    const plans = buildDerivationPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("skipped");
    expect(plans[0]!.skipReason).toContain("unpublished");
    expect(plans[0]!.derivedCandidate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. History is recorded correctly
// ---------------------------------------------------------------------------

describe("listDerivationHistory", () => {
  it("records handoff entries", () => {
    setupEligible();
    handoffDerivedCandidates({ executedBy: "test-admin" });

    const history = listDerivationHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.requestedTemplateId).toBe("restaurant_reservation_saas");
    expect(history[0]!.executedBy).toBe("test-admin");
    expect(history[0]!.status).toBe("handed_off");
  });

  it("accumulates history across handoffs", () => {
    useInMemoryStore({
      marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
      derivationIntentsOverride: [
        makeIntent("reservation_saas", "restaurant_reservation_saas", "intent-1"),
      ],
      catalogOverride: [makeCatalogEntry("reservation_saas")],
    });

    handoffDerivedCandidates();

    // Add a second intent
    useInMemoryStore({
      ...{
        marketplaceItemsOverride: [makePublishedItem("reservation_saas")],
        derivationIntentsOverride: [
          makeIntent("reservation_saas", "clinic_reservation_saas", "intent-2"),
        ],
        catalogOverride: [makeCatalogEntry("reservation_saas")],
        candidates: [
          {
            templateId: "restaurant_reservation_saas",
            parentTemplateId: "reservation_saas",
            domain: "reservation",
            variantType: "verticalized" as const,
            blueprintHints: [],
            schemaHints: [],
            apiHints: [],
          },
        ],
        history: [
          {
            derivationId: "derive-plan-reservation_saas-to-restaurant_reservation_saas",
            intentId: "intent-1",
            parentTemplateId: "reservation_saas",
            requestedTemplateId: "restaurant_reservation_saas",
            status: "handed_off" as const,
            executedAt: "2026-03-16T10:00:00.000Z",
            executedBy: "admin",
          },
        ],
      },
    });

    handoffDerivedCandidates();
    expect(listDerivationHistory()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 9. Report and formatting
// ---------------------------------------------------------------------------

describe("buildDerivationReport", () => {
  it("produces summary counts", () => {
    setupEligible();
    const report = buildDerivationReport();

    expect(report.summary.totalIntents).toBe(1);
    expect(report.summary.plannedCount).toBe(1);
    expect(report.generatedAt).toBeDefined();
  });
});

describe("formatDerivationReport", () => {
  it("produces readable text output", () => {
    setupEligible();
    const report = buildDerivationReport();
    const text = formatDerivationReport(report);

    expect(text).toContain("MARKETPLACE DERIVATION PIPELINE REPORT");
    expect(text).toContain("[PLANNED]");
    expect(text).toContain("restaurant_reservation_saas");
  });
});

// ---------------------------------------------------------------------------
// 10. Role authorization is enforced for prepare actions
// ---------------------------------------------------------------------------

describe("handoffDerivedCandidates — role authorization", () => {
  it("allows owner to prepare", () => {
    setupEligible();
    const actor = resolveActorRole("owner-1", "owner");
    const { prepared } = handoffDerivedCandidates({ actor });
    expect(prepared).toHaveLength(1);
  });

  it("allows admin to prepare", () => {
    setupEligible();
    const actor = resolveActorRole("admin-1", "admin");
    const { prepared } = handoffDerivedCandidates({ actor });
    expect(prepared).toHaveLength(1);
  });

  it("blocks viewer from preparing", () => {
    setupEligible();
    const actor = resolveActorRole("viewer-1", "viewer");
    const { prepared, skipped, history } = handoffDerivedCandidates({ actor });
    expect(prepared).toHaveLength(0);
    expect(skipped).toHaveLength(0);
    expect(history).toHaveLength(0);

    // Verify no candidates were written
    const report = buildDerivationReport();
    expect(report.candidates).toHaveLength(0);
  });

  it("blocks reviewer from preparing", () => {
    setupEligible();
    const actor = resolveActorRole("reviewer-1", "reviewer");
    const { prepared } = handoffDerivedCandidates({ actor });
    expect(prepared).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 11. Same inputs yield same derivation plans
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same inputs produce identical derivation plans", () => {
    const setup = () => {
      setupEligible();
    };

    setup();
    const p1 = buildDerivationPlans();

    setup();
    const p2 = buildDerivationPlans();

    expect(p1.length).toBe(p2.length);
    for (let i = 0; i < p1.length; i++) {
      expect(p1[i]!.derivationId).toBe(p2[i]!.derivationId);
      expect(p1[i]!.status).toBe(p2[i]!.status);
      expect(p1[i]!.eligibility.allowed).toBe(p2[i]!.eligibility.allowed);
      if (p1[i]!.derivedCandidate && p2[i]!.derivedCandidate) {
        expect(p1[i]!.derivedCandidate!.templateId).toBe(
          p2[i]!.derivedCandidate!.templateId,
        );
        expect(p1[i]!.derivedCandidate!.variantType).toBe(
          p2[i]!.derivedCandidate!.variantType,
        );
      }
    }
  });
});
