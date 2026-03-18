#!/usr/bin/env tsx
/**
 * CLI: simulate a hypothetical factory policy change.
 *
 * Usage:
 *   npx tsx scripts/simulate-factory-policy.ts \
 *     --subsystem provider_routing \
 *     --key recent_score_weight \
 *     --current 0.3 \
 *     --proposed 0.5 \
 *     --task schema
 *
 *   npx tsx scripts/simulate-factory-policy.ts \
 *     --subsystem cost_guardrail \
 *     --key max_cost_per_step \
 *     --current 0.05 \
 *     --proposed 0.065 \
 *     --task schema \
 *     --json
 */

import {
  buildSimulationReport,
  formatSimulationReport,
  type SimulationSubsystem,
  type PolicySimulationRequest,
} from "../lib/factory/policy-simulation-sandbox";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const VALID_SUBSYSTEMS: SimulationSubsystem[] = [
  "provider_routing",
  "provider_learning",
  "cost_guardrail",
  "control_plane",
  "governance",
  "regression",
];

function parseArgs(argv: string[]): {
  request: PolicySimulationRequest;
  json: boolean;
} {
  const args = argv.slice(2);
  let subsystem: string | undefined;
  let key: string | undefined;
  let current: string | undefined;
  let proposed: string | undefined;
  let task: string | undefined;
  let template: string | undefined;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--subsystem":
        subsystem = args[++i];
        break;
      case "--key":
        key = args[++i];
        break;
      case "--current":
        current = args[++i];
        break;
      case "--proposed":
        proposed = args[++i];
        break;
      case "--task":
        task = args[++i];
        break;
      case "--template":
        template = args[++i];
        break;
      case "--json":
        json = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!subsystem || !key || !current || !proposed) {
    console.error(
      "Error: --subsystem, --key, --current, and --proposed are required.",
    );
    printUsage();
    process.exit(1);
  }

  if (!VALID_SUBSYSTEMS.includes(subsystem as SimulationSubsystem)) {
    console.error(
      `Error: invalid subsystem "${subsystem}". Valid: ${VALID_SUBSYSTEMS.join(", ")}`,
    );
    process.exit(1);
  }

  const currentVal = parseFloat(current);
  const proposedVal = parseFloat(proposed);
  if (isNaN(currentVal) || isNaN(proposedVal)) {
    console.error("Error: --current and --proposed must be numeric.");
    process.exit(1);
  }

  const scope: PolicySimulationRequest["scope"] = {};
  if (task) scope.taskKind = task;
  if (template) scope.templateKey = template;

  return {
    request: {
      subsystem: subsystem as SimulationSubsystem,
      policyKey: key,
      currentValue: currentVal,
      proposedValue: proposedVal,
      scope: Object.keys(scope).length > 0 ? scope : undefined,
    },
    json,
  };
}

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/simulate-factory-policy.ts [options]

Required:
  --subsystem <name>   Subsystem to simulate (${VALID_SUBSYSTEMS.join(", ")})
  --key <name>         Policy key to change
  --current <number>   Current policy value
  --proposed <number>  Proposed policy value

Optional:
  --task <taskKind>    Scope to a specific task kind
  --template <key>     Scope to a specific template
  --json               Output as JSON
  --help               Show this help

Examples:
  npx tsx scripts/simulate-factory-policy.ts \\
    --subsystem provider_routing --key recent_score_weight \\
    --current 0.3 --proposed 0.5 --task schema

  npx tsx scripts/simulate-factory-policy.ts \\
    --subsystem cost_guardrail --key max_cost_per_step \\
    --current 0.05 --proposed 0.065 --task schema --json
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { request, json } = parseArgs(process.argv);
  const report = buildSimulationReport(request);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSimulationReport(report));
  }
}

main();
