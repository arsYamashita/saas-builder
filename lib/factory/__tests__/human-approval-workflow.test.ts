import { describe, it, expect, beforeEach } from "vitest";
import {
  collectPendingProposals,
  submitApprovalDecision,
  listApprovalHistory,
  getApprovedChanges,
  getPendingProposals,
  buildApprovalReport,
  formatApprovalReport,
  fromImprovementProposal,
  fromSimulationReport,
  useInMemoryStore,
  clearInMemoryStore,
  type ApprovalProposal,
} from "../human-approval-workflow";
import type { ImprovementProposal } from "../self-improving-factory";
import type { SimulationReport } from "../policy-simulation-sandbox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImprovementProposal(
  overrides: Partial<ImprovementProposal> = {},
): ImprovementProposal {
  return {
    id: "routing-weight-adjustment-schema",
    subsystem: "provider_routing",
    priority: "high",
    confidence: 0.82,
    title: "Adjust schema routing weight toward recent metrics",
    description: "Recent provider scores outperform base scores for schema tasks",
    reasons: ["recent outperforms base", "degraded count is high"],
    suggestedAction: {
      type: "tune_weight",
      target: "recent_score_weight",
      currentValue: 0.3,
      suggestedValue: 0.5,
    },
    ...overrides,
  };
}

function makeSimulationReport(
  overrides: Partial<SimulationReport> = {},
): SimulationReport {
  return {
    subsystem: "cost_guardrail",
    policyKey: "max_cost_per_step",
    currentValue: 0.05,
    proposedValue: 0.065,
    comparison: {
      baseline: {
        selectedProviderDistribution: { gemini: 0.5, claude: 0.5 },
        degradedCount: 3,
        failCount: 2,
        averageEstimatedCost: 0.04,
        fallbackCount: 4,
      },
      simulated: {
        selectedProviderDistribution: { gemini: 0.4, claude: 0.6 },
        degradedCount: 1,
        failCount: 1,
        averageEstimatedCost: 0.045,
        fallbackCount: 2,
      },
      delta: {
        degradedCount: -2,
        failCount: -1,
        averageEstimatedCost: 0.005,
        fallbackCount: -2,
      },
    },
    recommendation: "worth_testing",
    confidence: 0.78,
    reasons: ["simulated degraded count decreased", "cost increase within tolerance"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup: use in-memory store for all tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useInMemoryStore();
});

// ---------------------------------------------------------------------------
// Proposal collection
// ---------------------------------------------------------------------------

describe("collectPendingProposals", () => {
  it("collects improvement proposals", () => {
    const proposals = collectPendingProposals([makeImprovementProposal()]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.id).toBe("routing-weight-adjustment-schema");
    expect(proposals[0]!.source).toBe("self_improving");
  });

  it("collects simulation reports as proposals", () => {
    const proposals = collectPendingProposals([], [makeSimulationReport()]);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.id).toBe("sim-cost_guardrail-max_cost_per_step");
    expect(proposals[0]!.source).toBe("simulation");
  });

  it("deduplicates by proposal id", () => {
    collectPendingProposals([makeImprovementProposal()]);
    const proposals = collectPendingProposals([makeImprovementProposal()]);
    expect(proposals).toHaveLength(1);
  });

  it("merges proposals from both sources", () => {
    const proposals = collectPendingProposals(
      [makeImprovementProposal()],
      [makeSimulationReport()],
    );
    expect(proposals).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Approval decision storage
// ---------------------------------------------------------------------------

describe("submitApprovalDecision", () => {
  it("stores an approval decision", () => {
    collectPendingProposals([makeImprovementProposal()]);
    const record = submitApprovalDecision(
      "routing-weight-adjustment-schema",
      "approved",
      "user",
      "simulation shows improvement",
    );
    expect(record).not.toBeNull();
    expect(record!.decision).toBe("approved");
    expect(record!.reviewer).toBe("user");
    expect(record!.notes).toBe("simulation shows improvement");
  });

  it("returns null for unknown proposal id", () => {
    const record = submitApprovalDecision("nonexistent", "approved");
    expect(record).toBeNull();
  });

  it("supports reject decision", () => {
    collectPendingProposals([makeImprovementProposal()]);
    const record = submitApprovalDecision(
      "routing-weight-adjustment-schema",
      "rejected",
      "admin",
      "risk too high",
    );
    expect(record!.decision).toBe("rejected");
  });

  it("supports defer decision", () => {
    collectPendingProposals([makeImprovementProposal()]);
    const record = submitApprovalDecision(
      "routing-weight-adjustment-schema",
      "deferred",
    );
    expect(record!.decision).toBe("deferred");
  });

  it("allows multiple decisions on same proposal (latest wins)", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "deferred");
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");

    const approved = getApprovedChanges();
    expect(approved).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Approval history retrieval
// ---------------------------------------------------------------------------

describe("listApprovalHistory", () => {
  it("returns all decisions", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");

    const history = listApprovalHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.decision).toBe("approved");
  });

  it("filters by proposal id", () => {
    collectPendingProposals([
      makeImprovementProposal(),
      makeImprovementProposal({ id: "other-proposal", subsystem: "governance" }),
    ]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");
    submitApprovalDecision("other-proposal", "rejected");

    const history = listApprovalHistory("routing-weight-adjustment-schema");
    expect(history).toHaveLength(1);
    expect(history[0]!.decision).toBe("approved");
  });

  it("returns empty array when no decisions exist", () => {
    expect(listApprovalHistory()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Approved proposal listing
// ---------------------------------------------------------------------------

describe("getApprovedChanges", () => {
  it("returns only approved proposals", () => {
    collectPendingProposals([
      makeImprovementProposal(),
      makeImprovementProposal({ id: "other", subsystem: "governance" }),
    ]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");
    submitApprovalDecision("other", "rejected");

    const approved = getApprovedChanges();
    expect(approved).toHaveLength(1);
    expect(approved[0]!.id).toBe("routing-weight-adjustment-schema");
  });

  it("returns empty when nothing is approved", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "rejected");
    expect(getApprovedChanges()).toHaveLength(0);
  });

  it("uses latest decision per proposal", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");
    submitApprovalDecision("routing-weight-adjustment-schema", "rejected");
    expect(getApprovedChanges()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pending proposals
// ---------------------------------------------------------------------------

describe("getPendingProposals", () => {
  it("returns proposals with no decision", () => {
    collectPendingProposals([makeImprovementProposal()]);
    const pending = getPendingProposals();
    expect(pending).toHaveLength(1);
  });

  it("includes deferred proposals", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "deferred");
    const pending = getPendingProposals();
    expect(pending).toHaveLength(1);
  });

  it("excludes approved and rejected proposals", () => {
    collectPendingProposals([
      makeImprovementProposal(),
      makeImprovementProposal({ id: "other", subsystem: "governance" }),
    ]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");
    submitApprovalDecision("other", "rejected");
    expect(getPendingProposals()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

describe("fromImprovementProposal", () => {
  it("maps improvement proposal to approval proposal", () => {
    const result = fromImprovementProposal(makeImprovementProposal());
    expect(result.id).toBe("routing-weight-adjustment-schema");
    expect(result.subsystem).toBe("provider_routing");
    expect(result.source).toBe("self_improving");
    expect(result.suggestedAction.key).toBe("recent_score_weight");
  });

  it("maps evolution_engine subsystem to template_evolution", () => {
    const result = fromImprovementProposal(
      makeImprovementProposal({ subsystem: "evolution_engine" }),
    );
    expect(result.subsystem).toBe("template_evolution");
  });
});

describe("fromSimulationReport", () => {
  it("maps simulation report to approval proposal", () => {
    const result = fromSimulationReport(makeSimulationReport());
    expect(result.id).toBe("sim-cost_guardrail-max_cost_per_step");
    expect(result.subsystem).toBe("cost_guardrail");
    expect(result.source).toBe("simulation");
    expect(result.recommendation).toBe("worth_testing");
  });
});

// ---------------------------------------------------------------------------
// buildApprovalReport
// ---------------------------------------------------------------------------

describe("buildApprovalReport", () => {
  it("builds a complete report", () => {
    collectPendingProposals([
      makeImprovementProposal(),
      makeImprovementProposal({ id: "other", subsystem: "governance" }),
    ]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved", "user", "looks good");

    const report = buildApprovalReport();
    expect(report.summary.totalProposals).toBe(2);
    expect(report.summary.approvedCount).toBe(1);
    expect(report.summary.pendingCount).toBe(1);
    expect(report.approved).toHaveLength(1);
    expect(report.pending).toHaveLength(1);
    expect(report.decisions).toHaveLength(1);
  });

  it("deterministic: same store produces same report structure", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved");

    const r1 = buildApprovalReport();
    const r2 = buildApprovalReport();
    expect(r1.summary).toEqual(r2.summary);
    expect(r1.approved.map((p) => p.id)).toEqual(r2.approved.map((p) => p.id));
  });
});

// ---------------------------------------------------------------------------
// Format report
// ---------------------------------------------------------------------------

describe("formatApprovalReport", () => {
  it("produces readable text output", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "approved", "user", "test");

    const report = buildApprovalReport();
    const text = formatApprovalReport(report);

    expect(text).toContain("FACTORY PROPOSAL APPROVAL REPORT");
    expect(text).toContain("[APPROVED]");
    expect(text).toContain("routing-weight-adjustment-schema");
    expect(text).toContain("DECISION HISTORY");
  });

  it("handles empty proposals", () => {
    const report = buildApprovalReport();
    const text = formatApprovalReport(report);
    expect(text).toContain("提案はありません");
  });
});

// ---------------------------------------------------------------------------
// Read-only behavior
// ---------------------------------------------------------------------------

describe("read-only behavior", () => {
  it("does not mutate proposal objects passed in", () => {
    const original = makeImprovementProposal();
    const copy = JSON.parse(JSON.stringify(original));
    collectPendingProposals([original]);
    expect(original).toEqual(copy);
  });

  it("report is a plain data structure with no side effects", () => {
    collectPendingProposals([makeImprovementProposal()]);
    const report = buildApprovalReport();
    expect(typeof report.summary.totalProposals).toBe("number");
    expect(Array.isArray(report.pending)).toBe(true);
    expect(typeof report.generatedAt).toBe("string");
  });
});
