/**
 * Template Health / Promotion Governance v1 — Unit Tests
 *
 * 15 scenarios covering:
 * - Promotion lifecycle (candidate → green)
 * - Health monitoring (green → at_risk → degraded → demoted)
 * - Re-promotion eligibility
 * - Summary and reporting
 * - Edge cases and determinism
 */

import { describe, it, expect } from "vitest";
import type { RegressionStatus } from "../../regression/nightly-template-regression";
import {
  evaluateTemplateHealth,
  checkGreenEligibility,
  evaluateRepromotionEligibility,
  evaluateAllTemplateHealth,
  summarizeTemplateHealthSignals,
  buildTemplateGovernanceLog,
  buildGovernanceSummaryRollup,
  formatGovernanceResult,
  formatGovernanceBatchReport,
  buildSignalsFromRegressionHistory,
  GOVERNANCE_THRESHOLDS,
  type TemplateHealthSignals,
  type TemplateHealthState,
  type GreenCriteria,
  type TemplateGovernanceResult,
} from "../template-health-governance";

// ── Test Helpers ──────────────────────────────────────────────

function allGreenCriteria(): GreenCriteria {
  return {
    pipelineComplete: true,
    qualityGatesPass: true,
    baselinePass: true,
    tenantIsolationVerified: true,
    rbacVerified: true,
    runtimeVerificationDone: true,
  };
}

function makeSignals(overrides: Partial<TemplateHealthSignals> & {
  currentState: TemplateHealthState;
}): TemplateHealthSignals {
  return {
    greenCriteria: allGreenCriteria(),
    recentRegressionStatuses: ["pass"],
    latestRegressionStatus: "pass",
    latestBaselinePassed: true,
    latestQualityGatesPassed: true,
    ...overrides,
  };
}

// ── 1. Candidate promotes to green when all GREEN criteria pass ──

describe("promotion lifecycle", () => {
  it("candidate promotes to green when all GREEN criteria pass", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "candidate",
      recentRegressionStatuses: ["pass"],
    }));

    expect(result.decision).toBe("promote_to_green");
    expect(result.nextState).toBe("green");
    expect(result.reasons).toContain("all GREEN criteria satisfied");
  });

  // ── 2. Candidate blocked when any GREEN criterion fails ────

  it("candidate is blocked from promotion when any GREEN criterion fails", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "candidate",
      greenCriteria: {
        ...allGreenCriteria(),
        rbacVerified: false,
      },
    }));

    expect(result.decision).toBe("hold_candidate");
    expect(result.nextState).toBe("candidate");
    expect(result.reasons.some((r) => r.includes("rbac_unverified"))).toBe(true);
  });

  it("candidate is blocked when latest regression is fail even with green criteria", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "candidate",
      recentRegressionStatuses: ["fail"],
      latestRegressionStatus: "fail",
    }));

    expect(result.decision).toBe("blocked_from_promotion");
    expect(result.nextState).toBe("candidate");
  });
});

// ── 3. Green becomes at_risk on degraded latest run ──────────

describe("green → at_risk transitions", () => {
  it("green becomes at_risk on degraded latest run", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["degraded", "pass", "pass"],
      latestRegressionStatus: "degraded",
    }));

    expect(result.decision).toBe("mark_at_risk");
    expect(result.nextState).toBe("at_risk");
    expect(result.reasons).toContain("latest regression run degraded");
  });

  // ── 4. Green becomes at_risk on 2 degraded runs in last 5 ──

  it("green becomes at_risk on 2 degraded runs in last 5", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["pass", "degraded", "pass", "degraded", "pass"],
      latestRegressionStatus: "pass",
    }));

    expect(result.decision).toBe("mark_at_risk");
    expect(result.nextState).toBe("at_risk");
    expect(result.reasons.some((r) => r.includes("2 degraded runs"))).toBe(true);
  });
});

// ── 5. Green/at_risk becomes degraded on fail latest run ─────

describe("degradation transitions", () => {
  it("green becomes degraded on fail latest run", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["fail", "pass", "pass"],
      latestRegressionStatus: "fail",
    }));

    expect(result.decision).toBe("mark_degraded");
    expect(result.nextState).toBe("degraded");
    expect(result.reasons).toContain("latest regression run failed");
  });

  it("at_risk becomes degraded on fail latest run", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "at_risk",
      recentRegressionStatuses: ["fail", "degraded", "pass"],
      latestRegressionStatus: "fail",
    }));

    expect(result.decision).toBe("mark_degraded");
    expect(result.nextState).toBe("degraded");
  });

  it("becomes degraded on 2 fail runs in window", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["pass", "fail", "pass", "fail", "pass"],
      latestRegressionStatus: "pass",
    }));

    expect(result.decision).toBe("mark_degraded");
    expect(result.nextState).toBe("degraded");
  });
});

// ── 6. Degraded triggers demote on repeated failures ─────────

describe("demotion transitions", () => {
  it("demotes on 3 fail runs in last 5", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "degraded",
      recentRegressionStatuses: ["pass", "fail", "fail", "fail", "pass"],
      latestRegressionStatus: "pass",
    }));

    expect(result.decision).toBe("demote");
    expect(result.nextState).toBe("demoted");
    expect(result.reasons.some((r) => r.includes("3 fail runs"))).toBe(true);
  });

  it("demotes on 2 consecutive fail runs", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "degraded",
      recentRegressionStatuses: ["fail", "fail", "pass", "pass"],
      latestRegressionStatus: "fail",
    }));

    expect(result.decision).toBe("demote");
    expect(result.nextState).toBe("demoted");
    expect(result.reasons.some((r) => r.includes("consecutive fail"))).toBe(true);
  });

  // ── 7. Demotion when core GREEN criteria fail ──────────────

  it("demotes when core GREEN criteria fail", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      greenCriteria: { ...allGreenCriteria(), qualityGatesPass: false },
      recentRegressionStatuses: ["pass", "pass"],
    }));

    expect(result.decision).toBe("demote");
    expect(result.nextState).toBe("demoted");
    expect(result.reasons.some((r) => r.includes("quality_gates_fail"))).toBe(true);
  });
});

// ── 8. Re-promotion eligibility ──────────────────────────────

describe("re-promotion eligibility", () => {
  it("eligible_for_repromotion when latest 2 runs pass and GREEN criteria restored", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "demoted",
      recentRegressionStatuses: ["pass", "pass", "fail", "fail"],
    }));

    expect(result.decision).toBe("eligible_for_repromotion");
    expect(result.nextState).toBe("demoted"); // state stays demoted until explicit promotion
    expect(result.reasons.some((r) => r.includes("consecutive pass runs"))).toBe(true);
  });

  // ── 9. No automatic re-promotion without explicit promote ──

  it("no automatic re-promotion — state remains demoted", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "demoted",
      recentRegressionStatuses: ["pass", "pass", "pass"],
    }));

    // Decision is eligible_for_repromotion, but nextState remains demoted
    expect(result.decision).toBe("eligible_for_repromotion");
    expect(result.nextState).toBe("demoted");
    expect(result.nextState).not.toBe("green");
  });

  it("degraded template eligible for repromotion when recovered", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "degraded",
      recentRegressionStatuses: ["pass", "pass", "fail"],
    }));

    expect(result.decision).toBe("eligible_for_repromotion");
    expect(result.nextState).toBe("degraded");
  });

  it("demoted template blocked when GREEN criteria not met", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "demoted",
      greenCriteria: { ...allGreenCriteria(), baselinePass: false },
      recentRegressionStatuses: ["pass", "pass", "pass"],
    }));

    expect(result.decision).toBe("blocked_from_promotion");
    expect(result.reasons.some((r) => r.includes("baseline_fail"))).toBe(true);
  });
});

// ── 10. Governance summary includes explainable reasons ──────

describe("explainability", () => {
  it("governance result includes explainable reasons", () => {
    const result = evaluateTemplateHealth("reservation_saas", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["degraded", "degraded", "pass"],
    }));

    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.templateKey).toBe("reservation_saas");
    expect(result.evaluatedAt).toBeDefined();
    expect(result.signals.recentDegradedCount).toBe(2);
  });

  it("buildTemplateGovernanceLog produces structured log", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["pass"],
    }));

    const log = buildTemplateGovernanceLog(result);
    expect(log.templateKey).toBe("test_template");
    expect(log.decision).toBe("remain_green");
    expect(log.timestamp).toBeDefined();
  });
});

// ── 11. Report formatting ────────────────────────────────────

describe("reporting", () => {
  it("formatGovernanceResult produces readable output", () => {
    const result = evaluateTemplateHealth("reservation_saas", makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["degraded"],
    }));

    const report = formatGovernanceResult(result);
    expect(report).toContain("reservation_saas");
    expect(report).toContain("AT_RISK");
    expect(report).toContain("Decision:");
  });

  it("formatGovernanceBatchReport includes summary counts", () => {
    const batch = evaluateAllTemplateHealth([
      { templateKey: "t1", signals: makeSignals({ currentState: "green" }) },
      { templateKey: "t2", signals: makeSignals({ currentState: "candidate" }) },
    ]);

    const report = formatGovernanceBatchReport(batch);
    expect(report).toContain("TEMPLATE HEALTH GOVERNANCE");
    expect(report).toContain("SUMMARY");
    expect(report).toContain("Green:");
  });
});

// ── 12. Conservative behavior when evidence is sparse ────────

describe("conservative behavior", () => {
  it("green with no regression history remains green", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      recentRegressionStatuses: [],
      latestRegressionStatus: undefined,
    }));

    expect(result.decision).toBe("remain_green");
    expect(result.nextState).toBe("green");
  });

  it("candidate with no regression data holds", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "candidate",
      greenCriteria: { ...allGreenCriteria(), runtimeVerificationDone: false },
      recentRegressionStatuses: [],
    }));

    expect(result.decision).toBe("hold_candidate");
    expect(result.nextState).toBe("candidate");
  });
});

// ── 13. Summary rollup counts states correctly ───────────────

describe("summary rollup", () => {
  it("counts states correctly", () => {
    const results: TemplateGovernanceResult[] = [
      evaluateTemplateHealth("t1", makeSignals({ currentState: "green" })),
      evaluateTemplateHealth("t2", makeSignals({ currentState: "green", recentRegressionStatuses: ["fail"] })),
      evaluateTemplateHealth("t3", makeSignals({ currentState: "candidate" })),
      evaluateTemplateHealth("t4", makeSignals({ currentState: "demoted", recentRegressionStatuses: ["pass", "pass"] })),
    ];

    const rollup = buildGovernanceSummaryRollup(results);

    expect(rollup.greenCount).toBe(2); // t1 remains green + t3 promoted to green
    expect(rollup.degradedCount).toBe(1); // t2 → degraded
    expect(rollup.promoteToGreenCount).toBe(1); // t3 → promote (nextState = green)
    expect(rollup.eligibleForRepromotionCount).toBe(1); // t4 → eligible
  });
});

// ── 14. Deterministic evaluation ─────────────────────────────

describe("determinism", () => {
  it("same input produces same output", () => {
    const signals = makeSignals({
      currentState: "at_risk",
      recentRegressionStatuses: ["degraded", "pass", "fail", "pass"],
    });

    const r1 = evaluateTemplateHealth("t1", signals);
    const r2 = evaluateTemplateHealth("t1", signals);

    expect(r1.decision).toBe(r2.decision);
    expect(r1.nextState).toBe(r2.nextState);
    expect(r1.reasons).toEqual(r2.reasons);
    expect(r1.signals).toEqual(r2.signals);
  });
});

// ── 15. No governance path weakens GREEN requirements ────────

describe("GREEN criteria integrity", () => {
  it("checkGreenEligibility requires all 6 criteria", () => {
    const full = checkGreenEligibility(allGreenCriteria());
    expect(full.eligible).toBe(true);
    expect(full.failedCriteria).toHaveLength(0);

    // Each criterion failure is detected
    const fields: (keyof GreenCriteria)[] = [
      "pipelineComplete",
      "qualityGatesPass",
      "baselinePass",
      "tenantIsolationVerified",
      "rbacVerified",
      "runtimeVerificationDone",
    ];

    for (const field of fields) {
      const criteria = { ...allGreenCriteria(), [field]: false };
      const result = checkGreenEligibility(criteria);
      expect(result.eligible).toBe(false);
      expect(result.failedCriteria.length).toBeGreaterThan(0);
    }
  });

  it("no promotion decision occurs when GREEN criteria fail", () => {
    // Even with perfect regression history, failing criteria blocks promotion
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "candidate",
      greenCriteria: { ...allGreenCriteria(), tenantIsolationVerified: false },
      recentRegressionStatuses: ["pass", "pass", "pass", "pass", "pass"],
    }));

    expect(result.decision).not.toBe("promote_to_green");
    expect(result.nextState).not.toBe("green");
  });

  it("green template demoted when core criteria fail regardless of regression", () => {
    const result = evaluateTemplateHealth("test_template", makeSignals({
      currentState: "green",
      greenCriteria: { ...allGreenCriteria(), pipelineComplete: false },
      recentRegressionStatuses: ["pass", "pass", "pass"],
    }));

    expect(result.decision).toBe("demote");
    expect(result.nextState).toBe("demoted");
  });
});

// ── Additional: evaluateRepromotionEligibility standalone ────

describe("evaluateRepromotionEligibility", () => {
  it("returns eligible when conditions met", () => {
    const result = evaluateRepromotionEligibility("t1", makeSignals({
      currentState: "demoted",
      recentRegressionStatuses: ["pass", "pass"],
    }));
    expect(result.eligible).toBe(true);
  });

  it("returns ineligible for non-degraded/demoted templates", () => {
    const result = evaluateRepromotionEligibility("t1", makeSignals({
      currentState: "green",
    }));
    expect(result.eligible).toBe(false);
  });

  it("returns ineligible when pass streak is insufficient", () => {
    const result = evaluateRepromotionEligibility("t1", makeSignals({
      currentState: "demoted",
      recentRegressionStatuses: ["pass", "fail"],
    }));
    expect(result.eligible).toBe(false);
  });
});

// ── buildSignalsFromRegressionHistory ────────────────────────

describe("buildSignalsFromRegressionHistory", () => {
  it("builds signals from regression summaries", () => {
    const signals = buildSignalsFromRegressionHistory({
      currentState: "green",
      greenCriteria: allGreenCriteria(),
      recentRegressions: [
        {
          templateKey: "t1", shortName: "T1", runId: "r1",
          startedAt: "", finishedAt: "",
          pipelinePassed: true, qualityGatesPassed: true, baselinePassed: true,
          promotionEligible: true, fallbackUsed: false, fallbackCount: 0,
          selectedProviders: ["claude"], routingScores: [],
          estimatedCostTotal: 0.1, durationMsTotal: 5000,
          perStepStatus: [], qualityChecks: [],
          regressionStatus: "pass",
          comparison: { costDeltaPct: 5, durationDeltaPct: 10 },
        },
        {
          templateKey: "t1", shortName: "T1", runId: "r0",
          startedAt: "", finishedAt: "",
          pipelinePassed: true, qualityGatesPassed: true, baselinePassed: true,
          promotionEligible: true, fallbackUsed: true, fallbackCount: 1,
          selectedProviders: ["gemini"], routingScores: [],
          estimatedCostTotal: 0.09, durationMsTotal: 4500,
          perStepStatus: [], qualityChecks: [],
          regressionStatus: "degraded",
        },
      ],
    });

    expect(signals.currentState).toBe("green");
    expect(signals.recentRegressionStatuses).toEqual(["pass", "degraded"]);
    expect(signals.latestRegressionStatus).toBe("pass");
    expect(signals.latestBaselinePassed).toBe(true);
    expect(signals.latestCostDeltaPct).toBe(5);
  });
});

// ── summarizeTemplateHealthSignals ───────────────────────────

describe("summarizeTemplateHealthSignals", () => {
  it("computes correct counts and streaks", () => {
    const summary = summarizeTemplateHealthSignals(makeSignals({
      currentState: "green",
      recentRegressionStatuses: ["pass", "pass", "degraded", "fail", "pass"],
    }));

    expect(summary.recentPassCount).toBe(3);
    expect(summary.recentDegradedCount).toBe(1);
    expect(summary.recentFailCount).toBe(1);
    expect(summary.consecutivePassCount).toBe(2);
    expect(summary.consecutiveFailCount).toBe(0);
    expect(summary.greenCriteriaEligible).toBe(true);
  });

  it("computes consecutive fail streak correctly", () => {
    const summary = summarizeTemplateHealthSignals(makeSignals({
      currentState: "degraded",
      recentRegressionStatuses: ["fail", "fail", "pass"],
    }));

    expect(summary.consecutiveFailCount).toBe(2);
    expect(summary.consecutivePassCount).toBe(0);
  });
});
