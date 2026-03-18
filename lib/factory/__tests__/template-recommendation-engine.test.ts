import { describe, it, expect } from "vitest";

import {
  recommendTemplatesByDomain,
  recommendTemplatesByUseCase,
  recommendBestDerivationParents,
  recommendUnderusedHighQualityTemplates,
  recommendSafestProductionTemplates,
  recommendRisingTemplates,
  buildTemplateRecommendations,
  buildTemplateRecommendationReport,
  formatRecommendationReport,
  formatRecommendationRecord,
  USE_CASE_DOMAINS,
  ALL_USE_CASES,
  type RecommendationRecord,
  type RecommendationReport,
} from "../template-recommendation-engine";
import type { TemplateAnalytics, TemplateRankingReport } from "../template-analytics-ranking";
import type { MarketplaceReport } from "../template-marketplace";
import type { DerivationReport } from "../marketplace-derivation-pipeline";
import type { TemplateReleaseReport, ReleaseStage } from "../template-release-management";

// ---------------------------------------------------------------------------
// Minimal mock data builders
// ---------------------------------------------------------------------------

function makeAnalytics(
  templateId: string,
  domain: string,
  overrides?: Partial<TemplateAnalytics>,
): TemplateAnalytics {
  return {
    templateId,
    label: templateId.replace(/_/g, " "),
    domain,
    healthState: "green",
    marketplaceStatus: "published",
    healthScore: 1.0,
    stabilityScore: 1.0,
    adoptionIntentCount: 0,
    derivationIntentCount: 0,
    derivationReadinessScore: 0.8,
    marketplaceMaturityScore: 0.8,
    overallRankScore: 0.85,
    trend: "stable",
    reasons: ["green", "stable"],
    ...overrides,
  };
}

function makeRankingReport(
  rankings: TemplateAnalytics[],
  overrides?: Partial<TemplateRankingReport>,
): TemplateRankingReport {
  return {
    rankings,
    topRanked: rankings.slice(0, 3),
    bestDerivationParents: rankings.filter((r) => r.derivationReadinessScore >= 0.7),
    underusedHealthy: rankings.filter(
      (r) => r.healthScore >= 0.7 && r.adoptionIntentCount === 0,
    ),
    summary: {
      totalTemplates: rankings.length,
      risingCount: rankings.filter((r) => r.trend === "rising").length,
      stableCount: rankings.filter((r) => r.trend === "stable").length,
      decliningCount: rankings.filter((r) => r.trend === "declining").length,
      averageOverallScore: rankings.reduce((s, r) => s + r.overallRankScore, 0) / (rankings.length || 1),
      averageHealthScore: rankings.reduce((s, r) => s + r.healthScore, 0) / (rankings.length || 1),
    },
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMarketplaceReport(partial?: Partial<MarketplaceReport>): MarketplaceReport {
  return {
    items: [],
    adoptionIntents: [],
    derivationIntents: [],
    summary: {
      totalItems: 0,
      publishedCount: 0,
      experimentalCount: 0,
      unpublishedCount: 0,
      adoptionIntentCount: 0,
      derivationIntentCount: 0,
    },
    generatedAt: new Date().toISOString(),
    ...partial,
  };
}

function makeDerivationReport(partial?: Partial<DerivationReport>): DerivationReport {
  return {
    plans: [],
    history: [],
    candidates: [],
    summary: {
      totalIntents: 0,
      plannedCount: 0,
      skippedCount: 0,
      preparedCount: 0,
      handedOffCount: 0,
    },
    generatedAt: new Date().toISOString(),
    ...partial,
  };
}

function makeReleaseReport(
  catalog?: Array<{ templateId: string; stage: ReleaseStage }>,
): TemplateReleaseReport {
  return {
    catalog: (catalog ?? []).map((c) => ({
      templateId: c.templateId,
      stage: c.stage,
      sourceType: "catalog" as const,
      parentTemplateId: null,
      releasedAt: new Date().toISOString(),
      releasedBy: "test",
      releaseNotes: "",
      signals: {
        healthState: "green",
        regressionStatus: "pass",
        marketplaceStatus: "published",
        overallRankScore: 0.8,
      },
    })),
    candidates: [],
    plans: [],
    history: [],
    summary: {
      candidateCount: 0,
      devCount: 0,
      stagingCount: 0,
      prodCount: 0,
      totalHistory: 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

function standardOverrides(
  rankings: TemplateAnalytics[],
  releaseEntries?: Array<{ templateId: string; stage: ReleaseStage }>,
) {
  return {
    rankingReport: makeRankingReport(rankings),
    marketplaceReport: makeMarketplaceReport(),
    derivationReport: makeDerivationReport(),
    releaseReport: makeReleaseReport(releaseEntries),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("template-recommendation-engine", () => {
  // ── 1. Determinism ────────────────────────────────────────────
  describe("determinism", () => {
    it("produces identical results for same inputs", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const report1 = buildTemplateRecommendationReport(overrides);
      const report2 = buildTemplateRecommendationReport(overrides);

      // Compare all recommendation counts
      expect(report1.summary.totalRecommendations).toBe(report2.summary.totalRecommendations);
      expect(report1.bestDerivationParents.length).toBe(report2.bestDerivationParents.length);
      expect(report1.underusedHighQuality.length).toBe(report2.underusedHighQuality.length);

      // Compare specific recommendation scores
      for (let i = 0; i < report1.bestDerivationParents.length; i++) {
        expect(report1.bestDerivationParents[i]!.score)
          .toBe(report2.bestDerivationParents[i]!.score);
        expect(report1.bestDerivationParents[i]!.templateId)
          .toBe(report2.bestDerivationParents[i]!.templateId);
      }
    });

    it("same inputs yield same use case recommendations", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
      ];
      const overrides = standardOverrides(rankings);

      const r1 = recommendTemplatesByUseCase("booking", overrides);
      const r2 = recommendTemplatesByUseCase("booking", overrides);

      expect(r1.length).toBe(r2.length);
      if (r1.length > 0) {
        expect(r1[0]!.score).toBe(r2[0]!.score);
        expect(r1[0]!.templateId).toBe(r2[0]!.templateId);
      }
    });
  });

  // ── 2. Booking → Reservation ─────────────────────────────────
  describe("booking use case", () => {
    it("recommends reservation-related templates for booking", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
        makeAnalytics("community_membership_saas", "community / membership"),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendTemplatesByUseCase("booking", overrides);

      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0]!.templateId).toBe("reservation_saas");
      expect(recs[0]!.useCase).toBe("booking");
      expect(recs[0]!.recommendationType).toBe("by_use_case");
    });

    it("does not recommend CRM templates for booking", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendTemplatesByUseCase("booking", overrides);
      const ids = recs.map((r) => r.templateId);
      expect(ids).not.toContain("simple_crm_saas");
    });
  });

  // ── 3. Best Derivation Parent ────────────────────────────────
  describe("best derivation parent", () => {
    it("favors healthy stable templates", () => {
      const rankings = [
        makeAnalytics("template_a", "domain_a", {
          healthState: "green",
          stabilityScore: 1.0,
          derivationReadinessScore: 0.9,
        }),
        makeAnalytics("template_b", "domain_b", {
          healthState: "green",
          stabilityScore: 0.5,
          derivationReadinessScore: 0.4,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendBestDerivationParents(overrides);
      expect(recs.length).toBe(2);
      expect(recs[0]!.templateId).toBe("template_a");
      expect(recs[0]!.score).toBeGreaterThan(recs[1]!.score);
    });

    it("excludes degraded and demoted templates", () => {
      const rankings = [
        makeAnalytics("healthy_one", "domain_a", { healthState: "green" }),
        makeAnalytics("degraded_one", "domain_b", { healthState: "degraded" }),
        makeAnalytics("demoted_one", "domain_c", { healthState: "demoted" }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendBestDerivationParents(overrides);
      const ids = recs.map((r) => r.templateId);
      expect(ids).toContain("healthy_one");
      expect(ids).not.toContain("degraded_one");
      expect(ids).not.toContain("demoted_one");
    });

    it("boosts templates with existing derivation intent", () => {
      const rankings = [
        makeAnalytics("template_a", "domain_a", {
          healthState: "green",
          stabilityScore: 0.8,
          derivationReadinessScore: 0.8,
          derivationIntentCount: 3,
        }),
        makeAnalytics("template_b", "domain_b", {
          healthState: "green",
          stabilityScore: 0.8,
          derivationReadinessScore: 0.8,
          derivationIntentCount: 0,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendBestDerivationParents(overrides);
      expect(recs[0]!.templateId).toBe("template_a");
      expect(recs[0]!.score).toBeGreaterThan(recs[1]!.score);
    });
  });

  // ── 4. Underused High-Quality ────────────────────────────────
  describe("underused high-quality", () => {
    it("detects high-quality templates with zero adoption", () => {
      const rankings = [
        makeAnalytics("hidden_gem", "domain_a", {
          healthScore: 0.9,
          stabilityScore: 0.9,
          overallRankScore: 0.8,
          adoptionIntentCount: 0,
        }),
        makeAnalytics("popular_one", "domain_b", {
          healthScore: 0.9,
          stabilityScore: 0.9,
          overallRankScore: 0.8,
          adoptionIntentCount: 5,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendUnderusedHighQualityTemplates(overrides);
      const ids = recs.map((r) => r.templateId);
      expect(ids).toContain("hidden_gem");
      expect(ids).not.toContain("popular_one");
    });

    it("does not flag low-quality templates as underused", () => {
      const rankings = [
        makeAnalytics("low_quality", "domain_a", {
          healthScore: 0.3,
          stabilityScore: 0.3,
          overallRankScore: 0.2,
          adoptionIntentCount: 0,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendUnderusedHighQualityTemplates(overrides);
      expect(recs).toHaveLength(0);
    });
  });

  // ── 5. Rising Templates ──────────────────────────────────────
  describe("rising templates", () => {
    it("surfaces templates with rising trend", () => {
      const rankings = [
        makeAnalytics("rising_one", "domain_a", { trend: "rising" }),
        makeAnalytics("stable_one", "domain_b", { trend: "stable" }),
        makeAnalytics("declining_one", "domain_c", { trend: "declining" }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendRisingTemplates(overrides);
      expect(recs).toHaveLength(1);
      expect(recs[0]!.templateId).toBe("rising_one");
      expect(recs[0]!.recommendationType).toBe("rising_template");
    });

    it("returns empty when no rising templates", () => {
      const rankings = [
        makeAnalytics("stable_one", "domain_a", { trend: "stable" }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendRisingTemplates(overrides);
      expect(recs).toHaveLength(0);
    });
  });

  // ── 6. Explanation Reasons ───────────────────────────────────
  describe("explanation reasons", () => {
    it("includes readable reasons in every recommendation", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendTemplatesByUseCase("booking", overrides);
      expect(recs.length).toBeGreaterThan(0);

      for (const rec of recs) {
        expect(rec.reasons).toBeDefined();
        expect(rec.reasons.length).toBeGreaterThan(0);
        // Each reason should be a non-empty string
        for (const reason of rec.reasons) {
          expect(typeof reason).toBe("string");
          expect(reason.length).toBeGreaterThan(0);
        }
      }
    });

    it("includes score and confidence in recommendations", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendBestDerivationParents(overrides);
      for (const rec of recs) {
        expect(rec.score).toBeGreaterThanOrEqual(0);
        expect(rec.score).toBeLessThanOrEqual(1);
        expect(rec.confidence).toBeGreaterThanOrEqual(0);
        expect(rec.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── 7. Domain / Use-Case Filtering ──────────────────────────
  describe("filtering", () => {
    it("filters by domain correctly", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const reservationRecs = recommendTemplatesByDomain("reservation", overrides);
      const crmRecs = recommendTemplatesByDomain("crm", overrides);

      expect(reservationRecs.map((r) => r.templateId)).toContain("reservation_saas");
      expect(reservationRecs.map((r) => r.templateId)).not.toContain("simple_crm_saas");

      expect(crmRecs.map((r) => r.templateId)).toContain("simple_crm_saas");
      expect(crmRecs.map((r) => r.templateId)).not.toContain("reservation_saas");
    });

    it("community use case maps to community + membership domains", () => {
      const rankings = [
        makeAnalytics("community_membership_saas", "community / membership"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendTemplatesByUseCase("community", overrides);
      expect(recs.map((r) => r.templateId)).toContain("community_membership_saas");
      expect(recs.map((r) => r.templateId)).not.toContain("simple_crm_saas");
    });

    it("use case domain mapping covers all use cases", () => {
      for (const uc of ALL_USE_CASES) {
        expect(USE_CASE_DOMAINS[uc]).toBeDefined();
        expect(USE_CASE_DOMAINS[uc].length).toBeGreaterThan(0);
      }
    });
  });

  // ── 8. Safest Production ─────────────────────────────────────
  describe("safest production templates", () => {
    it("favors green stable templates", () => {
      const rankings = [
        makeAnalytics("safe_one", "domain_a", {
          healthState: "green",
          healthScore: 1.0,
          stabilityScore: 1.0,
        }),
        makeAnalytics("risky_one", "domain_b", {
          healthState: "at_risk",
          healthScore: 0.5,
          stabilityScore: 0.5,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const recs = recommendSafestProductionTemplates(overrides);
      expect(recs.length).toBe(1);
      expect(recs[0]!.templateId).toBe("safe_one");
    });

    it("boosts templates at prod release stage", () => {
      const rankings = [
        makeAnalytics("template_a", "domain_a", {
          healthState: "green",
          stabilityScore: 0.8,
        }),
        makeAnalytics("template_b", "domain_b", {
          healthState: "green",
          stabilityScore: 0.8,
        }),
      ];
      const overrides = standardOverrides(rankings, [
        { templateId: "template_a", stage: "prod" },
        { templateId: "template_b", stage: "candidate" },
      ]);

      const recs = recommendSafestProductionTemplates(overrides);
      expect(recs[0]!.templateId).toBe("template_a");
    });
  });

  // ── 9. Full Report ──────────────────────────────────────────
  describe("full report", () => {
    it("builds complete recommendation report", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation", { trend: "rising" }),
        makeAnalytics("simple_crm_saas", "crm"),
        makeAnalytics("community_membership_saas", "community / membership"),
      ];
      const overrides = standardOverrides(rankings);

      const report = buildTemplateRecommendationReport(overrides);

      expect(report.summary.totalRecommendations).toBeGreaterThan(0);
      expect(report.generatedAt).toBeTruthy();
      expect(report.bestDerivationParents.length).toBeGreaterThan(0);
      expect(report.risingTemplates.length).toBe(1);
    });

    it("report byUseCase keys match ALL_USE_CASES", () => {
      const rankings = [makeAnalytics("reservation_saas", "reservation")];
      const overrides = standardOverrides(rankings);
      const report = buildTemplateRecommendationReport(overrides);

      for (const uc of ALL_USE_CASES) {
        expect(report.byUseCase).toHaveProperty(uc);
        expect(Array.isArray(report.byUseCase[uc])).toBe(true);
      }
    });
  });

  // ── 10. Formatting ──────────────────────────────────────────
  describe("formatting", () => {
    it("formatRecommendationRecord produces readable output", () => {
      const rec: RecommendationRecord = {
        recommendationType: "by_use_case",
        useCase: "booking",
        domain: "reservation",
        templateId: "reservation_saas",
        label: "reservation saas",
        score: 0.85,
        confidence: 0.9,
        reasons: ["green and production-ready", "highest overall rank tier"],
        alternatives: ["restaurant_reservation_saas"],
      };

      const output = formatRecommendationRecord(rec);
      expect(output).toContain("by_use_case");
      expect(output).toContain("reservation_saas");
      expect(output).toContain("booking");
      expect(output).toContain("0.85");
      expect(output).toContain("0.9");
    });

    it("formatRecommendationReport produces readable report", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
      ];
      const overrides = standardOverrides(rankings);
      const report = buildTemplateRecommendationReport(overrides);
      const output = formatRecommendationReport(report);

      expect(output).toContain("TEMPLATE RECOMMENDATION REPORT");
      expect(output).toContain("BEST DERIVATION PARENTS");
    });
  });

  // ── 11. Read-only / No state mutation ───────────────────────
  describe("read-only", () => {
    it("buildTemplateRecommendations does not mutate inputs", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const before = JSON.stringify(overrides);
      buildTemplateRecommendations(overrides);
      const after = JSON.stringify(overrides);

      expect(after).toBe(before);
    });
  });

  // ── 12. Integration with real data ──────────────────────────
  describe("integration with real factory data", () => {
    it("builds recommendations from live factory modules", () => {
      const report = buildTemplateRecommendationReport();

      expect(report.summary.totalRecommendations).toBeGreaterThan(0);
      expect(report.bestDerivationParents.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeTruthy();

      // Booking use case should have reservation_saas
      const bookingRecs = report.byUseCase.booking;
      expect(bookingRecs.length).toBeGreaterThan(0);
      expect(bookingRecs[0]!.templateId).toBe("reservation_saas");
    });
  });
});
