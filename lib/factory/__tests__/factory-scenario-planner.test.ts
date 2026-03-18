import { describe, it, expect } from "vitest";

import {
  generateExpansionScenarios,
  generateGapFillScenarios,
  generateStabilizationScenarios,
  estimateScenarioImpact,
  buildFactoryScenarios,
  buildScenarioReport,
  formatScenario,
  formatScenarioReport,
  type ScenarioInputs,
  type FactoryScenario,
} from "../factory-scenario-planner";
import type {
  DomainStrategyRecord,
  PortfolioGap,
  PortfolioStrategyReport,
} from "../template-portfolio-strategy";
import type { EvolutionReport, TemplateDomain } from "../template-evolution-engine";

// ---------------------------------------------------------------------------
// Mock Builders
// ---------------------------------------------------------------------------

function makeDomainStrategy(
  domain: string,
  strategy: "expand" | "stabilize" | "maintain",
  overrides?: Partial<DomainStrategyRecord>,
): DomainStrategyRecord {
  return {
    domain,
    templateCount: 1,
    greenCount: 1,
    prodCount: 0,
    averageHealthScore: 1.0,
    averageStabilityScore: 1.0,
    averageRankScore: 0.85,
    adoptionInterest: 0,
    derivationInterest: 0,
    derivationPotential: 0.8,
    coverageScore: 0.5,
    expansionPriorityScore: 0.6,
    strategy,
    reasons: ["test"],
    ...overrides,
  };
}

function makeGap(
  domain: string,
  overrides?: Partial<PortfolioGap>,
): PortfolioGap {
  return {
    domain,
    adjacentDomains: [],
    adjacentTemplateCount: 0,
    evolutionProposalCount: 0,
    averageProposalConfidence: 0,
    fillPriority: 0.5,
    reasons: ["test gap"],
    ...overrides,
  };
}

function makePortfolioReport(
  expansionDomains: DomainStrategyRecord[],
  stabilizeDomains: DomainStrategyRecord[],
  gaps: PortfolioGap[],
): PortfolioStrategyReport {
  const all = [...expansionDomains, ...stabilizeDomains];
  return {
    domainStrategies: all,
    expansionPriorities: expansionDomains,
    stabilizationPriorities: stabilizeDomains,
    maintainDomains: [],
    gaps,
    summary: {
      totalDomains: 12,
      coveredDomains: all.length,
      uncoveredDomains: gaps.length,
      expandCount: expansionDomains.length,
      stabilizeCount: stabilizeDomains.length,
      maintainCount: 0,
      gapFillCount: gaps.length,
      averageCoverageScore: 0.5,
    },
    generatedAt: new Date().toISOString(),
  };
}

function makeEvolutionReport(
  proposals?: Array<{ domain: string; templateId: string; confidence: number }>,
): EvolutionReport {
  return {
    analyzedTemplateCount: 5,
    coveredDomains: ["membership", "commerce", "reservation", "community", "crm", "operations"],
    uncoveredDomains: ["support", "education", "marketplace", "finance", "analytics", "communication"],
    clusters: [],
    proposals: (proposals ?? []).map((p) => ({
      templateId: p.templateId,
      domain: p.domain as TemplateDomain,
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

function standardInputs(
  expansions: DomainStrategyRecord[],
  stabilizations: DomainStrategyRecord[],
  gaps: PortfolioGap[],
  proposals?: Array<{ domain: string; templateId: string; confidence: number }>,
): ScenarioInputs {
  return {
    portfolioReport: makePortfolioReport(expansions, stabilizations, gaps),
    evolutionReport: makeEvolutionReport(proposals),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("factory-scenario-planner", () => {
  // ── 1. Determinism ────────────────────────────────────────────
  describe("determinism", () => {
    it("produces identical results for same inputs", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [],
        [makeGap("support")],
      );

      const r1 = buildScenarioReport(inputs);
      const r2 = buildScenarioReport(inputs);

      expect(r1.summary).toEqual(r2.summary);
      expect(r1.expansionScenarios.length).toBe(r2.expansionScenarios.length);
      expect(r1.gapFillScenarios.length).toBe(r2.gapFillScenarios.length);

      for (let i = 0; i < r1.expansionScenarios.length; i++) {
        expect(r1.expansionScenarios[i]!.scenarioId)
          .toBe(r2.expansionScenarios[i]!.scenarioId);
        expect(r1.expansionScenarios[i]!.priorityScore)
          .toBe(r2.expansionScenarios[i]!.priorityScore);
        expect(r1.expansionScenarios[i]!.steps.length)
          .toBe(r2.expansionScenarios[i]!.steps.length);
      }
    });

    it("same inputs yield same gap fill scenarios", () => {
      const inputs = standardInputs(
        [],
        [],
        [makeGap("support", { fillPriority: 0.7 })],
        [{ domain: "support", templateId: "support_ticket_saas", confidence: 0.8 }],
      );

      const g1 = generateGapFillScenarios(inputs);
      const g2 = generateGapFillScenarios(inputs);
      expect(g1.length).toBe(g2.length);
      expect(g1[0]!.scenarioId).toBe(g2[0]!.scenarioId);
      expect(g1[0]!.steps.length).toBe(g2[0]!.steps.length);
    });
  });

  // ── 2. Expansion Steps ───────────────────────────────────────
  describe("expansion scenarios", () => {
    it("creates correct number of derive/create steps", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand", { templateCount: 1 })],
        [],
        [],
      );

      const scenarios = generateExpansionScenarios(inputs);
      expect(scenarios).toHaveLength(1);

      const sc = scenarios[0]!;
      expect(sc.type).toBe("expand_domain");
      expect(sc.domain).toBe("reservation");
      expect(sc.gap).toBe(2); // target 3, current 1
      expect(sc.currentTemplateCount).toBe(1);
      expect(sc.targetTemplateCount).toBe(3);

      // Should have 2 derive/create steps + validate + release + publish
      const deriveOrCreate = sc.steps.filter(
        (s) => s.stepType === "derive_template" || s.stepType === "create_template",
      );
      expect(deriveOrCreate.length).toBe(2);
    });

    it("uses evolution proposal template IDs when available", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand", { templateCount: 1 })],
        [],
        [],
        [
          { domain: "reservation", templateId: "hotel_reservation_saas", confidence: 0.8 },
          { domain: "reservation", templateId: "clinic_reservation_saas", confidence: 0.7 },
        ],
      );

      const scenarios = generateExpansionScenarios(inputs);
      const sc = scenarios[0]!;
      const deriveOrCreate = sc.steps.filter(
        (s) => s.stepType === "derive_template" || s.stepType === "create_template",
      );

      const targetIds = deriveOrCreate.map((s) => s.targetTemplateId);
      expect(targetIds).toContain("hotel_reservation_saas");
      expect(targetIds).toContain("clinic_reservation_saas");
    });

    it("includes validate + release + publish steps", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("crm", "expand")],
        [],
        [],
      );

      const scenarios = generateExpansionScenarios(inputs);
      const sc = scenarios[0]!;
      const stepTypes = sc.steps.map((s) => s.stepType);

      expect(stepTypes).toContain("validate");
      expect(stepTypes).toContain("release");
      expect(stepTypes).toContain("publish");
    });
  });

  // ── 3. Gap Fill ──────────────────────────────────────────────
  describe("gap fill scenarios", () => {
    it("generates scenarios for each gap", () => {
      const inputs = standardInputs(
        [],
        [],
        [
          makeGap("support", { fillPriority: 0.7 }),
          makeGap("education", { fillPriority: 0.5 }),
        ],
      );

      const scenarios = generateGapFillScenarios(inputs);
      expect(scenarios).toHaveLength(2);
      expect(scenarios[0]!.type).toBe("fill_gap");
      expect(scenarios[0]!.currentTemplateCount).toBe(0);
      expect(scenarios[0]!.gap).toBe(1);
    });

    it("uses evolution proposal when available", () => {
      const inputs = standardInputs(
        [],
        [],
        [makeGap("support")],
        [{ domain: "support", templateId: "support_ticket_saas", confidence: 0.8 }],
      );

      const scenarios = generateGapFillScenarios(inputs);
      const sc = scenarios[0]!;

      const createOrDerive = sc.steps.find(
        (s) => s.stepType === "derive_template" || s.stepType === "create_template",
      );
      expect(createOrDerive).toBeDefined();
      expect(createOrDerive!.targetTemplateId).toBe("support_ticket_saas");
    });

    it("falls back to generic template ID when no proposal", () => {
      const inputs = standardInputs(
        [],
        [],
        [makeGap("analytics")],
      );

      const scenarios = generateGapFillScenarios(inputs);
      const sc = scenarios[0]!;

      const step = sc.steps.find(
        (s) => s.stepType === "derive_template" || s.stepType === "create_template",
      );
      expect(step).toBeDefined();
      expect(step!.targetTemplateId).toContain("analytics");
    });
  });

  // ── 4. Parent Selection ──────────────────────────────────────
  describe("parent selection", () => {
    it("expansion scenario has parent when domain has templates", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [],
        [],
        [
          { domain: "reservation", templateId: "hotel_reservation_saas", confidence: 0.8 },
        ],
      );

      const scenarios = generateExpansionScenarios(inputs);
      const sc = scenarios[0]!;

      // At least one derive step should have a parent
      const deriveSteps = sc.steps.filter((s) => s.stepType === "derive_template");
      if (deriveSteps.length > 0) {
        expect(deriveSteps[0]!.parentTemplateId).toBeTruthy();
      }
    });
  });

  // ── 5. Stabilization ────────────────────────────────────────
  describe("stabilization scenarios", () => {
    it("targets weak domains", () => {
      const inputs = standardInputs(
        [],
        [
          makeDomainStrategy("membership", "stabilize", {
            averageHealthScore: 0.4,
            averageStabilityScore: 0.3,
            templateCount: 3,
            greenCount: 1,
          }),
        ],
        [],
      );

      const scenarios = generateStabilizationScenarios(inputs);
      expect(scenarios).toHaveLength(1);

      const sc = scenarios[0]!;
      expect(sc.type).toBe("stabilize_domain");
      expect(sc.domain).toBe("membership");
      expect(sc.gap).toBe(0); // no new templates
    });

    it("includes regression and governance steps", () => {
      const inputs = standardInputs(
        [],
        [makeDomainStrategy("crm", "stabilize", {
          averageHealthScore: 0.5,
          averageStabilityScore: 0.4,
        })],
        [],
      );

      const scenarios = generateStabilizationScenarios(inputs);
      const sc = scenarios[0]!;
      const stepTypes = sc.steps.map((s) => s.stepType);

      expect(stepTypes).toContain("run_regression");
      expect(stepTypes).toContain("governance_review");
    });

    it("adds extra validate step when health is very low", () => {
      const inputs = standardInputs(
        [],
        [makeDomainStrategy("crm", "stabilize", {
          averageHealthScore: 0.3,
        })],
        [],
      );

      const scenarios = generateStabilizationScenarios(inputs);
      const sc = scenarios[0]!;
      const stepTypes = sc.steps.map((s) => s.stepType);
      expect(stepTypes).toContain("validate");
    });
  });

  // ── 6. Impact Estimation ─────────────────────────────────────
  describe("impact estimation", () => {
    it("expansion has positive coverage increase", () => {
      const impact = estimateScenarioImpact(
        { templateCount: 1, coverageScore: 0.5 } as any,
        2,
        "expand_domain",
      );
      expect(impact.coverageIncrease).toBeGreaterThan(0);
      expect(impact.portfolioStrength).toBeGreaterThan(0);
    });

    it("gap fill has positive coverage increase", () => {
      const impact = estimateScenarioImpact(
        { templateCount: 0, coverageScore: 0 } as any,
        1,
        "fill_gap",
      );
      expect(impact.coverageIncrease).toBeGreaterThan(0);
    });

    it("stabilization has zero coverage increase", () => {
      const impact = estimateScenarioImpact(
        { templateCount: 2, coverageScore: 0.3 } as any,
        0,
        "stabilize_domain",
      );
      expect(impact.coverageIncrease).toBe(0);
      expect(impact.portfolioStrength).toBeGreaterThan(0);
    });

    it("is consistent for same inputs", () => {
      const domain = { templateCount: 1, coverageScore: 0.5 } as any;
      const i1 = estimateScenarioImpact(domain, 2, "expand_domain");
      const i2 = estimateScenarioImpact(domain, 2, "expand_domain");
      expect(i1).toEqual(i2);
    });
  });

  // ── 7. Full Report ──────────────────────────────────────────
  describe("full report", () => {
    it("builds complete scenario report", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [makeDomainStrategy("crm", "stabilize", { averageHealthScore: 0.4 })],
        [makeGap("support")],
      );

      const report = buildScenarioReport(inputs);
      expect(report.summary.totalScenarios).toBe(3);
      expect(report.summary.expansionCount).toBe(1);
      expect(report.summary.gapFillCount).toBe(1);
      expect(report.summary.stabilizationCount).toBe(1);
      expect(report.generatedAt).toBeTruthy();
    });

    it("totalNewTemplates sums all gaps", () => {
      const inputs = standardInputs(
        [
          makeDomainStrategy("reservation", "expand", { templateCount: 1 }),
          makeDomainStrategy("crm", "expand", { templateCount: 1 }),
        ],
        [],
        [makeGap("support")],
      );

      const report = buildScenarioReport(inputs);
      // 2 expand (gap=2 each) + 1 gap fill (gap=1)
      expect(report.summary.totalNewTemplates).toBe(5);
    });
  });

  // ── 8. Reasons ──────────────────────────────────────────────
  describe("reasons", () => {
    it("every scenario has non-empty reasons", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [makeDomainStrategy("crm", "stabilize", { averageHealthScore: 0.4 })],
        [makeGap("support")],
      );

      const report = buildScenarioReport(inputs);
      const all = [
        ...report.expansionScenarios,
        ...report.gapFillScenarios,
        ...report.stabilizationScenarios,
      ];

      for (const sc of all) {
        expect(sc.reasons.length).toBeGreaterThan(0);
        for (const r of sc.reasons) {
          expect(typeof r).toBe("string");
          expect(r.length).toBeGreaterThan(0);
        }
      }
    });
  });

  // ── 9. Read-Only ────────────────────────────────────────────
  describe("read-only", () => {
    it("does not mutate inputs", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [],
        [makeGap("support")],
      );
      const before = JSON.stringify(inputs);
      buildScenarioReport(inputs);
      const after = JSON.stringify(inputs);
      expect(after).toBe(before);
    });
  });

  // ── 10. Formatting ─────────────────────────────────────────
  describe("formatting", () => {
    it("formatScenario produces readable output", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [],
        [],
      );
      const scenarios = generateExpansionScenarios(inputs);
      const output = formatScenario(scenarios[0]!);

      expect(output).toContain("EXPAND");
      expect(output).toContain("reservation");
      expect(output).toContain("Steps:");
    });

    it("formatScenarioReport produces readable report", () => {
      const inputs = standardInputs(
        [makeDomainStrategy("reservation", "expand")],
        [],
        [makeGap("support")],
      );
      const report = buildScenarioReport(inputs);
      const output = formatScenarioReport(report);

      expect(output).toContain("FACTORY SCENARIO PLANNER REPORT");
      expect(output).toContain("EXPANSION SCENARIOS");
      expect(output).toContain("GAP FILL SCENARIOS");
    });
  });

  // ── 11. Integration with Real Data ──────────────────────────
  describe("integration with real factory data", () => {
    it("builds scenarios from live factory modules", () => {
      const report = buildScenarioReport();

      expect(report.summary.totalScenarios).toBeGreaterThan(0);
      expect(report.generatedAt).toBeTruthy();

      // Should have some expansion scenarios (all 5 templates are single-domain)
      expect(report.expansionScenarios.length).toBeGreaterThan(0);

      // Should have gap fill scenarios (6 uncovered domains)
      expect(report.gapFillScenarios.length).toBeGreaterThan(0);
    });
  });
});
