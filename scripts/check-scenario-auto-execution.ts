#!/usr/bin/env node

/**
 * CLI: Check Scenario Auto-Execution Guardrails
 *
 * Usage:
 *   npx ts-node scripts/check-scenario-auto-execution.ts [options]
 *
 * Options:
 *   --scenario <id>    Check specific scenario
 *   --actor <role>     Actor role (admin, owner, reviewer, viewer) - default: admin
 *   --format json      Output as JSON
 *   --help             Show this help message
 */

import {
  evaluateScenarioAutoExecutionGuardrails,
  evaluateAllScenarioAutoExecutionGuardrails,
  buildScenarioAutoExecutionGuardrailReport,
  formatGuardrailReport,
} from "../lib/factory/scenario-auto-execution-guardrails";
import {
  resolveActorRole,
  type FactoryRole,
} from "../lib/factory/team-role-approval";

// Parse CLI args
function parseArgs(): {
  scenario?: string;
  role: FactoryRole;
  format: "text" | "json";
  help: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    scenario: undefined as string | undefined,
    role: "admin" as FactoryRole,
    format: "text" as "text" | "json",
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--scenario" && i + 1 < args.length) {
      result.scenario = args[++i];
    } else if (arg === "--actor" && i + 1 < args.length) {
      const val = args[++i];
      if (val === "admin" || val === "owner" || val === "reviewer" || val === "viewer") {
        result.role = val;
      }
    } else if (arg === "--format" && i + 1 < args.length) {
      const val = args[++i];
      if (val === "json" || val === "text") {
        result.format = val;
      }
    } else if (arg === "--help") {
      result.help = true;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Scenario Auto-Execution Guardrails Check

Usage:
  npx ts-node scripts/check-scenario-auto-execution.ts [options]

Options:
  --scenario <id>    Check specific scenario by ID
  --actor <role>     Actor role: admin, owner, reviewer, viewer (default: admin)
  --format json      Output as JSON instead of formatted text
  --help             Show this help message

Examples:
  # Check all scenarios with admin role
  npx ts-node scripts/check-scenario-auto-execution.ts

  # Check specific scenario
  npx ts-node scripts/check-scenario-auto-execution.ts --scenario scenario-1 --actor owner

  # Output as JSON
  npx ts-node scripts/check-scenario-auto-execution.ts --format json
`);
}

async function main(): Promise<void> {
  const opts = parseArgs();

  if (opts.help) {
    showHelp();
    return;
  }

  const actor = resolveActorRole(`${opts.role}-cli`, opts.role);

  if (opts.scenario) {
    // Check single scenario
    const decision = evaluateScenarioAutoExecutionGuardrails(opts.scenario, actor);

    if (opts.format === "json") {
      console.log(JSON.stringify(decision, null, 2));
    } else {
      console.log(`\nScenario: ${decision.scenarioId}`);
      console.log(`Mode: ${decision.executionMode}`);
      console.log(`Allowed: ${decision.allowed} | Blocked: ${decision.blocked}`);
      console.log(`Evaluated: ${decision.evaluatedAt}`);
      console.log("\nReasons:");
      for (const reason of decision.reasons) {
        console.log(`  - ${reason}`);
      }
    }
  } else {
    // Check all scenarios and generate report
    const report = buildScenarioAutoExecutionGuardrailReport(actor);

    if (opts.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("");
      console.log(formatGuardrailReport(report));
    }
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
