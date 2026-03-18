#!/usr/bin/env tsx
/**
 * CLI: Strategic KPI Report
 *
 * Usage:
 *   npx tsx scripts/report-factory-kpis.ts
 *   npx tsx scripts/report-factory-kpis.ts --json
 *   npx tsx scripts/report-factory-kpis.ts --category portfolio
 *   npx tsx scripts/report-factory-kpis.ts --category quality_stability
 *   npx tsx scripts/report-factory-kpis.ts --domain reservation
 */

import {
  buildStrategicKpiReport,
  formatStrategicKpiReport,
  formatCategorySummary,
  type KpiCategory,
} from "../lib/factory/strategic-kpi-layer";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const VALID_CATEGORIES: KpiCategory[] = [
  "portfolio",
  "quality_stability",
  "marketplace",
  "release_runtime",
  "strategy_scenario",
];

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/report-factory-kpis.ts [options]

Options:
  --category <cat>       Filter by category: ${VALID_CATEGORIES.join(", ")}
  --domain <domain>      Show domain-level rollup for specific domain
  --json                 Output as JSON
  --help                 Show this help

Examples:
  npx tsx scripts/report-factory-kpis.ts
  npx tsx scripts/report-factory-kpis.ts --json
  npx tsx scripts/report-factory-kpis.ts --category portfolio
  npx tsx scripts/report-factory-kpis.ts --category quality_stability
  npx tsx scripts/report-factory-kpis.ts --domain reservation
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const json = args.includes("--json");

  let category: string | undefined;
  let domain: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--category":
        category = args[++i];
        break;
      case "--domain":
        domain = args[++i];
        break;
    }
  }

  const report = buildStrategicKpiReport();

  // Filter by category
  if (category) {
    if (!VALID_CATEGORIES.includes(category as KpiCategory)) {
      console.error(`Error: --category must be one of: ${VALID_CATEGORIES.join(", ")}`);
      process.exit(1);
    }
    const cat = report.categories.find((c) => c.category === category);
    if (!cat) {
      console.error(`Category not found: ${category}`);
      process.exit(1);
    }
    if (json) {
      console.log(JSON.stringify(cat, null, 2));
    } else {
      console.log(formatCategorySummary(cat));
    }
    return;
  }

  // Filter by domain
  if (domain) {
    const rollup = report.domainRollups.find((r) => r.domain === domain);
    if (!rollup) {
      console.error(`Domain not found: ${domain}`);
      console.error(`Available domains: ${report.domainRollups.map((r) => r.domain).join(", ")}`);
      process.exit(1);
    }
    if (json) {
      console.log(JSON.stringify(rollup, null, 2));
    } else {
      console.log(`${rollup.domain} (${rollup.strategy}) [${rollup.overallStatus.toUpperCase()}]`);
      for (const kpi of rollup.kpis) {
        console.log(`  ${kpi.label}: ${kpi.value}${kpi.unit} [${kpi.status.toUpperCase()}]`);
        for (const reason of kpi.reasons) {
          console.log(`    - ${reason}`);
        }
      }
    }
    return;
  }

  // Full report
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatStrategicKpiReport(report));
  }
}

main();
