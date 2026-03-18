import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  buildTemplateReleaseCatalog,
  collectReleaseCandidates,
  evaluateTemplateReleaseEligibility,
  buildTemplateReleasePlans,
  previewTemplateReleasePlans,
  applyTemplateReleasePlans,
  listTemplateReleaseHistory,
  buildTemplateReleaseRollbackMetadata,
  buildTemplateReleaseReport,
  formatTemplateReleaseReport,
  formatReleasePromotionPlans,
  useInMemoryStore,
  clearInMemoryStore,
  type ReleasedTemplateEntry,
  type ReleaseCandidate,
  type ReleaseStage,
} from "../template-release-management";

import {
  useInMemoryStore as useMarketplaceStore,
  clearInMemoryStore as clearMarketplaceStore,
} from "../template-marketplace";

import {
  useInMemoryStore as useDerivationStore,
  clearInMemoryStore as clearDerivationStore,
} from "../marketplace-derivation-pipeline";

import { resolveActorRole } from "../team-role-approval";

import type { TemplateGovernanceResult, TemplateHealthState, GovernanceDecision } from "../template-health-governance";
import type { MarketplaceReport } from "../template-marketplace";
import type { DerivationReport } from "../marketplace-derivation-pipeline";
import type { TemplateAnalytics } from "../template-analytics-ranking";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ownerActor() { return resolveActorRole("owner-1", "owner"); }
function adminActor() { return resolveActorRole("admin-1", "admin"); }
function reviewerActor() { return resolveActorRole("reviewer-1", "reviewer"); }
function operatorActor() { return resolveActorRole("operator-1", "operator"); }
function viewerActor() { return resolveActorRole("viewer-1", "viewer"); }

function makeGov(
  templateKey: string,
  nextState: TemplateHealthState,
  decision: GovernanceDecision,
  overrides?: Partial<TemplateGovernanceResult["signals"]>,
): TemplateGovernanceResult {
  return {
    templateKey,
    currentState: nextState,
    nextState,
    decision,
    reasons: [`Decision: ${decision}`],
    signals: {
      recentPassCount: 3,
      recentDegradedCount: 0,
      recentFailCount: 0,
      consecutivePassCount: 3,
      consecutiveFailCount: 0,
      latestBaselinePassed: true,
      latestQualityGatesPassed: true,
      greenCriteriaEligible: nextState === "green",
      ...overrides,
    },
    evaluatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function allGreenGovernance(): TemplateGovernanceResult[] {
  return [
    makeGov("membership_content_affiliate", "green", "remain_green"),
    makeGov("reservation_saas", "green", "remain_green"),
    makeGov("community_membership_saas", "green", "remain_green"),
    makeGov("simple_crm_saas", "green", "remain_green"),
    makeGov("internal_admin_ops_saas", "green", "remain_green"),
  ];
}

function makeMarketplace(): MarketplaceReport {
  const make = (id: string, domain: string) => ({
    templateId: id,
    title: id,
    domain,
    status: "published" as const,
    healthState: "green",
    maturity: "production_ready" as const,
    description: "",
    capabilities: [],
    sourceSignals: { governanceState: "green", regressionStatus: "pass", greenEligible: true },
    derivationHints: [] as string[],
    publishedAt: "2026-03-10T00:00:00.000Z",
  });

  const items = [
    make("membership_content_affiliate", "membership"),
    make("reservation_saas", "reservation"),
    make("community_membership_saas", "community"),
    make("simple_crm_saas", "crm"),
    make("internal_admin_ops_saas", "operations"),
  ];

  return {
    items,
    adoptionIntents: [],
    derivationIntents: [],
    summary: {
      totalItems: 5,
      publishedCount: 5,
      experimentalCount: 0,
      unpublishedCount: 0,
      adoptionIntentCount: 0,
      derivationIntentCount: 0,
    },
    generatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function emptyDerivation(): DerivationReport {
  return {
    plans: [],
    history: [],
    candidates: [],
    summary: { totalIntents: 0, plannedCount: 0, skippedCount: 0, preparedCount: 0, handedOffCount: 0 },
    generatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function makeDevEntry(templateId: string): ReleasedTemplateEntry {
  return {
    templateId,
    stage: "dev",
    sourceType: "catalog",
    parentTemplateId: null,
    releasedAt: "2026-03-15T00:00:00.000Z",
    releasedBy: "admin-1",
    releaseNotes: "Initial dev release",
    signals: { healthState: "green", regressionStatus: "pass", marketplaceStatus: "published", overallRankScore: 0.9 },
  };
}

function makeStagingEntry(templateId: string): ReleasedTemplateEntry {
  return {
    ...makeDevEntry(templateId),
    stage: "staging",
    releaseNotes: "Promoted to staging",
  };
}

function simpleAnalytics(): TemplateAnalytics[] {
  return [
    { templateId: "reservation_saas", label: "RSV", domain: "reservation", healthState: "green", marketplaceStatus: "published", healthScore: 1.0, stabilityScore: 0.9, adoptionIntentCount: 0, derivationIntentCount: 0, derivationReadinessScore: 0.9, marketplaceMaturityScore: 0.9, overallRankScore: 0.9, trend: "stable", reasons: [] },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Template Release Management v1", () => {
  beforeEach(() => {
    useMarketplaceStore();
    useDerivationStore();
    useInMemoryStore({
      governanceResults: allGreenGovernance(),
      marketplaceReport: makeMarketplace(),
      derivationReport: emptyDerivation(),
      analytics: simpleAnalytics(),
    });
  });

  afterEach(() => {
    clearInMemoryStore();
    clearMarketplaceStore();
    clearDerivationStore();
  });

  // 1. Candidate collection
  describe("Candidate Collection", () => {
    it("collects catalog templates as candidates", () => {
      const candidates = collectReleaseCandidates();
      expect(candidates.length).toBe(5);
      expect(candidates.every((c) => c.sourceType === "catalog")).toBe(true);
    });

    it("collects derivation candidates", () => {
      useInMemoryStore({
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: {
          ...emptyDerivation(),
          candidates: [
            {
              templateId: "restaurant_reservation_saas",
              parentTemplateId: "reservation_saas",
              domain: "restaurant",
              variantType: "verticalized",
              blueprintHints: [],
              schemaHints: [],
              apiHints: [],
            },
          ],
        },
        analytics: simpleAnalytics(),
      });

      const candidates = collectReleaseCandidates();
      const derived = candidates.find((c) => c.templateId === "restaurant_reservation_saas");
      expect(derived).toBeDefined();
      expect(derived!.sourceType).toBe("derivation");
      expect(derived!.parentTemplateId).toBe("reservation_saas");
    });

    it("excludes already-released templates", () => {
      useInMemoryStore({
        catalog: [makeDevEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const candidates = collectReleaseCandidates();
      expect(candidates.some((c) => c.templateId === "reservation_saas")).toBe(false);
      expect(candidates.length).toBe(4);
    });
  });

  // 2. candidate → dev eligibility
  describe("Candidate → Dev Eligibility", () => {
    it("allows candidate to dev for known template", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "candidate",
        "dev",
      );
      expect(result.allowed).toBe(true);
    });

    it("rejects unknown template", () => {
      const result = evaluateTemplateReleaseEligibility(
        "nonexistent_template",
        "candidate",
        "dev",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
    });

    it("rejects if template already at higher stage", () => {
      useInMemoryStore({
        catalog: [makeStagingEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "candidate",
        "dev",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("higher stage");
    });
  });

  // 3. dev → staging eligibility
  describe("Dev → Staging Eligibility", () => {
    it("allows dev to staging for healthy template", () => {
      useInMemoryStore({
        catalog: [makeDevEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "dev",
        "staging",
      );
      expect(result.allowed).toBe(true);
    });

    it("rejects degraded template", () => {
      useInMemoryStore({
        catalog: [makeDevEntry("reservation_saas")],
        governanceResults: [
          ...allGreenGovernance().filter((g) => g.templateKey !== "reservation_saas"),
          makeGov("reservation_saas", "degraded", "mark_degraded", {
            recentPassCount: 0,
            recentFailCount: 3,
            consecutivePassCount: 0,
            consecutiveFailCount: 3,
            latestBaselinePassed: false,
            latestQualityGatesPassed: false,
            greenCriteriaEligible: false,
          }),
        ],
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "dev",
        "staging",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("degraded");
    });

    it("rejects template not in dev", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "dev",
        "staging",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found in dev");
    });
  });

  // 4. staging → prod eligibility
  describe("Staging → Prod Eligibility", () => {
    it("allows staging to prod for green template", () => {
      useInMemoryStore({
        catalog: [makeStagingEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "staging",
        "prod",
      );
      expect(result.allowed).toBe(true);
    });

    it("rejects non-green template for prod", () => {
      useInMemoryStore({
        catalog: [makeStagingEntry("reservation_saas")],
        governanceResults: [
          ...allGreenGovernance().filter((g) => g.templateKey !== "reservation_saas"),
          makeGov("reservation_saas", "at_risk", "mark_at_risk"),
        ],
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "staging",
        "prod",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("green");
    });

    it("rejects template not in staging", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "staging",
        "prod",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found in staging");
    });
  });

  // 5. Invalid transitions
  describe("Invalid Transitions", () => {
    it("rejects candidate → staging (skip)", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "candidate",
        "staging",
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Invalid transition");
    });

    it("rejects candidate → prod (skip)", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "candidate",
        "prod",
      );
      expect(result.allowed).toBe(false);
    });

    it("rejects dev → prod (skip)", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "dev",
        "prod",
      );
      expect(result.allowed).toBe(false);
    });

    it("rejects prod → dev (reverse)", () => {
      const result = evaluateTemplateReleaseEligibility(
        "reservation_saas",
        "prod" as ReleaseStage,
        "dev" as ReleaseStage,
      );
      expect(result.allowed).toBe(false);
    });
  });

  // 6. Dry-run preview
  describe("Dry-Run Preview", () => {
    it("produces plans without mutation", () => {
      const catalogBefore = buildTemplateReleaseCatalog();
      const plans = previewTemplateReleasePlans();
      const catalogAfter = buildTemplateReleaseCatalog();

      expect(plans.length).toBeGreaterThan(0);
      expect(catalogAfter).toEqual(catalogBefore);
    });

    it("preview for specific template", () => {
      const plans = previewTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
      });

      expect(plans).toHaveLength(1);
      expect(plans[0]!.templateId).toBe("reservation_saas");
      expect(plans[0]!.status).toBe("ready");
      expect(plans[0]!.eligibility.allowed).toBe(true);
    });

    it("preview is deterministic", () => {
      const plans1 = previewTemplateReleasePlans();
      const plans2 = previewTemplateReleasePlans();

      expect(plans1.map((p) => p.releasePromotionId)).toEqual(
        plans2.map((p) => p.releasePromotionId),
      );
    });
  });

  // 7. Apply promotion
  describe("Apply Promotion", () => {
    it("applies candidate → dev promotion", () => {
      const { applied, skipped } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      expect(applied).toHaveLength(1);
      expect(skipped).toHaveLength(0);
      expect(applied[0]!.status).toBe("promoted");

      const catalog = buildTemplateReleaseCatalog();
      const entry = catalog.find(
        (e) => e.templateId === "reservation_saas" && e.stage === "dev",
      );
      expect(entry).toBeDefined();
      expect(entry!.releasedBy).toBe("admin-1");
    });

    it("applies dev → staging promotion", () => {
      useInMemoryStore({
        catalog: [makeDevEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const { applied } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "dev",
        toStage: "staging",
        actor: adminActor(),
      });

      expect(applied).toHaveLength(1);
      const catalog = buildTemplateReleaseCatalog();
      expect(catalog.find((e) => e.stage === "dev")).toBeUndefined();
      expect(catalog.find((e) => e.stage === "staging")).toBeDefined();
    });

    it("applies staging → prod promotion (owner only)", () => {
      useInMemoryStore({
        catalog: [makeStagingEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const { applied } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "staging",
        toStage: "prod",
        actor: ownerActor(),
      });

      expect(applied).toHaveLength(1);
      const catalog = buildTemplateReleaseCatalog();
      const prodEntry = catalog.find((e) => e.stage === "prod");
      expect(prodEntry).toBeDefined();
      expect(prodEntry!.templateId).toBe("reservation_saas");
    });

    it("custom release notes", () => {
      const { applied } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
        releaseNotes: "Initial evaluation release",
      });

      expect(applied[0]!.afterEntry!.releaseNotes).toBe("Initial evaluation release");
    });
  });

  // 8. Release history
  describe("Release History", () => {
    it("records history on promotion", () => {
      applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      const history = listTemplateReleaseHistory();
      expect(history).toHaveLength(1);
      expect(history[0]!.templateId).toBe("reservation_saas");
      expect(history[0]!.fromStage).toBe("candidate");
      expect(history[0]!.toStage).toBe("dev");
      expect(history[0]!.status).toBe("promoted");
      expect(history[0]!.executedBy).toBe("admin-1");
    });

    it("accumulates history across multiple promotions", () => {
      applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });
      applyTemplateReleasePlans({
        templateId: "simple_crm_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      const history = listTemplateReleaseHistory();
      expect(history).toHaveLength(2);
    });

    it("empty history initially", () => {
      expect(listTemplateReleaseHistory()).toHaveLength(0);
    });
  });

  // 9. Rollback metadata
  describe("Rollback Metadata", () => {
    it("generates correct rollback metadata", () => {
      const plans = previewTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
      });

      const rollback = buildTemplateReleaseRollbackMetadata(plans[0]!);
      expect(rollback.releasePromotionId).toBe(
        "release-reservation_saas-candidate-to-dev",
      );
      expect(rollback.rollbackAction.templateId).toBe("reservation_saas");
      expect(rollback.rollbackAction.restoreStage).toBe("candidate");
      expect(rollback.rollbackAction.targetFile).toContain("template-release-catalog.json");
    });

    it("history entries include rollback metadata", () => {
      applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      const history = listTemplateReleaseHistory();
      expect(history[0]!.rollbackMetadata).toBeDefined();
      expect(history[0]!.rollbackMetadata.rollbackAction.restoreStage).toBe("candidate");
    });
  });

  // 10. Role authorization
  describe("Role Authorization", () => {
    it("admin can promote candidate → dev", () => {
      const { applied } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });
      expect(applied).toHaveLength(1);
    });

    it("admin can promote dev → staging", () => {
      useInMemoryStore({
        catalog: [makeDevEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const { applied } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "dev",
        toStage: "staging",
        actor: adminActor(),
      });
      expect(applied).toHaveLength(1);
    });

    it("admin cannot promote staging → prod", () => {
      useInMemoryStore({
        catalog: [makeStagingEntry("reservation_saas")],
        governanceResults: allGreenGovernance(),
        marketplaceReport: makeMarketplace(),
        derivationReport: emptyDerivation(),
        analytics: simpleAnalytics(),
      });

      const { applied, skipped } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "staging",
        toStage: "prod",
        actor: adminActor(),
      });
      expect(applied).toHaveLength(0);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]!.eligibility.reason).toContain("not authorized");
    });

    it("viewer cannot promote anything", () => {
      const { applied, skipped } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: viewerActor(),
      });
      expect(applied).toHaveLength(0);
      expect(skipped).toHaveLength(1);
    });

    it("operator can promote candidate → dev", () => {
      const { applied } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: operatorActor(),
      });
      expect(applied).toHaveLength(1);
    });

    it("reviewer cannot promote (preview only)", () => {
      const { applied, skipped } = applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: reviewerActor(),
      });
      expect(applied).toHaveLength(0);
      expect(skipped).toHaveLength(1);
    });
  });

  // 11. Report & formatting
  describe("Report and Formatting", () => {
    it("builds report with all sections", () => {
      applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      const report = buildTemplateReleaseReport();
      expect(report.catalog.length).toBeGreaterThan(0);
      expect(report.candidates.length).toBeGreaterThan(0);
      expect(report.history.length).toBeGreaterThan(0);
      expect(report.summary.devCount).toBe(1);
      expect(report.generatedAt).toBeTruthy();
    });

    it("formats report output", () => {
      applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      const report = buildTemplateReleaseReport();
      const output = formatTemplateReleaseReport(report);
      expect(output).toContain("TEMPLATE RELEASE MANAGEMENT REPORT");
      expect(output).toContain("RELEASE CATALOG:");
      expect(output).toContain("reservation_saas");
    });

    it("formats promotion plans", () => {
      const plans = previewTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
      });
      const output = formatReleasePromotionPlans(plans);
      expect(output).toContain("RELEASE PROMOTION PREVIEW");
      expect(output).toContain("[READY]");
      expect(output).toContain("reservation_saas");
    });
  });

  // 12. Determinism
  describe("Determinism", () => {
    it("same inputs yield same plan output", () => {
      const plans1 = buildTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
      });
      const plans2 = buildTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
      });

      expect(plans1.map((p) => p.releasePromotionId)).toEqual(
        plans2.map((p) => p.releasePromotionId),
      );
      expect(plans1.map((p) => p.eligibility.allowed)).toEqual(
        plans2.map((p) => p.eligibility.allowed),
      );
    });

    it("catalog state is deterministic after promotion", () => {
      applyTemplateReleasePlans({
        templateId: "reservation_saas",
        fromStage: "candidate",
        toStage: "dev",
        actor: adminActor(),
      });

      const cat1 = buildTemplateReleaseCatalog();
      const cat2 = buildTemplateReleaseCatalog();
      expect(cat1).toEqual(cat2);
    });
  });
});
