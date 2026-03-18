#!/usr/bin/env tsx
/**
 * CLI: Scenario Execution Governance
 *
 * Usage:
 *   npx tsx scripts/govern-scenario-execution.ts evaluate
 *   npx tsx scripts/govern-scenario-execution.ts evaluate --scenario expand_reservation_3
 *   npx tsx scripts/govern-scenario-execution.ts approve --scenario expand_reservation_3 --role admin --actor admin-1
 *   npx tsx scripts/govern-scenario-execution.ts defer --scenario expand_reservation_3 --role reviewer --actor reviewer-1
 *   npx tsx scripts/govern-scenario-execution.ts reject --scenario gap_fill_support --role admin --actor admin-1
 *   npx tsx scripts/govern-scenario-execution.ts history
 *   npx tsx scripts/govern-scenario-execution.ts evaluate --json
 */

import {
  evaluateScenarioExecutionGovernance,
  evaluateAllScenarioGovernance,
  recordScenarioExecutionDecision,
  listScenarioExecutionGovernanceHistory,
  buildScenarioExecutionGovernanceReport,
  formatGovernanceEvaluation,
  formatGovernanceReport,
  useInMemoryStore,
} from "../lib/factory/scenario-execution-governance";
import { resolveActorRole, type FactoryRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/govern-scenario-execution.ts <command> [options]

Commands:
  evaluate                        Evaluate governance for all or one scenario
  approve                         Approve scenario for execution
  defer                           Defer scenario execution
  reject                          Reject/block scenario execution
  history                         Show governance history

Options:
  --scenario <id>                 Scenario ID
  --role <role>                   Actor role: owner, admin, reviewer, operator, viewer
  --actor <id>                    Actor ID
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/govern-scenario-execution.ts evaluate
  npx tsx scripts/govern-scenario-execution.ts evaluate --scenario expand_reservation_3
  npx tsx scripts/govern-scenario-execution.ts approve --scenario expand_reservation_3 --role admin --actor admin-1
  npx tsx scripts/govern-scenario-execution.ts defer --scenario expand_reservation_3 --role reviewer --actor reviewer-1
  npx tsx scripts/govern-scenario-execution.ts reject --scenario gap_fill_support --role admin --actor admin-1
  npx tsx scripts/govern-scenario-execution.ts history
  npx tsx scripts/govern-scenario-execution.ts evaluate --json
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  // Enable in-memory store for CLI session
  useInMemoryStore();

  const command = args[0];
  const json = args.includes("--json");

  let scenarioId: string | undefined;
  let role: string = "admin";
  let actorId: string = "cli-user";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--scenario":
        scenarioId = args[++i];
        break;
      case "--role":
        role = args[++i];
        break;
      case "--actor":
        actorId = args[++i];
        break;
    }
  }

  switch (command) {
    case "evaluate": {
      if (scenarioId) {
        const eval_ = evaluateScenarioExecutionGovernance(scenarioId);
        if (json) {
          console.log(JSON.stringify(eval_, null, 2));
        } else {
          console.log(formatGovernanceEvaluation(eval_));
        }
      } else {
        const report = buildScenarioExecutionGovernanceReport();
        if (json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(formatGovernanceReport(report));
        }
      }
      break;
    }

    case "approve":
    case "defer":
    case "reject": {
      if (!scenarioId) {
        console.error("Error: --scenario is required");
        process.exit(1);
      }

      const actionMap: Record<string, "approve_execution" | "defer_execution" | "reject_execution"> = {
        approve: "approve_execution",
        defer: "defer_execution",
        reject: "reject_execution",
      };

      const actor = resolveActorRole(actorId, role as FactoryRole);
      const decision = recordScenarioExecutionDecision(scenarioId, actionMap[command], actor);

      if (!decision) {
        console.error(`Error: ${actor.role} is not authorized to ${command} execution`);
        process.exit(1);
      }

      if (json) {
        console.log(JSON.stringify(decision, null, 2));
      } else {
        console.log(`${command.toUpperCase()}: ${scenarioId}`);
        console.log(`  Decision ID: ${decision.decisionId}`);
        console.log(`  Actor: ${decision.actor.actorId} (${decision.actor.role})`);
        console.log(`  Timestamp: ${decision.timestamp}`);
      }
      break;
    }

    case "history": {
      const history = listScenarioExecutionGovernanceHistory();
      if (json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        console.log("=== Governance History ===");
        console.log(`Evaluations: ${history.evaluations.length}`);
        console.log(`Decisions: ${history.decisions.length}`);
        console.log("");
        for (const d of history.decisions) {
          console.log(`  ${d.action} — ${d.scenarioId} by ${d.actor.actorId} (${d.actor.role}) at ${d.timestamp}`);
        }
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
