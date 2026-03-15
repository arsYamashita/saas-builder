#!/usr/bin/env npx tsx
/**
 * Run Template Autopilot
 *
 * CLI entry point for Template Autopilot v1.
 * Selects high-confidence proposals and evaluates them through the pipeline.
 *
 * Usage:
 *   npx tsx scripts/run-template-autopilot.ts
 *   npx tsx scripts/run-template-autopilot.ts --dry-run
 *   npx tsx scripts/run-template-autopilot.ts --threshold 0.8 --max 2
 *   npx tsx scripts/run-template-autopilot.ts --json
 */

import {
  runAutopilot,
  formatAutopilotReport,
  buildAutopilotLog,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_CONCURRENT,
} from "../lib/factory/template-autopilot";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const dryRun = args.includes("--dry-run");

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const threshold = parseFloat(getArg("--threshold") ?? String(DEFAULT_CONFIDENCE_THRESHOLD));
const maxConcurrent = parseInt(getArg("--max") ?? String(DEFAULT_MAX_CONCURRENT), 10);

const result = runAutopilot({
  config: {
    confidenceThreshold: threshold,
    maxConcurrent,
    dryRun,
  },
  evolutionContext: { greenTemplateCount: 5 },
});

if (jsonMode) {
  console.log(JSON.stringify(buildAutopilotLog(result), null, 2));
} else {
  console.log(formatAutopilotReport(result));
}
