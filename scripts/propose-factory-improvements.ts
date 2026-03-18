#!/usr/bin/env npx tsx
/**
 * CLI: Propose Factory Improvements
 *
 * Generates self-improvement proposals by analyzing Factory operational data.
 * Proposal-only — does not modify any factory config.
 *
 * Usage:
 *   npx tsx scripts/propose-factory-improvements.ts
 *   npx tsx scripts/propose-factory-improvements.ts --json
 */

import {
  buildSelfImprovementReport,
  formatImprovementReport,
  type FactoryOutcomes,
  type RoutingOutcome,
  type CostGuardrailOutcome,
  type LearningOutcome,
  type GovernanceOutcome,
  type AutopilotOutcomeEntry,
} from "../lib/factory/self-improving-factory";

import { TEMPLATE_CATALOG } from "../lib/templates/template-catalog";
import { listRoutes } from "../lib/providers/task-router";
import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
} from "../lib/factory/template-health-governance";
import {
  buildEvolutionReport,
} from "../lib/factory/template-evolution-engine";
import {
  selectForAutopilot,
  DEFAULT_AUTOPILOT_CONFIG,
} from "../lib/factory/template-autopilot";
import type { TaskKind, ProviderId } from "../lib/providers/provider-interface";
import type { CostGuardrailDecision } from "../lib/providers/cost-guardrail";

// ── Build outcomes from live factory state ──────────────────

function buildLiveOutcomes(): FactoryOutcomes {
  // Routing: derive from static route table (no live run data available)
  const routes = listRoutes();
  const routingOutcomes: RoutingOutcome[] = routes.map((r) => ({
    taskKind: r.taskKind,
    provider: r.primary,
    baseScore: 0.7,
    recentScore: null,
    status: "pass" as const,
    fallbackUsed: false,
  }));

  // Cost guardrail: no live decisions available, use empty
  const costGuardrailOutcomes: CostGuardrailOutcome[] = [];

  // Learning: no live preferences available, use empty
  const learningOutcomes: LearningOutcome[] = [];

  // Governance: evaluate current template health
  const templatesWithSignals = TEMPLATE_CATALOG.map((entry) => {
    const isGreen = entry.statusBadge === "GREEN";
    const signals: TemplateHealthSignals = {
      currentState: isGreen ? "green" : "candidate",
      greenCriteria: {
        pipelineComplete: isGreen,
        qualityGatesPass: isGreen,
        baselinePass: isGreen,
        tenantIsolationVerified: isGreen,
        rbacVerified: isGreen,
        runtimeVerificationDone: isGreen,
      },
      recentRegressionStatuses: isGreen ? ["pass", "pass", "pass"] : [],
      latestBaselinePassed: isGreen,
      latestQualityGatesPassed: isGreen,
    };
    return { templateKey: entry.templateKey, signals };
  });

  const governanceBatch = evaluateAllTemplateHealth(templatesWithSignals);
  const governanceOutcomes: GovernanceOutcome[] = governanceBatch.results.map((r) => ({
    templateKey: r.templateKey,
    currentState: r.currentState,
    decision: r.decision,
    consecutiveAtRiskOrDegraded: 0,
  }));

  // Autopilot: evaluate evolution proposals
  const evolutionReport = buildEvolutionReport();
  const autopilotSelection = selectForAutopilot(
    evolutionReport.proposals,
    DEFAULT_AUTOPILOT_CONFIG
  );
  const autopilotOutcomes: AutopilotOutcomeEntry[] = autopilotSelection.rejected.map(
    (r) => ({
      proposalId: r.proposal.templateId,
      domain: r.proposal.domain,
      outcome: "not_started" as const,
      confidence: r.proposal.confidence,
    })
  );

  return {
    routingOutcomes,
    costGuardrailOutcomes,
    learningOutcomes,
    governanceOutcomes,
    autopilotOutcomes,
    currentMode: "balanced",
  };
}

// ── Main ────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");

  const outcomes = buildLiveOutcomes();
  const report = buildSelfImprovementReport(outcomes);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatImprovementReport(report));
  }

  process.exit(0);
}

main();
