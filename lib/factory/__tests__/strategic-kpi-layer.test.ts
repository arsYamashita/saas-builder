import { describe, it, expect } from "vitest";
import {
  computePortfolioKpis,
  computeQualityStabilityKpis,
  computeMarketplaceKpis,
  computeReleaseRuntimeKpis,
  computeStrategyScenarioKpis,
  computeDomainKpiRollups,
  buildStrategicKpiReport,
  formatKpiRecord,
  formatCategorySummary,
  formatStrategicKpiReport,
  type KpiInputs,
  type KpiRecord,
  type KpiStatus,
  type StrategicKpiReport,
} from "../strategic-kpi-layer";

// ---------------------------------------------------------------------------
// Helper: minimal KPI inputs factory
// ---------------------------------------------------------------------------

function makeInputs(overrides?: Partial<KpiInputs>): KpiInputs {
  return {
    governanceSummary: {
      candidateCount: 0,
      greenCount: 5,
      atRiskCount: 0,
      degradedCount: 0,
      demotedCount: 0,
      promoteToGreenCount: 0,
      demoteCount: 0,
      eligibleForRepromotionCount: 0,
      ...overrides?.governanceSummary,
    },
    rankingReport: {
      rankings: [],
      topRanked: [],
      bestDerivationParents: [],
      underusedHealthy: [],
      summary: {
        totalTemplates: 5,
        risingCount: 1,
        stableCount: 3,
        decliningCount: 1,
        averageOverallScore: 0.65,
        averageHealthScore: 0.75,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.rankingReport,
    },
    marketplaceReport: {
      items: [],
      adoptionIntents: [],
      derivationIntents: [],
      summary: {
        totalItems: 5,
        publishedCount: 4,
        experimentalCount: 1,
        unpublishedCount: 0,
        adoptionIntentCount: 3,
        derivationIntentCount: 2,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.marketplaceReport,
    },
    releaseReport: {
      catalog: [],
      candidates: [],
      plans: [],
      history: [],
      summary: {
        candidateCount: 1,
        devCount: 1,
        stagingCount: 1,
        prodCount: 3,
        totalHistory: 5,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.releaseReport,
    },
    runtimeReport: {
      recentRuns: [],
      summary: {
        totalRuns: 0,
        lastRunAt: null,
        lastRunStatus: null,
        lastRunGroup: null,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.runtimeReport,
    },
    orchestrationReport: {
      registry: [],
      recentRuns: [],
      summary: {
        totalJobs: 7,
        totalRuns: 0,
        lastRunAt: null,
        lastRunStatus: null,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.orchestrationReport,
    },
    rollbackReport: {
      candidates: [],
      history: [],
      summary: {
        totalCandidates: 0,
        readyCount: 0,
        rolledBackCount: 0,
        skippedCount: 0,
        failedCount: 0,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.rollbackReport,
    },
    portfolioReport: {
      domainStrategies: [],
      expansionPriorities: [],
      stabilizationPriorities: [],
      maintainDomains: [],
      gaps: [],
      summary: {
        totalDomains: 12,
        coveredDomains: 6,
        uncoveredDomains: 6,
        expandCount: 2,
        stabilizeCount: 1,
        maintainCount: 3,
        gapFillCount: 6,
        averageCoverageScore: 0.5,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.portfolioReport,
    },
    scenarioReport: {
      expansionScenarios: [],
      gapFillScenarios: [],
      stabilizationScenarios: [],
      summary: {
        totalScenarios: 5,
        expansionCount: 2,
        gapFillCount: 2,
        stabilizationCount: 1,
        totalNewTemplates: 6,
        averagePriority: 0.55,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.scenarioReport,
    },
    recommendationReport: {
      byUseCase: {} as Record<string, never>,
      byDomain: {},
      bestDerivationParents: [],
      safestProductionTemplates: [],
      underusedHighQuality: [],
      risingTemplates: [],
      summary: {
        totalRecommendations: 10,
        useCasesCovered: 5,
        domainsCovered: 4,
        bestDerivationParentCount: 3,
        underusedCount: 1,
        risingCount: 2,
      },
      generatedAt: "2026-03-17T00:00:00.000Z",
      ...overrides?.recommendationReport,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Strategic KPI Layer", () => {
  // 1. Determinism
  describe("determinism", () => {
    it("produces identical results on repeated calls", () => {
      const inputs = makeInputs();
      const a = computePortfolioKpis(inputs);
      const b = computePortfolioKpis(inputs);
      expect(a).toEqual(b);
    });

    it("full report is deterministic", () => {
      const inputs = makeInputs();
      const r1 = buildStrategicKpiReport(inputs);
      const r2 = buildStrategicKpiReport(inputs);
      // Compare everything except generatedAt
      expect(r1.categories).toEqual(r2.categories);
      expect(r1.domainRollups).toEqual(r2.domainRollups);
      expect(r1.summary).toEqual(r2.summary);
    });
  });

  // 2. Portfolio KPIs
  describe("portfolio KPIs", () => {
    it("computes 5 KPIs", () => {
      const kpis = computePortfolioKpis(makeInputs());
      expect(kpis).toHaveLength(5);
      expect(kpis.every((k) => k.category === "portfolio")).toBe(true);
    });

    it("green rate strong when 100%", () => {
      const inputs = makeInputs({
        governanceSummary: {
          candidateCount: 0, greenCount: 5, atRiskCount: 0,
          degradedCount: 0, demotedCount: 0, promoteToGreenCount: 0,
          demoteCount: 0, eligibleForRepromotionCount: 0,
        },
      });
      const kpis = computePortfolioKpis(inputs);
      const greenRate = kpis.find((k) => k.kpiKey === "portfolio_green_rate")!;
      expect(greenRate.value).toBe(100);
      expect(greenRate.status).toBe("strong");
    });

    it("green rate weak when low", () => {
      const inputs = makeInputs({
        governanceSummary: {
          candidateCount: 8, greenCount: 1, atRiskCount: 1,
          degradedCount: 0, demotedCount: 0, promoteToGreenCount: 0,
          demoteCount: 0, eligibleForRepromotionCount: 0,
        },
      });
      const kpis = computePortfolioKpis(inputs);
      const greenRate = kpis.find((k) => k.kpiKey === "portfolio_green_rate")!;
      expect(greenRate.status).toBe("weak");
    });

    it("gap count strong when zero", () => {
      const inputs = makeInputs({
        portfolioReport: {
          domainStrategies: [], expansionPriorities: [], stabilizationPriorities: [],
          maintainDomains: [], gaps: [],
          summary: {
            totalDomains: 12, coveredDomains: 12, uncoveredDomains: 0,
            expandCount: 0, stabilizeCount: 0, maintainCount: 12, gapFillCount: 0,
            averageCoverageScore: 0.9,
          },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const kpis = computePortfolioKpis(inputs);
      const gapCount = kpis.find((k) => k.kpiKey === "portfolio_gap_count")!;
      expect(gapCount.value).toBe(0);
      expect(gapCount.status).toBe("strong");
    });
  });

  // 3. Quality & Stability KPIs
  describe("quality & stability KPIs", () => {
    it("computes 5 KPIs", () => {
      const kpis = computeQualityStabilityKpis(makeInputs());
      expect(kpis).toHaveLength(5);
      expect(kpis.every((k) => k.category === "quality_stability")).toBe(true);
    });

    it("risk rate strong when no at-risk/degraded", () => {
      const kpis = computeQualityStabilityKpis(makeInputs());
      const riskRate = kpis.find((k) => k.kpiKey === "quality_risk_rate")!;
      expect(riskRate.value).toBe(0);
      expect(riskRate.status).toBe("strong");
    });

    it("rollback failures affect status", () => {
      const inputs = makeInputs({
        rollbackReport: {
          candidates: [], history: [],
          summary: { totalCandidates: 5, readyCount: 0, rolledBackCount: 2, skippedCount: 0, failedCount: 3 },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const kpis = computeQualityStabilityKpis(inputs);
      const rollback = kpis.find((k) => k.kpiKey === "quality_rollback_failures")!;
      expect(rollback.value).toBe(3);
      expect(rollback.status).toBe("warning");
    });
  });

  // 4. Marketplace KPIs
  describe("marketplace KPIs", () => {
    it("computes 5 KPIs", () => {
      const kpis = computeMarketplaceKpis(makeInputs());
      expect(kpis).toHaveLength(5);
      expect(kpis.every((k) => k.category === "marketplace")).toBe(true);
    });

    it("published rate reflects marketplace summary", () => {
      const kpis = computeMarketplaceKpis(makeInputs());
      const published = kpis.find((k) => k.kpiKey === "marketplace_published_rate")!;
      expect(published.value).toBe(80); // 4/5 = 80%
      expect(published.status).toBe("strong");
    });

    it("underused count inverse: 0 = strong", () => {
      const inputs = makeInputs({
        recommendationReport: {
          byUseCase: {} as Record<string, never>,
          byDomain: {},
          bestDerivationParents: [],
          safestProductionTemplates: [],
          underusedHighQuality: [],
          risingTemplates: [],
          summary: {
            totalRecommendations: 10, useCasesCovered: 5, domainsCovered: 4,
            bestDerivationParentCount: 3, underusedCount: 0, risingCount: 2,
          },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const kpis = computeMarketplaceKpis(inputs);
      const underused = kpis.find((k) => k.kpiKey === "marketplace_underused_count")!;
      expect(underused.value).toBe(0);
      expect(underused.status).toBe("strong");
    });
  });

  // 5. Release & Runtime KPIs
  describe("release & runtime KPIs", () => {
    it("computes 5 KPIs", () => {
      const kpis = computeReleaseRuntimeKpis(makeInputs());
      expect(kpis).toHaveLength(5);
      expect(kpis.every((k) => k.category === "release_runtime")).toBe(true);
    });

    it("production count reflects release summary", () => {
      const kpis = computeReleaseRuntimeKpis(makeInputs());
      const prod = kpis.find((k) => k.kpiKey === "release_prod_count")!;
      expect(prod.value).toBe(3);
      expect(prod.status).toBe("strong");
    });

    it("runtime success rate handles empty runs", () => {
      const kpis = computeReleaseRuntimeKpis(makeInputs());
      const runtime = kpis.find((k) => k.kpiKey === "release_runtime_success_rate")!;
      expect(runtime.value).toBe(0);
    });

    it("runtime success rate with completed runs", () => {
      const inputs = makeInputs({
        runtimeReport: {
          recentRuns: [
            { runId: "r1", mode: "execute", status: "completed", jobs: [], executionOrder: [], totalJobs: 7, completedJobs: 7, failedJobs: 0, skippedJobs: 0, executedBy: "system", group: null, startedAt: "", completedAt: "" },
            { runId: "r2", mode: "execute", status: "completed", jobs: [], executionOrder: [], totalJobs: 7, completedJobs: 7, failedJobs: 0, skippedJobs: 0, executedBy: "system", group: null, startedAt: "", completedAt: "" },
            { runId: "r3", mode: "execute", status: "failed", jobs: [], executionOrder: [], totalJobs: 7, completedJobs: 0, failedJobs: 7, skippedJobs: 0, executedBy: "system", group: null, startedAt: "", completedAt: "" },
          ] as any[],
          summary: { totalRuns: 3, lastRunAt: "2026-03-17T00:00:00.000Z", lastRunStatus: "failed", lastRunGroup: null },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const kpis = computeReleaseRuntimeKpis(inputs);
      const runtime = kpis.find((k) => k.kpiKey === "release_runtime_success_rate")!;
      expect(runtime.value).toBeCloseTo(66.7, 0);
      expect(runtime.status).toBe("warning");
    });
  });

  // 6. Strategy & Scenario KPIs
  describe("strategy & scenario KPIs", () => {
    it("computes 5 KPIs", () => {
      const kpis = computeStrategyScenarioKpis(makeInputs());
      expect(kpis).toHaveLength(5);
      expect(kpis.every((k) => k.category === "strategy_scenario")).toBe(true);
    });

    it("total scenarios reflects scenario report", () => {
      const kpis = computeStrategyScenarioKpis(makeInputs());
      const total = kpis.find((k) => k.kpiKey === "strategy_total_scenarios")!;
      expect(total.value).toBe(5);
      expect(total.status).toBe("strong");
    });

    it("stabilize count inverse: 0 = strong", () => {
      const inputs = makeInputs({
        portfolioReport: {
          domainStrategies: [], expansionPriorities: [], stabilizationPriorities: [],
          maintainDomains: [], gaps: [],
          summary: {
            totalDomains: 12, coveredDomains: 12, uncoveredDomains: 0,
            expandCount: 0, stabilizeCount: 0, maintainCount: 12, gapFillCount: 0,
            averageCoverageScore: 0.9,
          },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const kpis = computeStrategyScenarioKpis(inputs);
      const stabilize = kpis.find((k) => k.kpiKey === "strategy_stabilize_domains")!;
      expect(stabilize.value).toBe(0);
      expect(stabilize.status).toBe("strong");
    });
  });

  // 7. Domain-level rollups
  describe("domain-level rollups", () => {
    it("generates rollup per domain strategy", () => {
      const inputs = makeInputs({
        portfolioReport: {
          domainStrategies: [
            {
              domain: "reservation", templateCount: 1, greenCount: 1, prodCount: 1,
              averageHealthScore: 0.9, averageStabilityScore: 0.8, averageRankScore: 0.7,
              adoptionInterest: 2, derivationInterest: 1, derivationPotential: 0.6,
              coverageScore: 0.75, expansionPriorityScore: 0.5, strategy: "maintain" as const,
              reasons: [],
            },
            {
              domain: "crm", templateCount: 1, greenCount: 1, prodCount: 1,
              averageHealthScore: 0.85, averageStabilityScore: 0.7, averageRankScore: 0.65,
              adoptionInterest: 1, derivationInterest: 0, derivationPotential: 0.4,
              coverageScore: 0.6, expansionPriorityScore: 0.3, strategy: "expand" as const,
              reasons: [],
            },
          ],
          expansionPriorities: [], stabilizationPriorities: [], maintainDomains: [], gaps: [],
          summary: {
            totalDomains: 12, coveredDomains: 6, uncoveredDomains: 6,
            expandCount: 1, stabilizeCount: 0, maintainCount: 1, gapFillCount: 0,
            averageCoverageScore: 0.5,
          },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const rollups = computeDomainKpiRollups(inputs);
      expect(rollups).toHaveLength(2);
      expect(rollups[0].domain).toBe("reservation");
      expect(rollups[0].strategy).toBe("maintain");
      expect(rollups[0].kpis.length).toBeGreaterThanOrEqual(3);
      expect(rollups[1].domain).toBe("crm");
    });

    it("each rollup has overallStatus", () => {
      const inputs = makeInputs({
        portfolioReport: {
          domainStrategies: [{
            domain: "reservation", templateCount: 1, greenCount: 1, prodCount: 1,
            averageHealthScore: 0.9, averageStabilityScore: 0.8, averageRankScore: 0.7,
            adoptionInterest: 2, derivationInterest: 1, derivationPotential: 0.6,
            coverageScore: 0.75, expansionPriorityScore: 0.5, strategy: "maintain" as const,
            reasons: [],
          }],
          expansionPriorities: [], stabilizationPriorities: [], maintainDomains: [], gaps: [],
          summary: {
            totalDomains: 12, coveredDomains: 6, uncoveredDomains: 6,
            expandCount: 0, stabilizeCount: 0, maintainCount: 1, gapFillCount: 0,
            averageCoverageScore: 0.5,
          },
          generatedAt: "2026-03-17T00:00:00.000Z",
        },
      });
      const rollups = computeDomainKpiRollups(inputs);
      expect(rollups[0].overallStatus).toBeDefined();
      expect(["strong", "healthy", "warning", "weak"]).toContain(rollups[0].overallStatus);
    });
  });

  // 8. Status classification
  describe("status classification", () => {
    it("all KPIs have valid status", () => {
      const inputs = makeInputs();
      const report = buildStrategicKpiReport(inputs);
      const validStatuses: KpiStatus[] = ["strong", "healthy", "warning", "weak"];
      for (const category of report.categories) {
        for (const kpi of category.kpis) {
          expect(validStatuses).toContain(kpi.status);
        }
      }
    });

    it("each KPI has non-empty reasons", () => {
      const inputs = makeInputs();
      const report = buildStrategicKpiReport(inputs);
      for (const category of report.categories) {
        for (const kpi of category.kpis) {
          expect(kpi.reasons.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // 9. Full report structure
  describe("full report", () => {
    it("has 5 categories", () => {
      const report = buildStrategicKpiReport(makeInputs());
      expect(report.categories).toHaveLength(5);
    });

    it("has 25 total KPIs (5 per category)", () => {
      const report = buildStrategicKpiReport(makeInputs());
      expect(report.summary.totalKpis).toBe(25);
      for (const category of report.categories) {
        expect(category.kpis).toHaveLength(5);
      }
    });

    it("category labels are Japanese", () => {
      const report = buildStrategicKpiReport(makeInputs());
      const labels = report.categories.map((c) => c.label);
      expect(labels).toContain("ポートフォリオ");
      expect(labels).toContain("品質・安定性");
      expect(labels).toContain("マーケットプレイス");
      expect(labels).toContain("リリース・ランタイム");
      expect(labels).toContain("戦略・シナリオ");
    });

    it("summary has overallScore and overallStatus", () => {
      const report = buildStrategicKpiReport(makeInputs());
      expect(report.summary.overallScore).toBeGreaterThan(0);
      expect(["strong", "healthy", "warning", "weak"]).toContain(report.summary.overallStatus);
    });

    it("summary counts add up", () => {
      const report = buildStrategicKpiReport(makeInputs());
      const sum = report.summary.strongCount + report.summary.healthyCount +
        report.summary.warningCount + report.summary.weakCount;
      expect(sum).toBe(report.summary.totalKpis);
    });
  });

  // 10. Formatting
  describe("formatting", () => {
    it("formatKpiRecord includes label and value", () => {
      const kpi: KpiRecord = {
        kpiKey: "test_kpi",
        category: "portfolio",
        label: "テスト KPI",
        value: 80,
        unit: "%",
        status: "strong",
        reasons: ["理由1"],
      };
      const formatted = formatKpiRecord(kpi);
      expect(formatted).toContain("テスト KPI");
      expect(formatted).toContain("80%");
      expect(formatted).toContain("[STRONG]");
      expect(formatted).toContain("理由1");
    });

    it("formatStrategicKpiReport includes all sections", () => {
      const report = buildStrategicKpiReport(makeInputs());
      const formatted = formatStrategicKpiReport(report);
      expect(formatted).toContain("Strategic KPI Report");
      expect(formatted).toContain("ポートフォリオ");
      expect(formatted).toContain("品質・安定性");
      expect(formatted).toContain("マーケットプレイス");
      expect(formatted).toContain("Generated:");
    });
  });

  // 11. Read-only verification
  describe("read-only", () => {
    it("does not mutate inputs", () => {
      const inputs = makeInputs();
      const frozen = JSON.parse(JSON.stringify(inputs));
      buildStrategicKpiReport(inputs);
      expect(inputs.governanceSummary).toEqual(frozen.governanceSummary);
      expect(inputs.rankingReport.summary).toEqual(frozen.rankingReport.summary);
      expect(inputs.portfolioReport.summary).toEqual(frozen.portfolioReport.summary);
    });
  });

  // 12. Integration with default build
  describe("integration", () => {
    it("buildStrategicKpiReport() runs without overrides", () => {
      const report = buildStrategicKpiReport();
      expect(report.categories).toHaveLength(5);
      expect(report.summary.totalKpis).toBe(25);
      expect(report.generatedAt).toBeTruthy();
    });

    it("all KPI keys are unique", () => {
      const report = buildStrategicKpiReport(makeInputs());
      const allKeys = report.categories.flatMap((c) => c.kpis.map((k) => k.kpiKey));
      const uniqueKeys = new Set(allKeys);
      expect(uniqueKeys.size).toBe(allKeys.length);
    });

    it("all KPI units are non-empty", () => {
      const report = buildStrategicKpiReport(makeInputs());
      for (const category of report.categories) {
        for (const kpi of category.kpis) {
          expect(kpi.unit.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
