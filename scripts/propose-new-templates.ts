#!/usr/bin/env npx tsx
/**
 * Propose New Templates
 *
 * CLI entry point for the Template Evolution Engine.
 * Analyzes the current catalog and proposes new template opportunities.
 *
 * Usage:
 *   npx tsx scripts/propose-new-templates.ts
 *   npx tsx scripts/propose-new-templates.ts --json
 *   npx tsx scripts/propose-new-templates.ts --top 3
 */

import {
  buildEvolutionReport,
  formatEvolutionReport,
} from "../lib/factory/template-evolution-engine";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const topIdx = args.indexOf("--top");
const topN = topIdx !== -1 ? parseInt(args[topIdx + 1], 10) : undefined;

const report = buildEvolutionReport(undefined, { greenTemplateCount: 5 });

if (topN != null && topN > 0) {
  report.proposals = report.proposals.slice(0, topN);
}

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(formatEvolutionReport(report));
}
