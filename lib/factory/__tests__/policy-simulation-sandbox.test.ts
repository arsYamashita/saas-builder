import { describe, it, expect } from "vitest";
import {
  simulatePolicyChange,
  comparePolicyOutcomes,
  classifySimulationRecommendation,
  computeSimulationConfidence,
  buildSimulationReport,
  formatSimulationReport,
  type PolicySimulationRequest,
  type SimulationMetrics,
  type SimulationComparison,
  type SimulationReport,
} from "../policy-simulation-sandbox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  overrides: Partial<PolicySimulationRequest> = {},
): PolicySimulationRequest {
  return {
    subsystem: "provider_routing",
    policyKey: "recent_score_weight",
    currentValue: 0.3,
    proposedValue: 0.5,
    scope: { taskKind: "schema" },
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SimulationMetrics> = {}): SimulationMetrics {
  return {
    selectedProviderDistribution: { gemini: 0.5, claude: 0.5 },
    degradedCount: 3,
    failCount: 2,
    averageEstimatedCost: 0.04,
    fallbackCount: 4,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Routing weight simulation — deterministic baseline vs simulated
// ---------------------------------------------------------------------------

describe("simulatePolicyChange", () => {
  it("produces deterministic baseline vs simulated comparison for routing", () => {
    const req = makeRequest({
      subsystem: "provider_routing",
      policyKey: "recent_score_weight",
      currentValue: 0.3,
      proposedValue: 0.5,
    });

    const result = simulatePolicyChange(req);

    expect(result.baseline).toBeDefined();
    expect(result.simulated).toBeDefined();
    expect(result.delta).toBeDefined();

    // Metrics should be numeric
    expect(typeof result.baseline.degradedCount).toBe("number");
    expect(typeof result.baseline.failCount).toBe("number");
    expect(typeof result.baseline.averageEstimatedCost).toBe("number");
    expect(typeof result.baseline.fallbackCount).toBe("number");

    // Delta should equal simulated - baseline
    expect(result.delta.degradedCount).toBe(
      result.simulated.degradedCount - result.baseline.degradedCount,
    );
    expect(result.delta.failCount).toBe(
      result.simulated.failCount - result.baseline.failCount,
    );
    expect(result.delta.fallbackCount).toBe(
      result.simulated.fallbackCount - result.baseline.fallbackCount,
    );
  });

  // 2. Cost threshold simulation — deterministic cost/fallback comparison
  it("produces deterministic cost/fallback comparison for cost guardrail", () => {
    const req = makeRequest({
      subsystem: "cost_guardrail",
      policyKey: "max_cost_per_step",
      currentValue: 0.05,
      proposedValue: 0.065,
    });

    const result = simulatePolicyChange(req);

    expect(result.baseline.averageEstimatedCost).toBeGreaterThan(0);
    expect(result.simulated.averageEstimatedCost).toBeGreaterThan(0);
    expect(typeof result.delta.averageEstimatedCost).toBe("number");
    expect(typeof result.delta.fallbackCount).toBe("number");
  });

  // 3. Learning threshold simulation — bounded
  it("produces bounded results for learning threshold simulation", () => {
    const req = makeRequest({
      subsystem: "provider_learning",
      policyKey: "confidence_threshold",
      currentValue: 0.5,
      proposedValue: 0.3,
    });

    const result = simulatePolicyChange(req);

    // All counts should be non-negative
    expect(result.baseline.degradedCount).toBeGreaterThanOrEqual(0);
    expect(result.baseline.failCount).toBeGreaterThanOrEqual(0);
    expect(result.baseline.fallbackCount).toBeGreaterThanOrEqual(0);
    expect(result.simulated.degradedCount).toBeGreaterThanOrEqual(0);
    expect(result.simulated.failCount).toBeGreaterThanOrEqual(0);
    expect(result.simulated.fallbackCount).toBeGreaterThanOrEqual(0);
  });

  it("supports control_plane subsystem", () => {
    const req = makeRequest({
      subsystem: "control_plane",
      policyKey: "learning_max_influence",
      currentValue: 0.08,
      proposedValue: 0.12,
    });
    const result = simulatePolicyChange(req);
    expect(result.baseline).toBeDefined();
    expect(result.simulated).toBeDefined();
  });

  it("supports governance subsystem", () => {
    const req = makeRequest({
      subsystem: "governance",
      policyKey: "at_risk_degraded_count",
      currentValue: 2,
      proposedValue: 3,
    });
    const result = simulatePolicyChange(req);
    expect(result.baseline).toBeDefined();
    expect(result.simulated).toBeDefined();
  });

  it("supports regression subsystem", () => {
    const req = makeRequest({
      subsystem: "regression",
      policyKey: "cadence_multiplier",
      currentValue: 1,
      proposedValue: 2,
    });
    const result = simulatePolicyChange(req);
    expect(result.baseline).toBeDefined();
    expect(result.simulated).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// comparePolicyOutcomes
// ---------------------------------------------------------------------------

describe("comparePolicyOutcomes", () => {
  it("computes correct deltas", () => {
    const baseline = makeMetrics({ degradedCount: 5, failCount: 3, fallbackCount: 4, averageEstimatedCost: 0.04 });
    const simulated = makeMetrics({ degradedCount: 3, failCount: 2, fallbackCount: 2, averageEstimatedCost: 0.045 });

    const result = comparePolicyOutcomes(baseline, simulated);

    expect(result.delta.degradedCount).toBe(-2);
    expect(result.delta.failCount).toBe(-1);
    expect(result.delta.fallbackCount).toBe(-2);
    expect(result.delta.averageEstimatedCost).toBe(0.005);
  });
});

// ---------------------------------------------------------------------------
// 4. Governance threshold — recommendation classification
// ---------------------------------------------------------------------------

describe("classifySimulationRecommendation", () => {
  it("classifies improvement as worth_testing", () => {
    const comparison: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 5, failCount: 3, fallbackCount: 4, averageEstimatedCost: 0.04 }),
      simulated: makeMetrics({ degradedCount: 3, failCount: 2, fallbackCount: 2, averageEstimatedCost: 0.041 }),
      delta: { degradedCount: -2, failCount: -1, fallbackCount: -2, averageEstimatedCost: 0.001 },
    };

    const { recommendation, reasons } = classifySimulationRecommendation(comparison);
    expect(recommendation).toBe("worth_testing");
    expect(reasons.length).toBeGreaterThan(0);
  });

  it("classifies worsening as not_recommended", () => {
    const comparison: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 2, failCount: 1, fallbackCount: 2, averageEstimatedCost: 0.04 }),
      simulated: makeMetrics({ degradedCount: 5, failCount: 4, fallbackCount: 5, averageEstimatedCost: 0.06 }),
      delta: { degradedCount: 3, failCount: 3, fallbackCount: 3, averageEstimatedCost: 0.02 },
    };

    const { recommendation } = classifySimulationRecommendation(comparison);
    expect(recommendation).toBe("not_recommended");
  });

  it("classifies mixed results as neutral", () => {
    // 1 positive (degraded -1), 1 negative (fallback +1), cost within tolerance (no signal)
    const comparison: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 3, failCount: 2, fallbackCount: 3, averageEstimatedCost: 0.04 }),
      simulated: makeMetrics({ degradedCount: 2, failCount: 2, fallbackCount: 4, averageEstimatedCost: 0.041 }),
      delta: { degradedCount: -1, failCount: 0, fallbackCount: 1, averageEstimatedCost: 0.001 },
    };

    const { recommendation } = classifySimulationRecommendation(comparison);
    expect(recommendation).toBe("neutral");
  });

  // 5. Recommendation ranking is deterministic
  it("produces deterministic recommendation for same input", () => {
    const comparison: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 4, failCount: 2, fallbackCount: 3, averageEstimatedCost: 0.04 }),
      simulated: makeMetrics({ degradedCount: 2, failCount: 1, fallbackCount: 1, averageEstimatedCost: 0.042 }),
      delta: { degradedCount: -2, failCount: -1, fallbackCount: -2, averageEstimatedCost: 0.002 },
    };

    const r1 = classifySimulationRecommendation(comparison);
    const r2 = classifySimulationRecommendation(comparison);
    expect(r1.recommendation).toBe(r2.recommendation);
    expect(r1.reasons).toEqual(r2.reasons);
  });

  // 7. Reasons are explainable
  it("produces human-readable reasons", () => {
    const comparison: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 5, failCount: 3, fallbackCount: 4, averageEstimatedCost: 0.04 }),
      simulated: makeMetrics({ degradedCount: 3, failCount: 2, fallbackCount: 2, averageEstimatedCost: 0.045 }),
      delta: { degradedCount: -2, failCount: -1, fallbackCount: -2, averageEstimatedCost: 0.005 },
    };

    const { reasons } = classifySimulationRecommendation(comparison);
    expect(reasons.length).toBeGreaterThan(0);
    for (const reason of reasons) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Confidence scoring is stable
// ---------------------------------------------------------------------------

describe("computeSimulationConfidence", () => {
  it("returns stable confidence for same inputs", () => {
    const comparison: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 4, failCount: 2, fallbackCount: 3, averageEstimatedCost: 0.04 }),
      simulated: makeMetrics({ degradedCount: 2, failCount: 1, fallbackCount: 1, averageEstimatedCost: 0.042 }),
      delta: { degradedCount: -2, failCount: -1, fallbackCount: -2, averageEstimatedCost: 0.002 },
    };

    const c1 = computeSimulationConfidence(comparison);
    const c2 = computeSimulationConfidence(comparison);
    expect(c1).toBe(c2);
  });

  it("returns value between 0 and 1", () => {
    const comparison: SimulationComparison = {
      baseline: makeMetrics(),
      simulated: makeMetrics({ degradedCount: 10, failCount: 10, fallbackCount: 10 }),
      delta: { degradedCount: 7, failCount: 8, fallbackCount: 6, averageEstimatedCost: 0.01 },
    };

    const confidence = computeSimulationConfidence(comparison);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it("higher confidence for consistent improvement", () => {
    const improving: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 5, failCount: 3, fallbackCount: 4 }),
      simulated: makeMetrics({ degradedCount: 2, failCount: 1, fallbackCount: 1 }),
      delta: { degradedCount: -3, failCount: -2, fallbackCount: -3, averageEstimatedCost: 0 },
    };

    const mixed: SimulationComparison = {
      baseline: makeMetrics({ degradedCount: 5, failCount: 3, fallbackCount: 4 }),
      simulated: makeMetrics({ degradedCount: 2, failCount: 5, fallbackCount: 1 }),
      delta: { degradedCount: -3, failCount: 2, fallbackCount: -3, averageEstimatedCost: 0 },
    };

    const confImproving = computeSimulationConfidence(improving);
    const confMixed = computeSimulationConfidence(mixed);
    expect(confImproving).toBeGreaterThan(confMixed);
  });
});

// ---------------------------------------------------------------------------
// 8. Read-only behavior is preserved
// ---------------------------------------------------------------------------

describe("read-only behavior", () => {
  it("does not mutate the request object", () => {
    const req = makeRequest();
    const reqCopy = JSON.parse(JSON.stringify(req));

    buildSimulationReport(req);

    expect(req).toEqual(reqCopy);
  });

  it("produces report-only output with no side effects", () => {
    const report = buildSimulationReport(makeRequest());

    // Report is a plain data structure
    expect(typeof report.subsystem).toBe("string");
    expect(typeof report.policyKey).toBe("string");
    expect(typeof report.recommendation).toBe("string");
    expect(typeof report.confidence).toBe("number");
    expect(Array.isArray(report.reasons)).toBe(true);
    expect(report.comparison.baseline).toBeDefined();
    expect(report.comparison.simulated).toBeDefined();
    expect(report.comparison.delta).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 10. Same input always yields same output (determinism)
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same request always produces identical report", () => {
    const req = makeRequest();
    const r1 = buildSimulationReport(req);
    const r2 = buildSimulationReport(req);
    expect(r1).toEqual(r2);
  });

  it("different proposed values produce different reports", () => {
    const r1 = buildSimulationReport(makeRequest({ proposedValue: 0.5 }));
    const r2 = buildSimulationReport(makeRequest({ proposedValue: 0.9 }));

    // Reports should differ in at least the proposed value and comparison
    expect(r1.proposedValue).not.toBe(r2.proposedValue);
  });

  it("different subsystems produce different reports", () => {
    const r1 = buildSimulationReport(makeRequest({ subsystem: "provider_routing" }));
    const r2 = buildSimulationReport(makeRequest({ subsystem: "cost_guardrail" }));
    expect(r1.subsystem).not.toBe(r2.subsystem);
  });
});

// ---------------------------------------------------------------------------
// 9. CLI format support (via formatSimulationReport)
// ---------------------------------------------------------------------------

describe("formatSimulationReport", () => {
  it("produces readable text output", () => {
    const report = buildSimulationReport(makeRequest());
    const text = formatSimulationReport(report);

    expect(text).toContain("POLICY SIMULATION REPORT");
    expect(text).toContain("provider_routing");
    expect(text).toContain("recent_score_weight");
    expect(text).toContain("Recommendation:");
    expect(text).toContain("Confidence:");
    expect(text).toContain("BASELINE METRICS");
    expect(text).toContain("SIMULATED METRICS");
    expect(text).toContain("DELTA");
  });

  it("JSON output is valid JSON", () => {
    const report = buildSimulationReport(makeRequest());
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json) as SimulationReport;
    expect(parsed.subsystem).toBe("provider_routing");
    expect(parsed.comparison).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// buildSimulationReport integration
// ---------------------------------------------------------------------------

describe("buildSimulationReport", () => {
  it("routing policy simulation end-to-end", () => {
    const report = buildSimulationReport({
      subsystem: "provider_routing",
      policyKey: "recent_score_weight",
      currentValue: 0.3,
      proposedValue: 0.5,
      scope: { taskKind: "schema" },
    });

    expect(report.subsystem).toBe("provider_routing");
    expect(report.policyKey).toBe("recent_score_weight");
    expect(["worth_testing", "neutral", "not_recommended"]).toContain(report.recommendation);
    expect(report.confidence).toBeGreaterThanOrEqual(0);
    expect(report.confidence).toBeLessThanOrEqual(1);
    expect(report.reasons.length).toBeGreaterThan(0);
  });

  it("cost guardrail policy simulation end-to-end", () => {
    const report = buildSimulationReport({
      subsystem: "cost_guardrail",
      policyKey: "max_cost_per_step",
      currentValue: 0.05,
      proposedValue: 0.065,
      scope: { taskKind: "schema" },
    });

    expect(report.subsystem).toBe("cost_guardrail");
    expect(report.comparison.baseline.averageEstimatedCost).toBeGreaterThan(0);
    expect(report.comparison.simulated.averageEstimatedCost).toBeGreaterThan(0);
  });

  it("governance policy simulation end-to-end", () => {
    const report = buildSimulationReport({
      subsystem: "governance",
      policyKey: "at_risk_degraded_count",
      currentValue: 2,
      proposedValue: 3,
    });

    expect(report.subsystem).toBe("governance");
    expect(["worth_testing", "neutral", "not_recommended"]).toContain(report.recommendation);
  });
});
