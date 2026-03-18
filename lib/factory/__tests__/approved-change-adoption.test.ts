import { describe, it, expect, beforeEach } from "vitest";
import {
  collectApprovedProposals,
  buildAdoptionPlans,
  previewAdoptionPlans,
  applyAdoptionPlans,
  listAdoptionHistory,
  buildRollbackMetadata,
  buildAdoptionReport,
  formatAdoptionReport,
  useInMemoryStore as useAdoptionMemory,
  clearInMemoryStore as clearAdoptionMemory,
} from "../approved-change-adoption";
import {
  collectPendingProposals,
  submitApprovalDecision,
  useInMemoryStore as useApprovalMemory,
  type ApprovalProposal,
} from "../human-approval-workflow";
import type { ImprovementProposal } from "../self-improving-factory";

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
    description: "Recent provider scores outperform base scores",
    reasons: ["recent outperforms base"],
    suggestedAction: {
      type: "tune_weight",
      target: "recent_score_weight",
      currentValue: 0.3,
      suggestedValue: 0.5,
    },
    ...overrides,
  };
}

function makeApprovalProposal(
  overrides: Partial<ApprovalProposal> = {},
): ApprovalProposal {
  return {
    id: "routing-weight-adjustment-schema",
    subsystem: "provider_routing",
    title: "Adjust schema routing weight",
    confidence: 0.82,
    suggestedAction: {
      type: "tune_weight",
      key: "recent_score_weight",
      current: 0.3,
      proposed: 0.5,
    },
    source: "self_improving",
    reasons: ["recent outperforms base"],
    ...overrides,
  };
}

/** Set up both in-memory stores and create approved proposals. */
function setupApprovedProposals(proposals: ImprovementProposal[]): void {
  collectPendingProposals(proposals);
  for (const p of proposals) {
    submitApprovalDecision(p.id, "approved", "user", "test");
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useApprovalMemory();
  useAdoptionMemory();
});

// ---------------------------------------------------------------------------
// 1. Only approved proposals are collected
// ---------------------------------------------------------------------------

describe("collectApprovedProposals", () => {
  it("collects only approved proposals", () => {
    const p1 = makeImprovementProposal();
    const p2 = makeImprovementProposal({ id: "rejected-one", subsystem: "governance" });
    const p3 = makeImprovementProposal({ id: "deferred-one", subsystem: "cost_guardrail" });

    collectPendingProposals([p1, p2, p3]);
    submitApprovalDecision(p1.id, "approved");
    submitApprovalDecision(p2.id, "rejected");
    submitApprovalDecision(p3.id, "deferred");

    const approved = collectApprovedProposals();
    expect(approved).toHaveLength(1);
    expect(approved[0]!.id).toBe(p1.id);
  });

  it("returns empty when nothing is approved", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "rejected");
    expect(collectApprovedProposals()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Approved proposals translate into deterministic adoption plans
// ---------------------------------------------------------------------------

describe("buildAdoptionPlans", () => {
  it("translates approved proposal into adoption plan", () => {
    setupApprovedProposals([makeImprovementProposal()]);
    const plans = buildAdoptionPlans();

    expect(plans).toHaveLength(1);
    const plan = plans[0]!;
    expect(plan.planId).toBe("adopt-routing-weight-adjustment-schema");
    expect(plan.proposalId).toBe("routing-weight-adjustment-schema");
    expect(plan.subsystem).toBe("provider_routing");
    expect(plan.targetFile).toBe("data/factory-policy.json");
    expect(plan.changeType).toBe("config_patch");
    expect(plan.currentValue).toBe(0.3);
    expect(plan.proposedValue).toBe(0.5);
    expect(plan.status).toBe("ready");
    expect(plan.dryRunDiff.key).toBe("provider_routing.recent_score_weight");
    expect(plan.dryRunDiff.before).toBe(0.3);
    expect(plan.dryRunDiff.after).toBe(0.5);
  });

  it("produces plans from explicit proposal list", () => {
    const proposals: ApprovalProposal[] = [makeApprovalProposal()];
    const plans = buildAdoptionPlans(proposals);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// 3. Unsupported proposals are skipped with reason
// ---------------------------------------------------------------------------

describe("unsupported subsystems", () => {
  it("marks autopilot proposals as skipped", () => {
    const proposals: ApprovalProposal[] = [
      makeApprovalProposal({ id: "autopilot-change", subsystem: "autopilot" }),
    ];
    const plans = buildAdoptionPlans(proposals);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("skipped");
    expect(plans[0]!.skipReason).toContain("not supported");
  });

  it("marks template_evolution proposals as skipped", () => {
    const proposals: ApprovalProposal[] = [
      makeApprovalProposal({ id: "evo-change", subsystem: "template_evolution" }),
    ];
    const plans = buildAdoptionPlans(proposals);
    expect(plans[0]!.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// 4. Dry-run preview produces diff with no mutation
// ---------------------------------------------------------------------------

describe("previewAdoptionPlans", () => {
  it("returns before/after diff without mutating policy", () => {
    const proposals: ApprovalProposal[] = [makeApprovalProposal()];
    const plans = previewAdoptionPlans(proposals);

    expect(plans).toHaveLength(1);
    expect(plans[0]!.dryRunDiff.before).toBe(0.3);
    expect(plans[0]!.dryRunDiff.after).toBe(0.5);
    expect(plans[0]!.status).toBe("ready");

    // Verify no adoption history was created
    expect(listAdoptionHistory()).toHaveLength(0);
  });

  it("does not create any history entries", () => {
    const proposals: ApprovalProposal[] = [makeApprovalProposal()];
    previewAdoptionPlans(proposals);
    previewAdoptionPlans(proposals);
    expect(listAdoptionHistory()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Apply mode updates target artifact deterministically
// ---------------------------------------------------------------------------

describe("applyAdoptionPlans", () => {
  it("applies ready plans to policy artifact", () => {
    setupApprovedProposals([makeImprovementProposal()]);

    const { applied, skipped, history } = applyAdoptionPlans();

    expect(applied).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(history).toHaveLength(1);

    expect(applied[0]!.status).toBe("applied");
    expect(history[0]!.status).toBe("applied");
    expect(history[0]!.before).toBe(0.3);
    expect(history[0]!.after).toBe(0.5);
  });

  it("skips already-applied plans", () => {
    setupApprovedProposals([makeImprovementProposal()]);

    // First apply
    applyAdoptionPlans();

    // Second apply — should skip because value already matches
    const { applied, skipped } = applyAdoptionPlans();
    expect(applied).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.skipReason).toContain("already matches");
  });

  it("does not apply rejected proposals", () => {
    collectPendingProposals([makeImprovementProposal()]);
    submitApprovalDecision("routing-weight-adjustment-schema", "rejected");

    const { applied } = applyAdoptionPlans();
    expect(applied).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Adoption history is recorded correctly
// ---------------------------------------------------------------------------

describe("listAdoptionHistory", () => {
  it("records applied entries", () => {
    setupApprovedProposals([makeImprovementProposal()]);
    applyAdoptionPlans({ appliedBy: "admin", notes: "testing" });

    const history = listAdoptionHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.appliedBy).toBe("admin");
    expect(history[0]!.notes).toBe("testing");
    expect(history[0]!.status).toBe("applied");
    expect(history[0]!.subsystem).toBe("provider_routing");
  });

  it("accumulates history across multiple applies", () => {
    const p1 = makeImprovementProposal();
    const p2 = makeImprovementProposal({
      id: "cost-threshold-review",
      subsystem: "cost_guardrail",
      suggestedAction: {
        type: "adjust_threshold",
        target: "max_cost_per_step",
        currentValue: 0.05,
        suggestedValue: 0.065,
      },
    });

    setupApprovedProposals([p1, p2]);
    applyAdoptionPlans({ proposalId: p1.id });
    applyAdoptionPlans({ proposalId: p2.id });

    expect(listAdoptionHistory()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Rollback metadata is generated correctly
// ---------------------------------------------------------------------------

describe("buildRollbackMetadata", () => {
  it("generates rollback metadata for applied plans", () => {
    setupApprovedProposals([makeImprovementProposal()]);
    const { applied } = applyAdoptionPlans();

    const rollbacks = buildRollbackMetadata(applied);

    expect(rollbacks).toHaveLength(1);
    expect(rollbacks[0]!.planId).toBe("adopt-routing-weight-adjustment-schema");
    expect(rollbacks[0]!.rollbackAction.targetFile).toBe("data/factory-policy.json");
    expect(rollbacks[0]!.rollbackAction.key).toBe("provider_routing.recent_score_weight");
    expect(rollbacks[0]!.rollbackAction.restoreValue).toBe(0.3);
  });

  it("excludes skipped plans from rollback", () => {
    const proposals: ApprovalProposal[] = [
      makeApprovalProposal({ id: "auto-change", subsystem: "autopilot" }),
    ];
    const plans = buildAdoptionPlans(proposals);
    const rollbacks = buildRollbackMetadata(plans);
    expect(rollbacks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Single-proposal apply works
// ---------------------------------------------------------------------------

describe("single-proposal apply", () => {
  it("applies only the specified proposal", () => {
    const p1 = makeImprovementProposal();
    const p2 = makeImprovementProposal({
      id: "cost-threshold-review",
      subsystem: "cost_guardrail",
      suggestedAction: {
        type: "adjust_threshold",
        target: "max_cost_per_step",
        currentValue: 0.05,
        suggestedValue: 0.065,
      },
    });

    setupApprovedProposals([p1, p2]);

    const { applied } = applyAdoptionPlans({ proposalId: p1.id });
    expect(applied).toHaveLength(1);
    expect(applied[0]!.proposalId).toBe(p1.id);

    // p2 should still be ready
    const plans = buildAdoptionPlans();
    const p2Plan = plans.find((p) => p.proposalId === p2.id);
    expect(p2Plan!.status).toBe("ready");
  });
});

// ---------------------------------------------------------------------------
// 9. Report and format
// ---------------------------------------------------------------------------

describe("buildAdoptionReport", () => {
  it("builds complete report", () => {
    setupApprovedProposals([makeImprovementProposal()]);
    applyAdoptionPlans();

    const report = buildAdoptionReport();
    expect(report.plans).toHaveLength(1);
    expect(report.history).toHaveLength(1);
    expect(report.summary.appliedCount).toBe(0); // already applied → skipped on rebuild
    expect(report.summary.skippedCount).toBe(1);
  });
});

describe("formatAdoptionReport", () => {
  it("produces readable text output", () => {
    setupApprovedProposals([makeImprovementProposal()]);

    const report = buildAdoptionReport();
    const text = formatAdoptionReport(report);

    expect(text).toContain("APPROVED CHANGE ADOPTION REPORT");
    expect(text).toContain("routing-weight-adjustment-schema");
    expect(text).toContain("provider_routing");
  });

  it("includes history section after apply", () => {
    setupApprovedProposals([makeImprovementProposal()]);
    applyAdoptionPlans();

    const report = buildAdoptionReport();
    const text = formatAdoptionReport(report);
    expect(text).toContain("ADOPTION HISTORY");
  });
});

// ---------------------------------------------------------------------------
// 10. Same inputs yield same plan output (determinism)
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same proposals produce identical plans", () => {
    const proposals: ApprovalProposal[] = [makeApprovalProposal()];
    const p1 = buildAdoptionPlans(proposals);
    const p2 = buildAdoptionPlans(proposals);

    expect(p1.length).toBe(p2.length);
    for (let i = 0; i < p1.length; i++) {
      expect(p1[i]!.planId).toBe(p2[i]!.planId);
      expect(p1[i]!.status).toBe(p2[i]!.status);
      expect(p1[i]!.dryRunDiff).toEqual(p2[i]!.dryRunDiff);
    }
  });

  it("plan ids are derived deterministically from proposal ids", () => {
    const proposals: ApprovalProposal[] = [
      makeApprovalProposal({ id: "test-abc" }),
    ];
    const plans = buildAdoptionPlans(proposals);
    expect(plans[0]!.planId).toBe("adopt-test-abc");
  });
});
