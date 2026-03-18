/**
 * Policy Simulation Sandbox v1
 *
 * Accepts a hypothetical policy change, simulates its effect on
 * historical/synthetic factory outcomes, and produces a deterministic
 * comparison report.  Read-only — no live configs are modified.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SimulationSubsystem =
  | "provider_routing"
  | "provider_learning"
  | "cost_guardrail"
  | "control_plane"
  | "governance"
  | "regression";

export interface PolicySimulationRequest {
  subsystem: SimulationSubsystem;
  policyKey: string;
  currentValue: number;
  proposedValue: number;
  scope?: {
    taskKind?: string;
    templateKey?: string;
  };
}

export interface ProviderDistribution {
  [provider: string]: number;
}

export interface SimulationMetrics {
  selectedProviderDistribution: ProviderDistribution;
  degradedCount: number;
  failCount: number;
  averageEstimatedCost: number;
  fallbackCount: number;
}

export interface SimulationComparison {
  baseline: SimulationMetrics;
  simulated: SimulationMetrics;
  delta: {
    degradedCount: number;
    failCount: number;
    averageEstimatedCost: number;
    fallbackCount: number;
  };
}

export type SimulationRecommendation =
  | "worth_testing"
  | "neutral"
  | "not_recommended";

export interface SimulationReport {
  subsystem: SimulationSubsystem;
  policyKey: string;
  currentValue: number;
  proposedValue: number;
  comparison: SimulationComparison;
  recommendation: SimulationRecommendation;
  confidence: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Internal scenario generation (deterministic synthetic data)
// ---------------------------------------------------------------------------

/**
 * Number of synthetic observations generated per simulation.
 * Deterministic — same request always produces same count.
 */
const SYNTHETIC_OBSERVATION_COUNT = 20;

interface SyntheticObservation {
  provider: string;
  score: number;
  cost: number;
  degraded: boolean;
  failed: boolean;
  fallback: boolean;
}

/**
 * Deterministic pseudo-random based on a numeric seed.
 * Returns a value in [0, 1).
 */
function deterministicRandom(seed: number): number {
  // Simple LCG — deterministic for same seed
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/**
 * Build synthetic observations for a given subsystem + policy value.
 * The observations are deterministic for same inputs.
 */
function buildSyntheticObservations(
  subsystem: SimulationSubsystem,
  policyKey: string,
  policyValue: number,
  scope: PolicySimulationRequest["scope"],
  baseSeed: number,
): SyntheticObservation[] {
  const observations: SyntheticObservation[] = [];
  const providers = ["gemini", "claude"];

  for (let i = 0; i < SYNTHETIC_OBSERVATION_COUNT; i++) {
    const seed = baseSeed + i * 7 + policyValue * 1000;
    const r = deterministicRandom(seed);

    const providerIndex = r > 0.5 ? 0 : 1;
    const provider = providers[providerIndex]!;

    // Base score influenced by policy value and subsystem
    let score = 0.6 + r * 0.3;
    let cost = 0.02 + r * 0.04;
    let degradedProb = 0.15;
    let failProb = 0.08;
    let fallbackProb = 0.12;

    switch (subsystem) {
      case "provider_routing": {
        // Higher recent_score_weight → more reactive to recent performance
        // Can improve provider selection but may increase instability
        const recentWeight = policyValue;
        score = score * (1 - recentWeight) + (0.5 + r * 0.4) * recentWeight;
        degradedProb = 0.15 - recentWeight * 0.1 + (1 - score) * 0.2;
        failProb = 0.08 - recentWeight * 0.05 + (1 - score) * 0.1;
        fallbackProb = 0.12 - recentWeight * 0.08 + (1 - score) * 0.15;
        break;
      }
      case "provider_learning": {
        // Lower threshold → more learning influence → potentially better but riskier
        const threshold = policyValue;
        const learningInfluence = Math.max(0, 1 - threshold);
        score = score + learningInfluence * 0.1;
        degradedProb = degradedProb - learningInfluence * 0.05;
        failProb = failProb + (threshold < 0.3 ? 0.05 : 0);
        fallbackProb = fallbackProb - learningInfluence * 0.03;
        break;
      }
      case "cost_guardrail": {
        // Higher max_cost → fewer blocks/downgrades, but higher spend
        const maxCost = policyValue;
        cost = cost * (1 + maxCost * 2);
        degradedProb = degradedProb - maxCost * 0.5;
        failProb = failProb - maxCost * 0.3;
        fallbackProb = Math.max(0.01, fallbackProb - maxCost * 0.8);
        break;
      }
      case "control_plane": {
        // Adjust learning influence cap
        const influence = policyValue;
        score = score + influence * 0.15;
        degradedProb = degradedProb - influence * 0.08;
        failProb = failProb - influence * 0.04;
        cost = cost * (1 + influence * 0.5);
        break;
      }
      case "governance": {
        // Tighter thresholds (lower) → more aggressive demotion
        const threshold = policyValue;
        degradedProb = degradedProb + (1 - threshold) * 0.1;
        failProb = failProb + (1 - threshold) * 0.05;
        fallbackProb = fallbackProb - (1 - threshold) * 0.02;
        break;
      }
      case "regression": {
        // Higher cadence → more runs → better detection but higher cost
        const cadence = policyValue;
        degradedProb = degradedProb - cadence * 0.02;
        failProb = failProb - cadence * 0.01;
        cost = cost * (1 + cadence * 0.1);
        break;
      }
    }

    // Clamp probabilities
    degradedProb = Math.max(0, Math.min(1, degradedProb));
    failProb = Math.max(0, Math.min(1, failProb));
    fallbackProb = Math.max(0, Math.min(1, fallbackProb));

    const r2 = deterministicRandom(seed + 31);
    const r3 = deterministicRandom(seed + 59);
    const r4 = deterministicRandom(seed + 83);

    observations.push({
      provider,
      score: Math.max(0, Math.min(1, score)),
      cost: Math.max(0.001, cost),
      degraded: r2 < degradedProb,
      failed: r3 < failProb,
      fallback: r4 < fallbackProb,
    });
  }

  return observations;
}

/**
 * Aggregate observations into SimulationMetrics.
 */
function aggregateObservations(
  observations: SyntheticObservation[],
): SimulationMetrics {
  const distribution: ProviderDistribution = {};
  let degradedCount = 0;
  let failCount = 0;
  let totalCost = 0;
  let fallbackCount = 0;

  for (const obs of observations) {
    distribution[obs.provider] = (distribution[obs.provider] ?? 0) + 1;
    if (obs.degraded) degradedCount++;
    if (obs.failed) failCount++;
    totalCost += obs.cost;
    if (obs.fallback) fallbackCount++;
  }

  // Normalize distribution to fractions
  const total = observations.length;
  for (const key of Object.keys(distribution)) {
    distribution[key] = Math.round((distribution[key]! / total) * 100) / 100;
  }

  return {
    selectedProviderDistribution: distribution,
    degradedCount,
    failCount,
    averageEstimatedCost:
      total > 0 ? Math.round((totalCost / total) * 10000) / 10000 : 0,
    fallbackCount,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Simulate a policy change and return baseline + simulated metrics.
 * Pure function — no side effects, no mutation.
 */
export function simulatePolicyChange(
  request: PolicySimulationRequest,
): SimulationComparison {
  const baseSeed = hashRequest(request);

  const baselineObs = buildSyntheticObservations(
    request.subsystem,
    request.policyKey,
    request.currentValue,
    request.scope,
    baseSeed,
  );

  const simulatedObs = buildSyntheticObservations(
    request.subsystem,
    request.policyKey,
    request.proposedValue,
    request.scope,
    baseSeed,
  );

  return comparePolicyOutcomes(
    aggregateObservations(baselineObs),
    aggregateObservations(simulatedObs),
  );
}

/**
 * Compare two sets of metrics and compute deltas.
 */
export function comparePolicyOutcomes(
  baseline: SimulationMetrics,
  simulated: SimulationMetrics,
): SimulationComparison {
  return {
    baseline,
    simulated,
    delta: {
      degradedCount: simulated.degradedCount - baseline.degradedCount,
      failCount: simulated.failCount - baseline.failCount,
      averageEstimatedCost:
        Math.round(
          (simulated.averageEstimatedCost - baseline.averageEstimatedCost) *
            10000,
        ) / 10000,
      fallbackCount: simulated.fallbackCount - baseline.fallbackCount,
    },
  };
}

/**
 * Classify the simulation result into a recommendation.
 * Uses simple, explainable rules.
 */
export function classifySimulationRecommendation(
  comparison: SimulationComparison,
): { recommendation: SimulationRecommendation; reasons: string[] } {
  const { delta, baseline } = comparison;
  const reasons: string[] = [];

  let positiveSignals = 0;
  let negativeSignals = 0;

  // Evaluate degraded count
  if (delta.degradedCount < 0) {
    positiveSignals++;
    reasons.push(
      `simulated degraded count decreased by ${Math.abs(delta.degradedCount)}`,
    );
  } else if (delta.degradedCount > 0) {
    negativeSignals++;
    reasons.push(
      `simulated degraded count increased by ${delta.degradedCount}`,
    );
  }

  // Evaluate fail count
  if (delta.failCount < 0) {
    positiveSignals++;
    reasons.push(
      `simulated fail count decreased by ${Math.abs(delta.failCount)}`,
    );
  } else if (delta.failCount > 0) {
    negativeSignals += 2; // Fail increase is more severe
    reasons.push(`simulated fail count increased by ${delta.failCount}`);
  }

  // Evaluate fallback count
  if (delta.fallbackCount < 0) {
    positiveSignals++;
    reasons.push(
      `simulated fallback count decreased by ${Math.abs(delta.fallbackCount)}`,
    );
  } else if (delta.fallbackCount > 0) {
    negativeSignals++;
    reasons.push(
      `simulated fallback count increased by ${delta.fallbackCount}`,
    );
  }

  // Evaluate cost change
  const costChangePercent =
    baseline.averageEstimatedCost > 0
      ? (delta.averageEstimatedCost / baseline.averageEstimatedCost) * 100
      : 0;

  if (delta.averageEstimatedCost <= 0) {
    positiveSignals++;
    reasons.push(`cost decreased or remained stable`);
  } else if (costChangePercent <= 15) {
    // Acceptable increase
    reasons.push(
      `cost increase remained within tolerance (${costChangePercent.toFixed(1)}%)`,
    );
  } else {
    negativeSignals++;
    reasons.push(
      `cost increase exceeded tolerance (${costChangePercent.toFixed(1)}%)`,
    );
  }

  // Classify
  let recommendation: SimulationRecommendation;
  if (negativeSignals >= 2) {
    recommendation = "not_recommended";
  } else if (positiveSignals >= 2 && negativeSignals === 0) {
    recommendation = "worth_testing";
  } else if (positiveSignals > negativeSignals) {
    recommendation = "worth_testing";
  } else if (positiveSignals === negativeSignals) {
    recommendation = "neutral";
  } else {
    recommendation = "not_recommended";
  }

  return { recommendation, reasons };
}

/**
 * Compute confidence score (0–1) for the simulation.
 * Based on observation count, consistency, and tradeoffs.
 */
export function computeSimulationConfidence(
  comparison: SimulationComparison,
): number {
  const { delta, baseline, simulated } = comparison;

  // Base confidence from observation consistency
  // (SYNTHETIC_OBSERVATION_COUNT is fixed, so base is stable)
  let confidence = 0.5;

  // Boost: more observations = higher base confidence
  // With 20 synthetic observations, we get a modest base
  confidence += 0.15;

  // Boost: consistent direction of change (all improve or all worsen)
  const directions = [
    Math.sign(delta.degradedCount),
    Math.sign(delta.failCount),
    Math.sign(delta.fallbackCount),
  ];
  const nonZero = directions.filter((d) => d !== 0);
  if (nonZero.length > 0) {
    const allSame = nonZero.every((d) => d === nonZero[0]);
    if (allSame) {
      confidence += 0.15; // Consistent direction
    } else {
      confidence -= 0.1; // Mixed signals reduce confidence
    }
  }

  // Boost: magnitude of improvement
  const totalBaseline =
    baseline.degradedCount + baseline.failCount + baseline.fallbackCount;
  const totalSimulated =
    simulated.degradedCount + simulated.failCount + simulated.fallbackCount;
  if (totalBaseline > 0 && totalSimulated < totalBaseline) {
    const improvementRatio = (totalBaseline - totalSimulated) / totalBaseline;
    confidence += improvementRatio * 0.15;
  }

  // Penalty: tradeoffs present (some improve, some worsen)
  const hasTradeoff =
    (delta.degradedCount < 0 && delta.averageEstimatedCost > 0) ||
    (delta.failCount < 0 && delta.fallbackCount > 0);
  if (hasTradeoff) {
    confidence -= 0.05;
  }

  // Clamp to [0, 1]
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;
}

/**
 * Build a complete simulation report from a policy change request.
 * This is the main entry point for the sandbox.
 */
export function buildSimulationReport(
  request: PolicySimulationRequest,
): SimulationReport {
  const comparison = simulatePolicyChange(request);
  const { recommendation, reasons } =
    classifySimulationRecommendation(comparison);
  const confidence = computeSimulationConfidence(comparison);

  return {
    subsystem: request.subsystem,
    policyKey: request.policyKey,
    currentValue: request.currentValue,
    proposedValue: request.proposedValue,
    comparison,
    recommendation,
    confidence,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Formatting (console output)
// ---------------------------------------------------------------------------

export function formatSimulationReport(report: SimulationReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  POLICY SIMULATION REPORT");
  lines.push(hr);
  lines.push(`  Subsystem:      ${report.subsystem}`);
  lines.push(`  Policy Key:     ${report.policyKey}`);
  lines.push(`  Current Value:  ${report.currentValue}`);
  lines.push(`  Proposed Value: ${report.proposedValue}`);
  lines.push("");
  lines.push(`  Recommendation: ${report.recommendation.toUpperCase()}`);
  lines.push(`  Confidence:     ${report.confidence}`);
  lines.push("");
  lines.push("  Reasons:");
  for (const reason of report.reasons) {
    lines.push(`    - ${reason}`);
  }
  lines.push("");

  lines.push("  BASELINE METRICS:");
  lines.push(formatMetrics(report.comparison.baseline, "    "));
  lines.push("");
  lines.push("  SIMULATED METRICS:");
  lines.push(formatMetrics(report.comparison.simulated, "    "));
  lines.push("");
  lines.push("  DELTA:");
  const d = report.comparison.delta;
  lines.push(`    degradedCount:       ${formatDelta(d.degradedCount)}`);
  lines.push(`    failCount:           ${formatDelta(d.failCount)}`);
  lines.push(
    `    averageEstimatedCost: ${formatDelta(d.averageEstimatedCost)}`,
  );
  lines.push(`    fallbackCount:       ${formatDelta(d.fallbackCount)}`);
  lines.push(hr);

  return lines.join("\n");
}

function formatMetrics(m: SimulationMetrics, indent: string): string {
  const lines: string[] = [];
  lines.push(
    `${indent}providerDistribution: ${JSON.stringify(m.selectedProviderDistribution)}`,
  );
  lines.push(`${indent}degradedCount:        ${m.degradedCount}`);
  lines.push(`${indent}failCount:            ${m.failCount}`);
  lines.push(`${indent}averageEstimatedCost: ${m.averageEstimatedCost}`);
  lines.push(`${indent}fallbackCount:        ${m.fallbackCount}`);
  return lines.join("\n");
}

function formatDelta(v: number): string {
  if (v > 0) return `+${v}`;
  if (v < 0) return `${v}`;
  return "0";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic hash from request parameters to ensure reproducibility.
 */
function hashRequest(request: PolicySimulationRequest): number {
  const str = `${request.subsystem}:${request.policyKey}:${request.scope?.taskKind ?? ""}:${request.scope?.templateKey ?? ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash);
}
