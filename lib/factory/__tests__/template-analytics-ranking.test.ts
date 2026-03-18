import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  buildTemplateAnalytics,
  computeTemplateRankScore,
  classifyTemplateTrend,
  rankTemplates,
  filterTemplateAnalytics,
  buildTemplateRankingReport,
  formatTemplateRankingReport,
  type TemplateAnalytics,
  type AnalyticsTrend,
} from "../template-analytics-ranking";

import {
  useInMemoryStore as useMarketplaceStore,
  clearInMemoryStore as clearMarketplaceStore,
} from "../template-marketplace";

import {
  useInMemoryStore as useDerivationStore,
  clearInMemoryStore as clearDerivationStore,
} from "../marketplace-derivation-pipeline";

import type {
  TemplateGovernanceResult,
  TemplateHealthState,
  GovernanceDecision,
} from "../template-health-governance";
import type { MarketplaceReport } from "../template-marketplace";
import type { DerivationReport } from "../marketplace-derivation-pipeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGovernanceResult(
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
    reasons: [`Governance: ${decision}`],
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

function makeMarketplaceReport(overrides?: {
  adoptionIntents?: MarketplaceReport["adoptionIntents"];
  derivationIntents?: MarketplaceReport["derivationIntents"];
}): MarketplaceReport {
  const makeItem = (
    templateId: string,
    title: string,
    domain: string,
    hints: string[],
  ) => ({
    templateId,
    title,
    domain,
    status: "published" as const,
    healthState: "green",
    maturity: "production_ready" as const,
    description: `${title} SaaS`,
    capabilities: [domain],
    sourceSignals: { governanceState: "green", regressionStatus: "pass", greenEligible: true },
    derivationHints: hints,
    publishedAt: "2026-03-10T00:00:00.000Z",
  });

  const items = [
    makeItem("membership_content_affiliate", "MCA", "membership", ["online_school_saas", "media_subscription_saas"]),
    makeItem("reservation_saas", "RSV", "reservation", ["restaurant_reservation_saas", "clinic_reservation_saas"]),
    makeItem("community_membership_saas", "CMS-Comm", "community", ["fan_community_saas"]),
    makeItem("simple_crm_saas", "CRM", "crm", ["real_estate_crm_saas"]),
    makeItem("internal_admin_ops_saas", "IAO", "operations", ["helpdesk_ops_saas"]),
  ];

  const adoptionIntents = overrides?.adoptionIntents ?? [];
  const derivationIntents = overrides?.derivationIntents ?? [];

  return {
    items,
    adoptionIntents,
    derivationIntents,
    summary: {
      totalItems: items.length,
      publishedCount: items.length,
      experimentalCount: 0,
      unpublishedCount: 0,
      adoptionIntentCount: adoptionIntents.length,
      derivationIntentCount: derivationIntents.length,
    },
    generatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function makeDerivationReport(): DerivationReport {
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
    generatedAt: "2026-03-17T00:00:00.000Z",
  };
}

function allGreenGovernance(): TemplateGovernanceResult[] {
  return [
    makeGovernanceResult("membership_content_affiliate", "green", "remain_green"),
    makeGovernanceResult("reservation_saas", "green", "remain_green"),
    makeGovernanceResult("community_membership_saas", "green", "remain_green"),
    makeGovernanceResult("simple_crm_saas", "green", "remain_green"),
    makeGovernanceResult("internal_admin_ops_saas", "green", "remain_green"),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Template Analytics / Ranking v1", () => {
  beforeEach(() => {
    useMarketplaceStore();
    useDerivationStore();
  });

  afterEach(() => {
    clearMarketplaceStore();
    clearDerivationStore();
  });

  // 1. Analytics generation is deterministic
  describe("Deterministic Analytics Generation", () => {
    it("produces same results on repeated calls with same input", () => {
      const overrides = {
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      };

      const result1 = buildTemplateAnalytics(overrides);
      const result2 = buildTemplateAnalytics(overrides);

      expect(result1.length).toBe(result2.length);
      for (let i = 0; i < result1.length; i++) {
        expect(result1[i]!.templateId).toBe(result2[i]!.templateId);
        expect(result1[i]!.overallRankScore).toBe(result2[i]!.overallRankScore);
        expect(result1[i]!.healthScore).toBe(result2[i]!.healthScore);
        expect(result1[i]!.stabilityScore).toBe(result2[i]!.stabilityScore);
        expect(result1[i]!.trend).toBe(result2[i]!.trend);
      }
    });

    it("generates analytics for all 5 catalog templates", () => {
      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      expect(analytics).toHaveLength(5);
      const ids = analytics.map((a) => a.templateId);
      expect(ids).toContain("membership_content_affiliate");
      expect(ids).toContain("reservation_saas");
      expect(ids).toContain("community_membership_saas");
      expect(ids).toContain("simple_crm_saas");
      expect(ids).toContain("internal_admin_ops_saas");
    });

    it("each analytics record has all required fields", () => {
      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      for (const a of analytics) {
        expect(a.templateId).toBeTruthy();
        expect(a.label).toBeTruthy();
        expect(a.domain).toBeTruthy();
        expect(typeof a.healthScore).toBe("number");
        expect(typeof a.stabilityScore).toBe("number");
        expect(typeof a.adoptionIntentCount).toBe("number");
        expect(typeof a.derivationIntentCount).toBe("number");
        expect(typeof a.derivationReadinessScore).toBe("number");
        expect(typeof a.marketplaceMaturityScore).toBe("number");
        expect(typeof a.overallRankScore).toBe("number");
        expect(["rising", "stable", "declining"]).toContain(a.trend);
        expect(a.reasons.length).toBeGreaterThan(0);
      }
    });
  });

  // 2. Green stable templates rank above degraded ones
  describe("Ranking Correctness", () => {
    it("green templates rank above degraded ones", () => {
      const governance = [
        makeGovernanceResult("membership_content_affiliate", "green", "remain_green"),
        makeGovernanceResult("reservation_saas", "degraded", "mark_degraded", {
          recentPassCount: 0,
          recentFailCount: 3,
          recentDegradedCount: 2,
          consecutivePassCount: 0,
          consecutiveFailCount: 3,
          latestBaselinePassed: false,
          latestQualityGatesPassed: false,
          greenCriteriaEligible: false,
        }),
        makeGovernanceResult("community_membership_saas", "green", "remain_green"),
        makeGovernanceResult("simple_crm_saas", "green", "remain_green"),
        makeGovernanceResult("internal_admin_ops_saas", "green", "remain_green"),
      ];

      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: governance,
        derivationReport: makeDerivationReport(),
      });

      const ranked = rankTemplates(analytics);

      // reservation_saas (degraded) should be last
      const rsvIdx = ranked.findIndex((a) => a.templateId === "reservation_saas");
      expect(rsvIdx).toBe(ranked.length - 1);

      // All green templates should rank higher
      for (let i = 0; i < rsvIdx; i++) {
        expect(ranked[i]!.healthScore).toBeGreaterThan(ranked[rsvIdx]!.healthScore);
      }
    });

    it("uses stable tie-breaker on equal scores", () => {
      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const ranked = rankTemplates(analytics);

      // All green with same conditions → tie-break by templateId asc
      // Verify ordering is deterministic
      const ranked2 = rankTemplates(analytics);
      expect(ranked.map((a) => a.templateId)).toEqual(
        ranked2.map((a) => a.templateId),
      );
    });
  });

  // 3. Adoption and derivation counts affect rank
  describe("Intent Count Impact", () => {
    it("templates with more adoption intents rank higher", () => {
      const report = makeMarketplaceReport({
        adoptionIntents: [
          { intentId: "a1", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "user1" },
          { intentId: "a2", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:01:00.000Z", requestedBy: "user2" },
          { intentId: "a3", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:02:00.000Z", requestedBy: "user3" },
        ],
      });

      const analytics = buildTemplateAnalytics({
        marketplaceReport: report,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const rsv = analytics.find((a) => a.templateId === "reservation_saas")!;
      const mca = analytics.find((a) => a.templateId === "membership_content_affiliate")!;

      expect(rsv.adoptionIntentCount).toBe(3);
      expect(mca.adoptionIntentCount).toBe(0);
      // rsv should have higher rank score due to adoption
      expect(rsv.overallRankScore).toBeGreaterThan(mca.overallRankScore);
    });

    it("templates with derivation intents rank higher on derivation score", () => {
      const report = makeMarketplaceReport({
        derivationIntents: [
          { intentId: "d1", parentTemplateId: "simple_crm_saas", requestedTemplateId: "real_estate_crm_saas", action: "derive_template_intent", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "user1" },
          { intentId: "d2", parentTemplateId: "simple_crm_saas", requestedTemplateId: "recruitment_crm_saas", action: "derive_template_intent", requestedAt: "2026-03-17T00:01:00.000Z", requestedBy: "user2" },
        ],
      });

      const analytics = buildTemplateAnalytics({
        marketplaceReport: report,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const crm = analytics.find((a) => a.templateId === "simple_crm_saas")!;
      const iao = analytics.find((a) => a.templateId === "internal_admin_ops_saas")!;

      expect(crm.derivationIntentCount).toBe(2);
      expect(iao.derivationIntentCount).toBe(0);
      expect(crm.overallRankScore).toBeGreaterThan(iao.overallRankScore);
    });
  });

  // 4. Trend classification
  describe("Trend Classification", () => {
    it("classifies rising trend for promote_to_green decision", () => {
      const trend = classifyTemplateTrend({
        healthScore: 0.8,
        stabilityScore: 0.9,
        adoptionIntentCount: 1,
        derivationIntentCount: 0,
        governanceDecision: "promote_to_green",
      });
      expect(trend).toBe("rising");
    });

    it("classifies rising trend for high health with adoption", () => {
      const trend = classifyTemplateTrend({
        healthScore: 0.9,
        stabilityScore: 0.8,
        adoptionIntentCount: 2,
        derivationIntentCount: 0,
        governanceDecision: "remain_green",
      });
      expect(trend).toBe("rising");
    });

    it("classifies declining trend for mark_degraded decision", () => {
      const trend = classifyTemplateTrend({
        healthScore: 0.3,
        stabilityScore: 0.2,
        adoptionIntentCount: 0,
        derivationIntentCount: 0,
        governanceDecision: "mark_degraded",
      });
      expect(trend).toBe("declining");
    });

    it("classifies declining trend for low health score", () => {
      const trend = classifyTemplateTrend({
        healthScore: 0.2,
        stabilityScore: 0.5,
        adoptionIntentCount: 0,
        derivationIntentCount: 0,
        governanceDecision: "hold_candidate",
      });
      expect(trend).toBe("declining");
    });

    it("classifies stable trend for steady green", () => {
      const trend = classifyTemplateTrend({
        healthScore: 0.8,
        stabilityScore: 0.8,
        adoptionIntentCount: 0,
        derivationIntentCount: 0,
        governanceDecision: "remain_green",
      });
      expect(trend).toBe("stable");
    });

    it("trend is deterministic", () => {
      const opts = {
        healthScore: 0.7,
        stabilityScore: 0.6,
        adoptionIntentCount: 1,
        derivationIntentCount: 0,
        governanceDecision: "remain_green",
      };
      const trend1 = classifyTemplateTrend(opts);
      const trend2 = classifyTemplateTrend(opts);
      expect(trend1).toBe(trend2);
    });
  });

  // 5. Filtering
  describe("Filtering", () => {
    it("filters by health state", () => {
      const governance = [
        makeGovernanceResult("membership_content_affiliate", "green", "remain_green"),
        makeGovernanceResult("reservation_saas", "at_risk", "mark_at_risk", {
          recentDegradedCount: 2,
          greenCriteriaEligible: false,
        }),
        makeGovernanceResult("community_membership_saas", "green", "remain_green"),
        makeGovernanceResult("simple_crm_saas", "green", "remain_green"),
        makeGovernanceResult("internal_admin_ops_saas", "green", "remain_green"),
      ];

      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: governance,
        derivationReport: makeDerivationReport(),
      });

      const greenOnly = filterTemplateAnalytics(analytics, { healthState: "green" });
      expect(greenOnly).toHaveLength(4);
      expect(greenOnly.every((a) => a.healthState === "green")).toBe(true);

      const atRiskOnly = filterTemplateAnalytics(analytics, { healthState: "at_risk" });
      expect(atRiskOnly).toHaveLength(1);
      expect(atRiskOnly[0]!.templateId).toBe("reservation_saas");
    });

    it("filters by domain", () => {
      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const crmOnly = filterTemplateAnalytics(analytics, { domain: "crm" });
      expect(crmOnly).toHaveLength(1);
      expect(crmOnly[0]!.templateId).toBe("simple_crm_saas");
    });

    it("filters by trend", () => {
      const governance = [
        makeGovernanceResult("membership_content_affiliate", "green", "remain_green"),
        makeGovernanceResult("reservation_saas", "degraded", "mark_degraded", {
          recentPassCount: 0,
          recentFailCount: 3,
          consecutivePassCount: 0,
          consecutiveFailCount: 3,
          latestBaselinePassed: false,
          latestQualityGatesPassed: false,
          greenCriteriaEligible: false,
        }),
        makeGovernanceResult("community_membership_saas", "green", "remain_green"),
        makeGovernanceResult("simple_crm_saas", "green", "remain_green"),
        makeGovernanceResult("internal_admin_ops_saas", "green", "remain_green"),
      ];

      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: governance,
        derivationReport: makeDerivationReport(),
      });

      const declining = filterTemplateAnalytics(analytics, { trend: "declining" });
      expect(declining.length).toBeGreaterThanOrEqual(1);
      expect(declining.some((a) => a.templateId === "reservation_saas")).toBe(true);
    });

    it("applies multiple filters", () => {
      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const result = filterTemplateAnalytics(analytics, {
        healthState: "green",
        domain: "reservation",
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.templateId).toBe("reservation_saas");
    });
  });

  // 6. Sorting
  describe("Sorting", () => {
    it("sorts by overallRankScore by default", () => {
      const report = makeMarketplaceReport({
        adoptionIntents: [
          { intentId: "a1", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "u1" },
        ],
      });

      const analytics = buildTemplateAnalytics({
        marketplaceReport: report,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const ranked = rankTemplates(analytics);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1]!.overallRankScore).toBeGreaterThanOrEqual(
          ranked[i]!.overallRankScore,
        );
      }
    });

    it("sorts by healthScore when specified", () => {
      const governance = [
        makeGovernanceResult("membership_content_affiliate", "green", "remain_green"),
        makeGovernanceResult("reservation_saas", "at_risk", "mark_at_risk", {
          recentDegradedCount: 2,
          greenCriteriaEligible: false,
        }),
        makeGovernanceResult("community_membership_saas", "green", "remain_green"),
        makeGovernanceResult("simple_crm_saas", "degraded", "mark_degraded", {
          recentPassCount: 0,
          recentFailCount: 3,
          consecutivePassCount: 0,
          consecutiveFailCount: 3,
          latestBaselinePassed: false,
          latestQualityGatesPassed: false,
          greenCriteriaEligible: false,
        }),
        makeGovernanceResult("internal_admin_ops_saas", "green", "remain_green"),
      ];

      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: governance,
        derivationReport: makeDerivationReport(),
      });

      const ranked = rankTemplates(analytics, "healthScore");
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1]!.healthScore).toBeGreaterThanOrEqual(
          ranked[i]!.healthScore,
        );
      }
    });

    it("sorts by adoptionIntentCount", () => {
      const report = makeMarketplaceReport({
        adoptionIntents: [
          { intentId: "a1", templateId: "simple_crm_saas", action: "adopt_template", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "u1" },
          { intentId: "a2", templateId: "simple_crm_saas", action: "adopt_template", requestedAt: "2026-03-17T00:01:00.000Z", requestedBy: "u2" },
          { intentId: "a3", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:02:00.000Z", requestedBy: "u3" },
        ],
      });

      const analytics = buildTemplateAnalytics({
        marketplaceReport: report,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const ranked = rankTemplates(analytics, "adoptionIntentCount");
      expect(ranked[0]!.templateId).toBe("simple_crm_saas");
      expect(ranked[0]!.adoptionIntentCount).toBe(2);
      expect(ranked[1]!.templateId).toBe("reservation_saas");
      expect(ranked[1]!.adoptionIntentCount).toBe(1);
    });
  });

  // 7. Explainable reasons
  describe("Explainability", () => {
    it("includes health, stability, and marketplace reasons", () => {
      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      for (const a of analytics) {
        expect(a.reasons.length).toBeGreaterThanOrEqual(3);
        expect(a.reasons.some((r) => r.startsWith("Health:"))).toBe(true);
        expect(a.reasons.some((r) => r.startsWith("Stability:"))).toBe(true);
        expect(a.reasons.some((r) => r.startsWith("Marketplace:"))).toBe(true);
      }
    });

    it("includes adoption reason when intents exist", () => {
      const report = makeMarketplaceReport({
        adoptionIntents: [
          { intentId: "a1", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "u1" },
        ],
      });

      const analytics = buildTemplateAnalytics({
        marketplaceReport: report,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const rsv = analytics.find((a) => a.templateId === "reservation_saas")!;
      expect(rsv.reasons.some((r) => r.includes("Adoption:"))).toBe(true);
    });

    it("includes trend reason for non-stable trends", () => {
      const governance = [
        makeGovernanceResult("membership_content_affiliate", "green", "promote_to_green"),
        makeGovernanceResult("reservation_saas", "green", "remain_green"),
        makeGovernanceResult("community_membership_saas", "green", "remain_green"),
        makeGovernanceResult("simple_crm_saas", "green", "remain_green"),
        makeGovernanceResult("internal_admin_ops_saas", "green", "remain_green"),
      ];

      const analytics = buildTemplateAnalytics({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: governance,
        derivationReport: makeDerivationReport(),
      });

      const mca = analytics.find((a) => a.templateId === "membership_content_affiliate")!;
      expect(mca.trend).toBe("rising");
      expect(mca.reasons.some((r) => r.includes("Trend: rising"))).toBe(true);
    });
  });

  // 8. Rank score computation
  describe("Rank Score Computation", () => {
    it("computeTemplateRankScore returns bounded value", () => {
      const maxScore = computeTemplateRankScore({
        healthScore: 1.0,
        stabilityScore: 1.0,
        adoptionIntentNorm: 1.0,
        derivationIntentNorm: 1.0,
        derivationReadinessScore: 1.0,
        marketplaceMaturityScore: 1.0,
      });
      expect(maxScore).toBeLessThanOrEqual(1.0);
      expect(maxScore).toBeGreaterThan(0);

      const minScore = computeTemplateRankScore({
        healthScore: 0,
        stabilityScore: 0,
        adoptionIntentNorm: 0,
        derivationIntentNorm: 0,
        derivationReadinessScore: 0,
        marketplaceMaturityScore: 0,
      });
      expect(minScore).toBe(0);
    });

    it("higher health score yields higher rank score", () => {
      const base = {
        stabilityScore: 0.5,
        adoptionIntentNorm: 0,
        derivationIntentNorm: 0,
        derivationReadinessScore: 0.5,
        marketplaceMaturityScore: 0.5,
      };

      const highHealth = computeTemplateRankScore({ ...base, healthScore: 1.0 });
      const lowHealth = computeTemplateRankScore({ ...base, healthScore: 0.3 });
      expect(highHealth).toBeGreaterThan(lowHealth);
    });
  });

  // 9. Ranking report
  describe("Ranking Report", () => {
    it("builds report with marketplace categories", () => {
      const report = buildTemplateRankingReport({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      expect(report.rankings).toHaveLength(5);
      expect(report.topRanked.length).toBeLessThanOrEqual(3);
      expect(report.bestDerivationParents.length).toBeLessThanOrEqual(3);
      expect(report.summary.totalTemplates).toBe(5);
      expect(report.generatedAt).toBeTruthy();
    });

    it("underusedHealthy includes green templates with no adoption", () => {
      const report = buildTemplateRankingReport({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      // All templates are green and have 0 adoption → all should be underused
      expect(report.underusedHealthy.length).toBe(5);
    });

    it("underusedHealthy excludes templates with adoption intents", () => {
      const mktReport = makeMarketplaceReport({
        adoptionIntents: [
          { intentId: "a1", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "u1" },
        ],
      });

      const report = buildTemplateRankingReport({
        marketplaceReport: mktReport,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      expect(report.underusedHealthy.some((a) => a.templateId === "reservation_saas")).toBe(false);
      expect(report.underusedHealthy.length).toBe(4);
    });
  });

  // 10. Formatting and read-only
  describe("Formatting and Read-Only", () => {
    it("formats report output", () => {
      const report = buildTemplateRankingReport({
        marketplaceReport: makeMarketplaceReport(),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      const output = formatTemplateRankingReport(report);
      expect(output).toContain("TEMPLATE ANALYTICS / RANKING REPORT");
      expect(output).toContain("RANKINGS:");
      expect(output).toContain("reservation_saas");
      expect(output).toContain("TOP RANKED:");
    });

    it("building analytics does not modify marketplace state", () => {
      const mktReport = makeMarketplaceReport();
      const itemsBefore = [...mktReport.items];

      buildTemplateAnalytics({
        marketplaceReport: mktReport,
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      });

      // Items unchanged
      expect(mktReport.items).toEqual(itemsBefore);
    });

    it("same inputs always yield same ranking output", () => {
      const overrides = {
        marketplaceReport: makeMarketplaceReport({
          adoptionIntents: [
            { intentId: "a1", templateId: "reservation_saas", action: "adopt_template", requestedAt: "2026-03-17T00:00:00.000Z", requestedBy: "u1" },
          ],
        }),
        governanceResults: allGreenGovernance(),
        derivationReport: makeDerivationReport(),
      };

      const report1 = buildTemplateRankingReport(overrides);
      const report2 = buildTemplateRankingReport(overrides);

      expect(report1.rankings.map((a) => a.templateId)).toEqual(
        report2.rankings.map((a) => a.templateId),
      );
      expect(report1.rankings.map((a) => a.overallRankScore)).toEqual(
        report2.rankings.map((a) => a.overallRankScore),
      );
    });
  });
});
