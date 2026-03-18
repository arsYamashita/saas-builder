#!/usr/bin/env tsx
/**
 * CLI: Scenario Execution Bridge
 *
 * Usage:
 *   npx tsx scripts/run-scenario-execution.ts list
 *   npx tsx scripts/run-scenario-execution.ts preview --scenario <id>
 *   npx tsx scripts/run-scenario-execution.ts run --scenario <id> --role admin --actor admin-1
 *   npx tsx scripts/run-scenario-execution.ts preview --json
 */

import {
  findScenarioById,
  listAvailableScenarios,
  buildScenarioExecutionPlan,
  validateScenarioExecution,
  previewScenarioExecution,
  applyScenarioExecution,
  formatExecutionPlan,
  formatExecutionResult,
} from "../lib/factory/scenario-execution-bridge";
import { resolveActorRole, type FactoryRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/run-scenario-execution.ts <command> [options]

Commands:
  list                            List available scenarios
  preview                         Preview scenario execution (dry run)
  run                             Execute scenario

Options:
  --scenario <id>                 Scenario ID
  --role <role>                   Actor role: owner, admin, reviewer, operator, viewer
  --actor <id>                    Actor ID
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/run-scenario-execution.ts list
  npx tsx scripts/run-scenario-execution.ts preview --scenario expand-commerce-3
  npx tsx scripts/run-scenario-execution.ts run --scenario expand-commerce-3 --role admin --actor admin-1
  npx tsx scripts/run-scenario-execution.ts preview --json
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

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
    case "list": {
      const scenarios = listAvailableScenarios();
      if (json) {
        console.log(JSON.stringify(scenarios, null, 2));
      } else {
        console.log("Available Scenarios:\n");
        if (scenarios.length === 0) {
          console.log("  (none)");
        } else {
          for (const s of scenarios) {
            console.log(`  ${s.scenarioId} — ${s.type} (${s.domain}) priority=${s.priorityScore.toFixed(2)} steps=${s.stepCount}`);
          }
        }
      }
      break;
    }

    case "preview": {
      if (!scenarioId) {
        // Preview all
        const scenarios = listAvailableScenarios();
        const actor = resolveActorRole(actorId, role as FactoryRole);
        const results = [];
        for (const s of scenarios) {
          const scenario = findScenarioById(s.scenarioId);
          if (scenario) {
            const result = previewScenarioExecution(scenario, actor);
            results.push(result);
          }
        }
        if (json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          for (const r of results) {
            console.log(formatExecutionResult(r));
            console.log();
          }
        }
        break;
      }

      const scenario = findScenarioById(scenarioId);
      if (!scenario) {
        console.error(`Scenario not found: ${scenarioId}`);
        const available = listAvailableScenarios();
        console.error(`Available: ${available.map((s) => s.scenarioId).join(", ")}`);
        process.exit(1);
      }

      const actor = resolveActorRole(actorId, role as FactoryRole);
      const result = previewScenarioExecution(scenario, actor);

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const plan = buildScenarioExecutionPlan(scenario, actor);
        console.log(formatExecutionPlan(plan));
        console.log();
        console.log(formatExecutionResult(result));
      }
      break;
    }

    case "run": {
      if (!scenarioId) {
        console.error("Error: --scenario is required for run command");
        process.exit(1);
      }

      const scenario = findScenarioById(scenarioId);
      if (!scenario) {
        console.error(`Scenario not found: ${scenarioId}`);
        const available = listAvailableScenarios();
        console.error(`Available: ${available.map((s) => s.scenarioId).join(", ")}`);
        process.exit(1);
      }

      const actor = resolveActorRole(actorId, role as FactoryRole);

      // Validate first
      const eligibility = validateScenarioExecution(scenario, actor);
      if (!eligibility.allowed) {
        console.error("Execution blocked:");
        for (const reason of eligibility.blockedReasons) {
          console.error(`  - ${reason}`);
        }
        process.exit(1);
      }

      const result = applyScenarioExecution(scenario, actor);

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatExecutionResult(result));
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
