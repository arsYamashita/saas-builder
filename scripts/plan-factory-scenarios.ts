#!/usr/bin/env tsx
/**
 * CLI: Factory Scenario Planner
 *
 * Usage:
 *   npx tsx scripts/plan-factory-scenarios.ts
 *   npx tsx scripts/plan-factory-scenarios.ts --type expand
 *   npx tsx scripts/plan-factory-scenarios.ts --type gap
 *   npx tsx scripts/plan-factory-scenarios.ts --type stabilize
 *   npx tsx scripts/plan-factory-scenarios.ts --top 5
 *   npx tsx scripts/plan-factory-scenarios.ts --json
 */

import {
  generateExpansionScenarios,
  generateGapFillScenarios,
  generateStabilizationScenarios,
  buildScenarioReport,
  formatScenario,
  formatScenarioReport,
} from "../lib/factory/factory-scenario-planner";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/plan-factory-scenarios.ts [options]

Options:
  --type <type>           Scenario type: expand, gap, stabilize
  --top <n>               Show top N scenarios by priority
  --json                  Output as JSON
  --help                  Show this help

Examples:
  npx tsx scripts/plan-factory-scenarios.ts
  npx tsx scripts/plan-factory-scenarios.ts --type expand
  npx tsx scripts/plan-factory-scenarios.ts --type gap
  npx tsx scripts/plan-factory-scenarios.ts --type stabilize
  npx tsx scripts/plan-factory-scenarios.ts --top 5
  npx tsx scripts/plan-factory-scenarios.ts --json
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const json = args.includes("--json");

  let type: string | undefined;
  let top: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--type":
        type = args[++i];
        break;
      case "--top": {
        const val = args[++i];
        if (val) top = parseInt(val, 10);
        break;
      }
    }
  }

  // Specific type
  if (type) {
    let scenarios;
    let title: string;
    switch (type) {
      case "expand":
        scenarios = generateExpansionScenarios();
        title = "EXPANSION SCENARIOS";
        break;
      case "gap":
        scenarios = generateGapFillScenarios();
        title = "GAP FILL SCENARIOS";
        break;
      case "stabilize":
        scenarios = generateStabilizationScenarios();
        title = "STABILIZATION SCENARIOS";
        break;
      default:
        console.error("Error: --type must be one of: expand, gap, stabilize");
        process.exit(1);
    }

    if (top !== undefined) {
      scenarios = scenarios.slice(0, top);
    }

    if (json) {
      console.log(JSON.stringify(scenarios, null, 2));
    } else {
      if (scenarios.length === 0) {
        console.log(`${title}: 該当なし`);
      } else {
        console.log(`${title}\n`);
        for (const sc of scenarios) {
          console.log(formatScenario(sc));
          console.log();
        }
      }
    }
    return;
  }

  // Full report (default)
  const report = buildScenarioReport();

  if (top !== undefined) {
    const all = [
      ...report.expansionScenarios,
      ...report.gapFillScenarios,
      ...report.stabilizationScenarios,
    ];
    all.sort((a, b) => b.priorityScore - a.priorityScore);
    const topScenarios = all.slice(0, top);

    if (json) {
      console.log(JSON.stringify(topScenarios, null, 2));
    } else {
      console.log(`TOP ${top} SCENARIOS:\n`);
      for (const sc of topScenarios) {
        console.log(formatScenario(sc));
        console.log();
      }
    }
    return;
  }

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatScenarioReport(report));
  }
}

main();
