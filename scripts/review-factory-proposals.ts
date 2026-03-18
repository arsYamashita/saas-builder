#!/usr/bin/env tsx
/**
 * CLI: Review factory improvement proposals.
 *
 * Usage:
 *   npx tsx scripts/review-factory-proposals.ts list
 *   npx tsx scripts/review-factory-proposals.ts list --json
 *   npx tsx scripts/review-factory-proposals.ts approve <proposalId> [--notes "reason"]
 *   npx tsx scripts/review-factory-proposals.ts reject <proposalId> [--notes "reason"]
 *   npx tsx scripts/review-factory-proposals.ts defer <proposalId> [--notes "reason"]
 *   npx tsx scripts/review-factory-proposals.ts collect
 */

import {
  collectPendingProposals,
  submitApprovalDecision,
  buildApprovalReport,
  formatApprovalReport,
  type ApprovalDecision,
} from "../lib/factory/human-approval-workflow";
import {
  buildSelfImprovementReport,
  type FactoryOutcomes,
} from "../lib/factory/self-improving-factory";
import {
  evaluateAllTemplateHealth,
  type TemplateHealthSignals,
} from "../lib/factory/template-health-governance";
import { TEMPLATE_CATALOG } from "../lib/templates/template-catalog";
import { listRoutes } from "../lib/providers/task-router";

// ---------------------------------------------------------------------------
// Outcome builder (same pattern as propose-factory-improvements.ts)
// ---------------------------------------------------------------------------

function buildLiveOutcomes(): FactoryOutcomes {
  const routes = listRoutes();

  const routingOutcomes = routes.map((r) => ({
    taskKind: r.taskKind,
    provider: r.primary,
    baseScore: 0.7,
    recentScore: null as number | null,
    status: "pass" as const,
    fallbackUsed: false,
  }));

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

  return {
    routingOutcomes,
    costGuardrailOutcomes: [],
    learningOutcomes: [],
    governanceOutcomes: governanceBatch.results.map((r) => ({
      templateKey: r.templateKey,
      currentState: r.currentState,
      decision: r.decision,
      consecutiveAtRiskOrDegraded: 0,
    })),
    autopilotOutcomes: [],
    currentMode: "balanced",
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList(json: boolean): void {
  const report = buildApprovalReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatApprovalReport(report));
  }
}

function cmdCollect(json: boolean): void {
  const report = buildSelfImprovementReport(buildLiveOutcomes());
  const proposals = collectPendingProposals(report.proposals);
  if (json) {
    console.log(JSON.stringify(proposals, null, 2));
  } else {
    console.log(`Collected ${proposals.length} proposal(s).`);
    for (const p of proposals) {
      console.log(`  - ${p.id} (${p.subsystem}) ${p.title}`);
    }
  }
}

function cmdDecision(
  decision: ApprovalDecision,
  proposalId: string,
  notes: string,
  json: boolean,
): void {
  const record = submitApprovalDecision(proposalId, decision, "user", notes);
  if (!record) {
    console.error(
      `Error: proposal "${proposalId}" not found. Run "collect" first.`,
    );
    process.exit(1);
  }
  if (json) {
    console.log(JSON.stringify(record, null, 2));
  } else {
    console.log(
      `${decision.toUpperCase()}: ${proposalId} (${record.timestamp})`,
    );
    if (notes) console.log(`  notes: ${notes}`);
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/review-factory-proposals.ts <command> [options]

Commands:
  list                         List all proposals and their status
  collect                      Collect proposals from Self-Improving Factory
  approve <proposalId>         Approve a proposal
  reject <proposalId>          Reject a proposal
  defer <proposalId>           Defer a proposal

Options:
  --notes "reason"             Add notes to approval decision
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/review-factory-proposals.ts collect
  npx tsx scripts/review-factory-proposals.ts list
  npx tsx scripts/review-factory-proposals.ts approve routing-weight-adjustment-schema --notes "simulation OK"
  npx tsx scripts/review-factory-proposals.ts reject cost-step-budget --notes "too risky"
  npx tsx scripts/review-factory-proposals.ts defer governance-cadence-increase
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0]!;
  let json = args.includes("--json");
  let notes = "";

  const notesIdx = args.indexOf("--notes");
  if (notesIdx !== -1 && args[notesIdx + 1]) {
    notes = args[notesIdx + 1]!;
  }

  switch (command) {
    case "list":
      cmdList(json);
      break;
    case "collect":
      cmdCollect(json);
      break;
    case "approve":
    case "reject":
    case "defer": {
      const proposalId = args[1];
      if (!proposalId || proposalId.startsWith("--")) {
        console.error(`Error: ${command} requires a proposal ID.`);
        process.exit(1);
      }
      cmdDecision(command as ApprovalDecision, proposalId, notes, json);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
