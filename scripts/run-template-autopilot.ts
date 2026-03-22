#!/usr/bin/env npx tsx
/**
 * Run Template Autopilot
 *
 * CLI entry point for Template Autopilot v1.
 * Selects high-confidence proposals and evaluates them through the pipeline.
 *
 * Usage:
 *   npx tsx scripts/run-template-autopilot.ts                       # simulated (default)
 *   npx tsx scripts/run-template-autopilot.ts --dry-run              # select only, no execution
 *   npx tsx scripts/run-template-autopilot.ts --threshold 0.8 --max 2
 *   npx tsx scripts/run-template-autopilot.ts --json
 *   npx tsx scripts/run-template-autopilot.ts --live                 # real API execution
 *   npx tsx scripts/run-template-autopilot.ts --live --base-url https://staging.example.com
 */

import {
  runAutopilot,
  runAutopilotAsync,
  formatAutopilotReport,
  buildAutopilotLog,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_MAX_CONCURRENT,
} from "../lib/factory/template-autopilot";
import {
  createLivePipelineExecutor,
  createLiveQualityExecutor,
  createLiveBaselineExecutor,
  DEFAULT_LIVE_CONFIG,
} from "../lib/factory/autopilot-live-executor";

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const dryRun = args.includes("--dry-run");
const liveMode = args.includes("--live");

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const threshold = parseFloat(getArg("--threshold") ?? String(DEFAULT_CONFIDENCE_THRESHOLD));
const maxConcurrent = parseInt(getArg("--max") ?? String(DEFAULT_MAX_CONCURRENT), 10);
const baseUrl = getArg("--base-url") ?? DEFAULT_LIVE_CONFIG.baseUrl;

async function main() {
  const configOverride = {
    confidenceThreshold: threshold,
    maxConcurrent,
    dryRun,
  };

  if (liveMode) {
    console.log(`[autopilot] Live mode — base URL: ${baseUrl}`);
    const liveConfig = { ...DEFAULT_LIVE_CONFIG, baseUrl };

    const result = await runAutopilotAsync({
      config: configOverride,
      evolutionContext: { greenTemplateCount: 5 },
      executors: {
        executePipeline: createLivePipelineExecutor(liveConfig),
        executeQualityGates: createLiveQualityExecutor(liveConfig),
        executeBaselineCompare: createLiveBaselineExecutor(liveConfig),
      },
    });

    if (jsonMode) {
      console.log(JSON.stringify(buildAutopilotLog(result), null, 2));
    } else {
      console.log(formatAutopilotReport(result));
    }
  } else {
    // Simulated mode (synchronous)
    const result = runAutopilot({
      config: configOverride,
      evolutionContext: { greenTemplateCount: 5 },
    });

    if (jsonMode) {
      console.log(JSON.stringify(buildAutopilotLog(result), null, 2));
    } else {
      console.log(formatAutopilotReport(result));
    }
  }
}

main().catch((err) => {
  console.error("[autopilot] Fatal error:", err);
  process.exit(1);
});
