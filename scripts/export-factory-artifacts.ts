#!/usr/bin/env tsx
/**
 * CLI: Factory Export
 *
 * Usage:
 *   npx tsx scripts/export-factory-artifacts.ts --target marketplace --format json
 *   npx tsx scripts/export-factory-artifacts.ts --target ranking --format csv
 *   npx tsx scripts/export-factory-artifacts.ts --target kpis --format json --category portfolio
 *   npx tsx scripts/export-factory-artifacts.ts --target scenarios --format json --type expand
 *   npx tsx scripts/export-factory-artifacts.ts --target releases --format csv --stage prod
 *   npx tsx scripts/export-factory-artifacts.ts --manifest
 */

import {
  executeExport,
  buildExportManifest,
  formatExportManifest,
  type ExportTarget,
  type ExportFormat,
  type ExportFilters,
} from "../lib/factory/external-export-layer";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const VALID_TARGETS: ExportTarget[] = [
  "marketplace", "releases", "ranking", "recommendations",
  "portfolio", "scenarios", "kpis",
];

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/export-factory-artifacts.ts [options]

Options:
  --target <target>       Export target: ${VALID_TARGETS.join(", ")}
  --format <format>       Output format: json, csv (default: json)
  --domain <domain>       Filter by domain
  --category <category>   Filter by KPI category
  --type <type>           Filter by scenario type
  --stage <stage>         Filter by release stage
  --healthState <state>   Filter by health state
  --recommendationType <type>  Filter by recommendation type
  --manifest              Show export manifest
  --help                  Show this help

Examples:
  npx tsx scripts/export-factory-artifacts.ts --target marketplace --format json
  npx tsx scripts/export-factory-artifacts.ts --target ranking --format csv
  npx tsx scripts/export-factory-artifacts.ts --target kpis --format json --category portfolio
  npx tsx scripts/export-factory-artifacts.ts --target scenarios --format json --type expand
  npx tsx scripts/export-factory-artifacts.ts --target releases --format csv --stage prod
  npx tsx scripts/export-factory-artifacts.ts --manifest
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  if (args.includes("--manifest")) {
    const manifest = buildExportManifest();
    console.log(formatExportManifest(manifest));
    return;
  }

  let target: string | undefined;
  let format: string = "json";
  const filters: ExportFilters = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--target":
        target = args[++i];
        break;
      case "--format":
        format = args[++i];
        break;
      case "--domain":
        filters.domain = args[++i];
        break;
      case "--category":
        filters.category = args[++i];
        break;
      case "--type":
        filters.scenarioType = args[++i];
        break;
      case "--stage":
        filters.stage = args[++i];
        break;
      case "--healthState":
        filters.healthState = args[++i];
        break;
      case "--recommendationType":
        filters.recommendationType = args[++i];
        break;
    }
  }

  if (!target) {
    console.error("Error: --target is required");
    printUsage();
    process.exit(1);
  }

  if (!VALID_TARGETS.includes(target as ExportTarget)) {
    console.error(`Error: invalid target "${target}". Valid targets: ${VALID_TARGETS.join(", ")}`);
    process.exit(1);
  }

  if (format !== "json" && format !== "csv") {
    console.error(`Error: invalid format "${format}". Valid formats: json, csv`);
    process.exit(1);
  }

  const result = executeExport({
    target: target as ExportTarget,
    format: format as ExportFormat,
    filters,
  });

  if (result.csv !== undefined) {
    console.log(result.csv);
  } else if (result.json) {
    console.log(JSON.stringify(result.json, null, 2));
  }
}

main();
