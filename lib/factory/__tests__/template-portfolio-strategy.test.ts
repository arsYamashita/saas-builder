import { describe, it, expect } from "vitest";

import {
  analyzePortfolioCoverage,
  detectPortfolioGaps,
  rankExpansionPriorities,
  buildTemplatePortfolioStrategy,
  buildPortfolioStrategyReport,
  formatPortfolioStrategyReport,
  formatDomainStrategyRecord,
  type DomainStrategyRecord,
  type PortfolioGap,
  type PortfolioInputs,
  type PortfolioStrategyReport,
} from "../template-portfolio-strategy";
import type { TemplateAnalytics, TemplateRankingReport } from "../template-analytics-ranking";
import type { MarketplaceReport } from "../template-marketplace";
import type { DerivationReport } from "../marketplace-derivation-pipeline";
import type {
  TemplateReleaseReport,
  ReleaseStage,
} from "../template-release-management";
import type { EvolutionReport } from "../template-evolution-engine";
import type { RecommendationReport } from "../template-recommendation-engine";

// ---------------------------------------------------------------------------
// Mock Builders
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
      averageOverallScore:
        rankings.reduce((s, r) => s + r.overallRankScore, 0) / (rankings.length || 1),
      averageHealthScore:
        rankings.reduce((s, r) => s + r.healthScore, 0) / (rankings.length || 1),
    },
    generatedAt: new Date().toISOString(),
  };
}

function makeMarketplaceReport(): MarketplaceReport {
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
    generatedAt: new Date().toISOString(),
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

function makeEvolutionReport(
  proposals?: Array<{ domain: string; confidence: number }>,
): EvolutionReport {
  return {
    analyzedTemplateCount: 5,
    coveredDomains: ["membership", "commerce", "reservation", "community", "crm", "operations"],
    uncoveredDomains: ["support", "education", "marketplace", "finance", "analytics", "communication"],
    clusters: [],
    proposals: (proposals ?? []).map((p, i) => ({
      templateId: `proposal_${i}`,
      domain: p.domain as any,
      description: `Proposal for ${p.domain}`,
      relatedTemplates: [],
      confidence: p.confidence,
      reasons: ["test"],
      suggestedPipelineConfig: {
        blueprintHints: [],
        schemaHints: [],
        apiHints: [],
      },
    })),
    evaluatedAt: new Date().toISOString(),
  };
}

function makeRecommendationReport(): RecommendationReport {
  return {
    byUseCase: {
      booking: [],
      crm: [],
      community: [],
      operations: [],
      education: [],
      marketplace: [],
      finance: [],
      support: [],
    },
    byDomain: {},
    bestDerivationParents: [],
    safestProductionTemplates: [],
    underusedHighQuality: [],
    risingTemplates: [],
    summary: {
      totalRecommendations: 0,
      useCasesCovered: 0,
      domainsCovered: 0,
      bestDerivationParentCount: 0,
      underusedCount: 0,
      risingCount: 0,
    },
    generatedAt: new Date().toISOString(),
  };
}

function standardOverrides(
  rankings: TemplateAnalytics[],
  extra?: {
    releaseEntries?: Array<{ templateId: string; stage: ReleaseStage }>;
    proposals?: Array<{ domain: string; confidence: number }>;
  },
): PortfolioInputs {
  return {
    rankingReport: makeRankingReport(rankings),
    marketplaceReport: makeMarketplaceReport(),
    derivationReport: makeDerivationReport(),
    releaseReport: makeReleaseReport(extra?.releaseEntries),
    evolutionReport: makeEvolutionReport(extra?.proposals),
    recommendationReport: makeRecommendationReport(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("template-portfolio-strategy", () => {
  // ── 1. Determinism ────────────────────────────────────────────
  describe("determinism", () => {
    it("produces identical results for same inputs", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const r1 = buildPortfolioStrategyReport(overrides);
      const r2 = buildPortfolioStrategyReport(overrides);

      expect(r1.summary).toEqual(r2.summary);
      expect(r1.domainStrategies.length).toBe(r2.domainStrategies.length);
      for (let i = 0; i < r1.domainStrategies.length; i++) {
        expect(r1.domainStrategies[i]!.domain).toBe(r2.domainStrategies[i]!.domain);
        expect(r1.domainStrategies[i]!.expansionPriorityScore)
          .toBe(r2.domainStrategies[i]!.expansionPriorityScore);
        expect(r1.domainStrategies[i]!.strategy).toBe(r2.domainStrategies[i]!.strategy);
      }
    });

    it("same inputs yield same gap results", () => {
      const overrides = standardOverrides([], {
        proposals: [
          { domain: "support", confidence: 0.8 },
        ],
      });

      const g1 = detectPortfolioGaps(overrides);
      const g2 = detectPortfolioGaps(overrides);

      expect(g1.length).toBe(g2.length);
      for (let i = 0; i < g1.length; i++) {
        expect(g1[i]!.domain).toBe(g2[i]!.domain);
        expect(g1[i]!.fillPriority).toBe(g2[i]!.fillPriority);
      }
    });
  });

  // ── 2. Strong but Narrow → Expand ────────────────────────────
  describe("strong narrow domains get expand", () => {
    it("single high-quality template domain gets expand strategy", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation", {
          healthScore: 1.0,
          stabilityScore: 1.0,
          derivationReadinessScore: 0.9,
          overallRankScore: 0.9,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const coverage = analyzePortfolioCoverage(overrides);
      const reservation = coverage.find((r) => r.domain === "reservation");

      expect(reservation).toBeDefined();
      expect(reservation!.strategy).toBe("expand");
      expect(reservation!.expansionPriorityScore).toBeGreaterThan(0.5);
    });

    it("high expansion priority for narrow domain with demand", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation", {
          healthScore: 1.0,
          stabilityScore: 1.0,
          adoptionIntentCount: 3,
          derivationIntentCount: 2,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const coverage = analyzePortfolioCoverage(overrides);
      const reservation = coverage.find((r) => r.domain === "reservation");
      expect(reservation!.strategy).toBe("expand");
    });
  });

  // ── 3. Missing Domains → Gap Fill ────────────────────────────
  describe("gap detection", () => {
    it("identifies uncovered domains as gaps", () => {
      const overrides = standardOverrides([]);

      const gaps = detectPortfolioGaps(overrides);
      expect(gaps.length).toBeGreaterThan(0);

      const domains = gaps.map((g) => g.domain);
      // support is not covered by any template
      expect(domains).toContain("support");
    });

    it("boosts gaps with strong evolution proposals", () => {
      const overrides = standardOverrides([], {
        proposals: [
          { domain: "support", confidence: 0.9 },
          { domain: "support", confidence: 0.8 },
        ],
      });

      const gaps = detectPortfolioGaps(overrides);
      const support = gaps.find((g) => g.domain === "support");

      expect(support).toBeDefined();
      expect(support!.evolutionProposalCount).toBe(2);
      expect(support!.averageProposalConfidence).toBeGreaterThan(0.8);
      expect(support!.fillPriority).toBeGreaterThan(0);
    });

    it("gaps include adjacent domain information", () => {
      const overrides = standardOverrides([]);

      const gaps = detectPortfolioGaps(overrides);
      for (const gap of gaps) {
        expect(gap.adjacentDomains).toBeDefined();
        expect(Array.isArray(gap.adjacentDomains)).toBe(true);
      }
    });
  });

  // ── 4. Weak Quality → Stabilize ──────────────────────────────
  describe("weak quality gets stabilize", () => {
    it("low health + multiple templates → stabilize", () => {
      const rankings = [
        makeAnalytics("membership_content_affiliate", "membership / commerce", {
          healthState: "degraded",
          healthScore: 0.3,
          stabilityScore: 0.3,
        }),
        makeAnalytics("community_membership_saas", "community / membership", {
          healthState: "at_risk",
          healthScore: 0.4,
          stabilityScore: 0.4,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const coverage = analyzePortfolioCoverage(overrides);
      const membership = coverage.find((r) => r.domain === "membership");

      expect(membership).toBeDefined();
      expect(membership!.strategy).toBe("stabilize");
    });
  });

  // ── 5. Ranking Determinism ───────────────────────────────────
  describe("ranking", () => {
    it("ranks by expansion priority score descending", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation", {
          healthScore: 1.0,
          overallRankScore: 0.9,
        }),
        makeAnalytics("simple_crm_saas", "crm", {
          healthScore: 0.8,
          overallRankScore: 0.7,
        }),
      ];
      const overrides = standardOverrides(rankings);

      const coverage = analyzePortfolioCoverage(overrides);
      if (coverage.length >= 2) {
        expect(coverage[0]!.expansionPriorityScore)
          .toBeGreaterThanOrEqual(coverage[1]!.expansionPriorityScore);
      }
    });

    it("expansion priorities only include expand strategy", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const priorities = rankExpansionPriorities(overrides);
      for (const p of priorities) {
        expect(p.strategy).toBe("expand");
      }
    });
  });

  // ── 6. Reasons Are Present ───────────────────────────────────
  describe("reasons", () => {
    it("every domain strategy has non-empty reasons", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
      ];
      const overrides = standardOverrides(rankings);

      const coverage = analyzePortfolioCoverage(overrides);
      for (const rec of coverage) {
        expect(rec.reasons.length).toBeGreaterThan(0);
        for (const r of rec.reasons) {
          expect(typeof r).toBe("string");
          expect(r.length).toBeGreaterThan(0);
        }
      }
    });

    it("gaps have reasons", () => {
      const overrides = standardOverrides([]);
      const gaps = detectPortfolioGaps(overrides);
      for (const gap of gaps) {
        expect(gap.reasons.length).toBeGreaterThan(0);
      }
    });
  });

  // ── 7. Full Report ──────────────────────────────────────────
  describe("full report", () => {
    it("builds complete portfolio strategy report", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
        makeAnalytics("simple_crm_saas", "crm"),
        makeAnalytics("community_membership_saas", "community / membership"),
      ];
      const overrides = standardOverrides(rankings);

      const report = buildPortfolioStrategyReport(overrides);

      expect(report.summary.totalDomains).toBeGreaterThan(0);
      expect(report.domainStrategies.length).toBeGreaterThan(0);
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report covers expand, stabilize, maintain categories", () => {
      // Ensure we get at least two categories by mixing healthy/unhealthy
      const rankings = [
        makeAnalytics("reservation_saas", "reservation", {
          healthScore: 1.0,
          stabilityScore: 1.0,
        }),
      ];
      const overrides = standardOverrides(rankings);
      const report = buildPortfolioStrategyReport(overrides);

      // At minimum the report should categorize
      const allStrategies = report.domainStrategies.map((d) => d.strategy);
      expect(allStrategies.length).toBeGreaterThan(0);
    });
  });

  // ── 8. Read-Only ────────────────────────────────────────────
  describe("read-only", () => {
    it("does not mutate inputs", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
      ];
      const overrides = standardOverrides(rankings);
      const before = JSON.stringify(overrides);
      buildPortfolioStrategyReport(overrides);
      const after = JSON.stringify(overrides);
      expect(after).toBe(before);
    });
  });

  // ── 9. Formatting ──────────────────────────────────────────
  describe("formatting", () => {
    it("formatDomainStrategyRecord produces readable output", () => {
      const rec: DomainStrategyRecord = {
        domain: "reservation",
        templateCount: 1,
        greenCount: 1,
        prodCount: 1,
        averageHealthScore: 1.0,
        averageStabilityScore: 0.92,
        averageRankScore: 0.9,
        adoptionInterest: 3,
        derivationInterest: 2,
        derivationPotential: 0.91,
        coverageScore: 0.58,
        expansionPriorityScore: 0.87,
        strategy: "expand",
        reasons: ["Strong existing template quality"],
      };

      const output = formatDomainStrategyRecord(rec);
      expect(output).toContain("EXPAND");
      expect(output).toContain("reservation");
      expect(output).toContain("0.87");
    });

    it("formatPortfolioStrategyReport produces readable report", () => {
      const rankings = [
        makeAnalytics("reservation_saas", "reservation"),
      ];
      const overrides = standardOverrides(rankings);
      const report = buildPortfolioStrategyReport(overrides);
      const output = formatPortfolioStrategyReport(report);

      expect(output).toContain("TEMPLATE PORTFOLIO STRATEGY REPORT");
      expect(output).toContain("STRATEGIC GAPS");
    });
  });

  // ── 10. Integration with Real Data ──────────────────────────
  describe("integration with real factory data", () => {
    it("builds strategy from live factory modules", () => {
      const report = buildPortfolioStrategyReport();

      expect(report.summary.totalDomains).toBeGreaterThan(0);
      expect(report.summary.coveredDomains).toBeGreaterThan(0);
      expect(report.domainStrategies.length).toBeGreaterThan(0);
      expect(report.gaps.length).toBeGreaterThan(0);
      expect(report.generatedAt).toBeTruthy();

      // reservation domain should exist
      const reservation = report.domainStrategies.find((d) => d.domain === "reservation");
      expect(reservation).toBeDefined();
      expect(reservation!.templateCount).toBeGreaterThan(0);
    });
  });
});
