import { describe, it, expect } from "vitest";
import {
  analyzeFactoryOutcomes,
  detectImprovementOpportunities,
  generateImprovementProposals,
  rankImprovementProposals,
  buildSelfImprovementReport,
  formatProposal,
  formatImprovementReport,
  IMPROVEMENT_THRESHOLDS,
  type FactoryOutcomes,
  type RoutingOutcome,
  type CostGuardrailOutcome,
  type LearningOutcome,
  type GovernanceOutcome,
  type AutopilotOutcomeEntry,
  type ImprovementProposal,
} from "../self-improving-factory";
import type { CostGuardrailDecision } from "../../providers/cost-guardrail";

// ── Helpers ──────────────────────────────────────────────────

function emptyOutcomes(overrides?: Partial<FactoryOutcomes>): FactoryOutcomes {
  return {
    routingOutcomes: [],
    costGuardrailOutcomes: [],
    learningOutcomes: [],
    governanceOutcomes: [],
    autopilotOutcomes: [],
    currentMode: "balanced",
    ...overrides,
  };
}

function makeRoutingOutcome(
  overrides?: Partial<RoutingOutcome>
): RoutingOutcome {
  return {
    taskKind: "schema",
    provider: "claude",
    baseScore: 0.6,
    recentScore: 0.75,
    status: "degraded",
    fallbackUsed: false,
    ...overrides,
  };
}

function makeCostDecision(
  result: "allowed" | "downgraded" | "blocked",
  maxCostPerStep: number | null = 0.05
): CostGuardrailDecision {
  return {
    result,
    selectedProvider: result === "blocked" ? null : "gemini",
    rejectedProvidersDueToBudget: result !== "allowed" ? ["claude"] : [],
    projectedStepCost: 0.07,
    accumulatedEstimatedCost: 0.2,
    maxCostPerRun: 1.0,
    maxCostPerStep,
    originalProvider: "claude",
  };
}

function makeLearningOutcome(
  overrides?: Partial<LearningOutcome>
): LearningOutcome {
  return {
    taskKind: "schema",
    provider: "claude",
    confidence: 0.3,
    totalSteps: 15,
    preference: "neutral",
    ...overrides,
  };
}

function makeGovernanceOutcome(
  overrides?: Partial<GovernanceOutcome>
): GovernanceOutcome {
  return {
    templateKey: "reservation_saas",
    currentState: "degraded",
    decision: "mark_degraded",
    consecutiveAtRiskOrDegraded: 4,
    ...overrides,
  };
}

function makeAutopilotOutcome(
  overrides?: Partial<AutopilotOutcomeEntry>
): AutopilotOutcomeEntry {
  return {
    proposalId: "support_ticket_saas",
    domain: "support",
    outcome: "failed_quality",
    confidence: 0.75,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("Self-Improving Factory", () => {
  // ── analyzeFactoryOutcomes ───────────────────────────────

  describe("analyzeFactoryOutcomes", () => {
    it("returns zero counts for empty outcomes", () => {
      const result = analyzeFactoryOutcomes(emptyOutcomes());
      expect(result.routingIssueCount).toBe(0);
      expect(result.costConstraintCount).toBe(0);
      expect(result.learningWeakCount).toBe(0);
      expect(result.governanceStuckCount).toBe(0);
      expect(result.autopilotFailureCount).toBe(0);
    });

    it("counts routing issues", () => {
      const result = analyzeFactoryOutcomes(
        emptyOutcomes({
          routingOutcomes: [
            makeRoutingOutcome({ status: "degraded" }),
            makeRoutingOutcome({ status: "fail" }),
            makeRoutingOutcome({ status: "pass" }),
          ],
        })
      );
      expect(result.routingIssueCount).toBe(2);
    });

    it("counts cost constraints", () => {
      const result = analyzeFactoryOutcomes(
        emptyOutcomes({
          costGuardrailOutcomes: [
            { taskKind: "schema", decision: makeCostDecision("downgraded") },
            { taskKind: "schema", decision: makeCostDecision("blocked") },
            { taskKind: "schema", decision: makeCostDecision("allowed") },
          ],
        })
      );
      expect(result.costConstraintCount).toBe(2);
    });

    it("counts low-confidence learning with sufficient steps", () => {
      const result = analyzeFactoryOutcomes(
        emptyOutcomes({
          learningOutcomes: [
            makeLearningOutcome({ confidence: 0.3, totalSteps: 15 }),
            makeLearningOutcome({ confidence: 0.8, totalSteps: 15 }),
            makeLearningOutcome({ confidence: 0.2, totalSteps: 3 }),
          ],
        })
      );
      expect(result.learningWeakCount).toBe(1);
    });

    it("counts stuck governance states", () => {
      const result = analyzeFactoryOutcomes(
        emptyOutcomes({
          governanceOutcomes: [
            makeGovernanceOutcome({ consecutiveAtRiskOrDegraded: 4, currentState: "degraded" }),
            makeGovernanceOutcome({ consecutiveAtRiskOrDegraded: 1, currentState: "at_risk" }),
          ],
        })
      );
      expect(result.governanceStuckCount).toBe(1);
    });

    it("counts autopilot failures", () => {
      const result = analyzeFactoryOutcomes(
        emptyOutcomes({
          autopilotOutcomes: [
            makeAutopilotOutcome({ outcome: "failed_quality" }),
            makeAutopilotOutcome({ outcome: "validated_candidate" }),
            makeAutopilotOutcome({ outcome: "failed_baseline" }),
          ],
        })
      );
      expect(result.autopilotFailureCount).toBe(2);
    });
  });

  // ── Rule A: Routing improvements ─────────────────────────

  describe("Rule A: Repeated regression degradation → routing proposal", () => {
    it("generates routing weight proposal when recent outperforms base", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 5 }, () =>
          makeRoutingOutcome({ status: "degraded", baseScore: 0.5, recentScore: 0.7 })
        ),
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const routing = proposals.filter((p) => p.subsystem === "provider_routing");
      expect(routing.length).toBeGreaterThanOrEqual(1);

      const weightProposal = routing.find((p) => p.id.includes("routing-weight"));
      expect(weightProposal).toBeDefined();
      expect(weightProposal!.suggestedAction.type).toBe("tune_weight");
      expect(weightProposal!.suggestedAction.target).toBe("recent_score_weight");
    });

    it("does not generate routing proposal below degradation threshold", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: [
          makeRoutingOutcome({ status: "degraded" }),
          makeRoutingOutcome({ status: "pass" }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const routing = proposals.filter((p) => p.id.includes("routing-weight"));
      expect(routing).toHaveLength(0);
    });

    it("sets high priority when degradation count is high", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 6 }, () =>
          makeRoutingOutcome({ status: "fail", baseScore: 0.4, recentScore: 0.65 })
        ),
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const weightProposal = proposals.find((p) => p.id.includes("routing-weight"));
      expect(weightProposal).toBeDefined();
      expect(weightProposal!.priority).toBe("high");
    });
  });

  // ── Rule B: Cost guardrail proposals ─────────────────────

  describe("Rule B: Repeated budget downgrade/block → cost guardrail proposal", () => {
    it("generates cost guardrail proposal when frequently constrained", () => {
      const outcomes = emptyOutcomes({
        costGuardrailOutcomes: Array.from({ length: 4 }, () => ({
          taskKind: "implementation" as const,
          decision: makeCostDecision("downgraded", 0.05),
        })),
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const costProposals = proposals.filter((p) => p.subsystem === "cost_guardrail");
      expect(costProposals).toHaveLength(1);
      expect(costProposals[0].suggestedAction.type).toBe("adjust_threshold");
      expect(costProposals[0].suggestedAction.target).toBe("max_cost_per_step");
    });

    it("sets high priority when blocked count is high", () => {
      const outcomes = emptyOutcomes({
        costGuardrailOutcomes: Array.from({ length: 4 }, () => ({
          taskKind: "schema" as const,
          decision: makeCostDecision("blocked", 0.03),
        })),
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const costProposal = proposals.find((p) => p.subsystem === "cost_guardrail");
      expect(costProposal).toBeDefined();
      expect(costProposal!.priority).toBe("high");
    });

    it("does not generate proposal below block threshold", () => {
      const outcomes = emptyOutcomes({
        costGuardrailOutcomes: [
          { taskKind: "schema", decision: makeCostDecision("blocked") },
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "cost_guardrail")).toHaveLength(0);
    });
  });

  // ── Rule C: Learning proposals ───────────────────────────

  describe("Rule C: Repeated low-confidence learning → learning proposal", () => {
    it("generates learning proposal when confidence is low with data", () => {
      const outcomes = emptyOutcomes({
        learningOutcomes: [
          makeLearningOutcome({ taskKind: "api_design", confidence: 0.25, totalSteps: 18 }),
          makeLearningOutcome({ taskKind: "api_design", confidence: 0.35, totalSteps: 12, provider: "gemini" }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const learning = proposals.filter((p) => p.subsystem === "provider_learning");
      expect(learning).toHaveLength(1);
      expect(learning[0].suggestedAction.type).toBe("expand_signal");
    });

    it("does not generate learning proposal when data is insufficient", () => {
      const outcomes = emptyOutcomes({
        learningOutcomes: [
          makeLearningOutcome({ confidence: 0.3, totalSteps: 3 }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "provider_learning")).toHaveLength(0);
    });

    it("does not generate learning proposal when confidence is adequate", () => {
      const outcomes = emptyOutcomes({
        learningOutcomes: [
          makeLearningOutcome({ confidence: 0.8, totalSteps: 20 }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "provider_learning")).toHaveLength(0);
    });
  });

  // ── Rule D: Control plane proposals ──────────────────────

  describe("Rule D: Safe mode suppression → control plane proposal", () => {
    it("generates control plane proposal in safe mode with moderate avoidance", () => {
      const outcomes = emptyOutcomes({
        currentMode: "safe",
        learningOutcomes: [
          makeLearningOutcome({ preference: "avoided", confidence: 0.45, totalSteps: 20, taskKind: "schema" }),
          makeLearningOutcome({ preference: "avoided", confidence: 0.5, totalSteps: 18, taskKind: "api_design" }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const cp = proposals.filter((p) => p.subsystem === "control_plane");
      expect(cp).toHaveLength(1);
      expect(cp[0].suggestedAction.target).toBe("min_confidence_for_learning_boost");
    });

    it("does not generate control plane proposal in balanced mode", () => {
      const outcomes = emptyOutcomes({
        currentMode: "balanced",
        learningOutcomes: [
          makeLearningOutcome({ preference: "avoided", confidence: 0.4, totalSteps: 20 }),
          makeLearningOutcome({ preference: "avoided", confidence: 0.4, totalSteps: 20, taskKind: "api_design" }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "control_plane")).toHaveLength(0);
    });
  });

  // ── Rule E: Governance proposals ─────────────────────────

  describe("Rule E: Stuck at_risk/degraded → governance proposal", () => {
    it("generates governance proposal for stuck degraded template", () => {
      const outcomes = emptyOutcomes({
        governanceOutcomes: [
          makeGovernanceOutcome({
            templateKey: "simple_crm_saas",
            currentState: "degraded",
            consecutiveAtRiskOrDegraded: 5,
          }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const gov = proposals.filter((p) => p.subsystem === "governance");
      expect(gov).toHaveLength(1);
      expect(gov[0].priority).toBe("high");
      expect(gov[0].suggestedAction.type).toBe("increase_frequency");
    });

    it("generates medium priority for at_risk template", () => {
      const outcomes = emptyOutcomes({
        governanceOutcomes: [
          makeGovernanceOutcome({
            currentState: "at_risk",
            consecutiveAtRiskOrDegraded: 3,
          }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const gov = proposals.filter((p) => p.subsystem === "governance");
      expect(gov).toHaveLength(1);
      expect(gov[0].priority).toBe("medium");
    });

    it("does not generate governance proposal for green template", () => {
      const outcomes = emptyOutcomes({
        governanceOutcomes: [
          makeGovernanceOutcome({
            currentState: "green",
            consecutiveAtRiskOrDegraded: 0,
          }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "governance")).toHaveLength(0);
    });

    it("does not generate proposal below stuck threshold", () => {
      const outcomes = emptyOutcomes({
        governanceOutcomes: [
          makeGovernanceOutcome({
            currentState: "degraded",
            consecutiveAtRiskOrDegraded: 2,
          }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "governance")).toHaveLength(0);
    });
  });

  // ── Rule F: Autopilot proposals ──────────────────────────

  describe("Rule F: Repeated autopilot failure → autopilot proposal", () => {
    it("generates autopilot proposal for failing domain", () => {
      const outcomes = emptyOutcomes({
        autopilotOutcomes: [
          makeAutopilotOutcome({ domain: "support", outcome: "failed_quality" }),
          makeAutopilotOutcome({ domain: "support", outcome: "failed_baseline" }),
          makeAutopilotOutcome({ domain: "support", outcome: "validated_candidate" }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const ap = proposals.filter((p) => p.subsystem === "autopilot");
      expect(ap).toHaveLength(1);
      expect(ap[0].suggestedAction.type).toBe("tighten_criteria");
      expect(ap[0].suggestedAction.target).toBe("autopilot_confidence_threshold");
    });

    it("does not generate autopilot proposal below failure threshold", () => {
      const outcomes = emptyOutcomes({
        autopilotOutcomes: [
          makeAutopilotOutcome({ outcome: "failed_quality" }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.filter((p) => p.subsystem === "autopilot")).toHaveLength(0);
    });
  });

  // ── Ranking ──────────────────────────────────────────────

  describe("rankImprovementProposals", () => {
    it("ranks by priority first, then confidence", () => {
      const proposals: ImprovementProposal[] = [
        {
          id: "p-medium-low-conf",
          subsystem: "governance",
          priority: "medium",
          confidence: 0.5,
          title: "Medium low",
          description: "",
          reasons: [],
          suggestedAction: { type: "review_config", target: "x", currentValue: null, suggestedValue: null },
        },
        {
          id: "p-high-high-conf",
          subsystem: "provider_routing",
          priority: "high",
          confidence: 0.9,
          title: "High high",
          description: "",
          reasons: [],
          suggestedAction: { type: "tune_weight", target: "y", currentValue: null, suggestedValue: null },
        },
        {
          id: "p-high-low-conf",
          subsystem: "cost_guardrail",
          priority: "high",
          confidence: 0.6,
          title: "High low",
          description: "",
          reasons: [],
          suggestedAction: { type: "adjust_threshold", target: "z", currentValue: null, suggestedValue: null },
        },
      ];

      const ranked = rankImprovementProposals(proposals);
      expect(ranked[0].id).toBe("p-high-high-conf");
      expect(ranked[1].id).toBe("p-high-low-conf");
      expect(ranked[2].id).toBe("p-medium-low-conf");
    });

    it("produces deterministic ordering for same inputs", () => {
      const proposals: ImprovementProposal[] = [
        {
          id: "b-proposal",
          subsystem: "governance",
          priority: "medium",
          confidence: 0.7,
          title: "B",
          description: "",
          reasons: [],
          suggestedAction: { type: "review_config", target: "x", currentValue: null, suggestedValue: null },
        },
        {
          id: "a-proposal",
          subsystem: "autopilot",
          priority: "medium",
          confidence: 0.7,
          title: "A",
          description: "",
          reasons: [],
          suggestedAction: { type: "review_config", target: "y", currentValue: null, suggestedValue: null },
        },
      ];

      const ranked1 = rankImprovementProposals(proposals);
      const ranked2 = rankImprovementProposals([...proposals].reverse());
      expect(ranked1.map((p) => p.id)).toEqual(ranked2.map((p) => p.id));
      expect(ranked1[0].id).toBe("a-proposal");
    });
  });

  // ── Confidence scoring stability ─────────────────────────

  describe("confidence scoring", () => {
    it("produces stable confidence for identical inputs", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 5 }, () =>
          makeRoutingOutcome({ status: "degraded", baseScore: 0.5, recentScore: 0.7 })
        ),
      });

      const proposals1 = detectImprovementOpportunities(outcomes);
      const proposals2 = detectImprovementOpportunities(outcomes);

      expect(proposals1.length).toBe(proposals2.length);
      for (let i = 0; i < proposals1.length; i++) {
        expect(proposals1[i].confidence).toBe(proposals2[i].confidence);
      }
    });

    it("confidence is always between 0 and 1", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 10 }, () =>
          makeRoutingOutcome({ status: "fail", baseScore: 0.1, recentScore: 0.99 })
        ),
        governanceOutcomes: [
          makeGovernanceOutcome({ consecutiveAtRiskOrDegraded: 100 }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      for (const p of proposals) {
        expect(p.confidence).toBeGreaterThanOrEqual(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  // ── Proposal reasons ─────────────────────────────────────

  describe("proposal reasons are explainable", () => {
    it("routing proposal includes degradation count and score gap", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 4 }, () =>
          makeRoutingOutcome({ status: "degraded", baseScore: 0.5, recentScore: 0.7 })
        ),
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const routing = proposals.find((p) => p.id.includes("routing-weight"));
      expect(routing).toBeDefined();
      expect(routing!.reasons.length).toBeGreaterThan(0);
      expect(routing!.reasons.some((r) => r.includes("degraded/failed"))).toBe(true);
      expect(routing!.reasons.some((r) => r.includes("outperforms"))).toBe(true);
    });

    it("governance proposal includes template key and state duration", () => {
      const outcomes = emptyOutcomes({
        governanceOutcomes: [
          makeGovernanceOutcome({ templateKey: "test_template", consecutiveAtRiskOrDegraded: 5 }),
        ],
      });
      const proposals = detectImprovementOpportunities(outcomes);
      const gov = proposals.find((p) => p.subsystem === "governance");
      expect(gov).toBeDefined();
      expect(gov!.reasons.some((r) => r.includes("test_template"))).toBe(true);
      expect(gov!.reasons.some((r) => r.includes("5"))).toBe(true);
    });
  });

  // ── Subsystem classification ─────────────────────────────

  describe("subsystem classification", () => {
    it("classifies all proposals to valid subsystems", () => {
      const validSubsystems: Set<string> = new Set([
        "provider_routing",
        "provider_learning",
        "cost_guardrail",
        "control_plane",
        "regression",
        "governance",
        "autopilot",
        "evolution_engine",
      ]);

      const outcomes = emptyOutcomes({
        currentMode: "safe",
        routingOutcomes: Array.from({ length: 5 }, () =>
          makeRoutingOutcome({ status: "degraded", baseScore: 0.5, recentScore: 0.7 })
        ),
        costGuardrailOutcomes: Array.from({ length: 4 }, () => ({
          taskKind: "schema" as const,
          decision: makeCostDecision("blocked"),
        })),
        learningOutcomes: [
          makeLearningOutcome({ confidence: 0.2, totalSteps: 20, taskKind: "schema" }),
          makeLearningOutcome({ preference: "avoided", confidence: 0.4, totalSteps: 20, taskKind: "api_design" }),
          makeLearningOutcome({ preference: "avoided", confidence: 0.45, totalSteps: 18, taskKind: "implementation" }),
        ],
        governanceOutcomes: [makeGovernanceOutcome({ consecutiveAtRiskOrDegraded: 5 })],
        autopilotOutcomes: [
          makeAutopilotOutcome({ outcome: "failed_quality" }),
          makeAutopilotOutcome({ outcome: "failed_baseline" }),
        ],
      });

      const proposals = detectImprovementOpportunities(outcomes);
      expect(proposals.length).toBeGreaterThan(0);
      for (const p of proposals) {
        expect(validSubsystems.has(p.subsystem)).toBe(true);
      }
    });
  });

  // ── Determinism ──────────────────────────────────────────

  describe("determinism", () => {
    it("produces identical output for identical input", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 4 }, () =>
          makeRoutingOutcome({ status: "fail", baseScore: 0.4, recentScore: 0.65 })
        ),
        governanceOutcomes: [makeGovernanceOutcome()],
        autopilotOutcomes: [
          makeAutopilotOutcome({ outcome: "failed_quality" }),
          makeAutopilotOutcome({ outcome: "failed_pipeline" }),
        ],
      });

      const report1 = buildSelfImprovementReport(outcomes);
      const report2 = buildSelfImprovementReport(outcomes);

      expect(report1.proposals.length).toBe(report2.proposals.length);
      expect(report1.summary.totalProposals).toBe(report2.summary.totalProposals);
      for (let i = 0; i < report1.proposals.length; i++) {
        expect(report1.proposals[i].id).toBe(report2.proposals[i].id);
        expect(report1.proposals[i].confidence).toBe(report2.proposals[i].confidence);
        expect(report1.proposals[i].priority).toBe(report2.proposals[i].priority);
      }
    });
  });

  // ── buildSelfImprovementReport ───────────────────────────

  describe("buildSelfImprovementReport", () => {
    it("builds complete report with summary", () => {
      const outcomes = emptyOutcomes({
        routingOutcomes: Array.from({ length: 5 }, () =>
          makeRoutingOutcome({ status: "degraded", baseScore: 0.5, recentScore: 0.7 })
        ),
        governanceOutcomes: [makeGovernanceOutcome()],
      });

      const report = buildSelfImprovementReport(outcomes);
      expect(report.proposals.length).toBeGreaterThan(0);
      expect(report.summary.totalProposals).toBe(report.proposals.length);
      expect(typeof report.evaluatedAt).toBe("string");
      expect(report.summary.subsystemBreakdown).toBeDefined();
    });

    it("returns empty report when no issues", () => {
      const report = buildSelfImprovementReport(emptyOutcomes());
      expect(report.proposals).toHaveLength(0);
      expect(report.summary.totalProposals).toBe(0);
    });
  });

  // ── generateImprovementProposals alias ───────────────────

  describe("generateImprovementProposals", () => {
    it("is equivalent to detectImprovementOpportunities", () => {
      const outcomes = emptyOutcomes({
        governanceOutcomes: [makeGovernanceOutcome()],
      });
      const a = detectImprovementOpportunities(outcomes);
      const b = generateImprovementProposals(outcomes);
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].id).toBe(b[i].id);
      }
    });
  });

  // ── Formatting ───────────────────────────────────────────

  describe("formatting", () => {
    it("formatProposal returns readable string", () => {
      const proposal: ImprovementProposal = {
        id: "test-proposal",
        subsystem: "provider_routing",
        priority: "high",
        confidence: 0.82,
        title: "Test title",
        description: "Test description",
        reasons: ["reason 1", "reason 2"],
        suggestedAction: {
          type: "tune_weight",
          target: "recent_score_weight",
          currentValue: 0.3,
          suggestedValue: 0.4,
        },
      };
      const output = formatProposal(proposal);
      expect(output).toContain("[HIGH]");
      expect(output).toContain("Test title");
      expect(output).toContain("provider_routing");
      expect(output).toContain("82%");
      expect(output).toContain("reason 1");
      expect(output).toContain("tune_weight");
      expect(output).toContain("0.3");
      expect(output).toContain("0.4");
    });

    it("formatImprovementReport returns complete report string", () => {
      const report = buildSelfImprovementReport(
        emptyOutcomes({
          governanceOutcomes: [makeGovernanceOutcome()],
        })
      );
      const output = formatImprovementReport(report);
      expect(output).toContain("Self-Improving Factory");
      expect(output).toContain("Improvement Report");
      expect(output).toContain("Proposal #1");
    });

    it("formatImprovementReport handles empty report", () => {
      const report = buildSelfImprovementReport(emptyOutcomes());
      const output = formatImprovementReport(report);
      expect(output).toContain("No improvement proposals generated");
    });
  });
});
