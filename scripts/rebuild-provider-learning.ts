#!/usr/bin/env npx tsx
/**
 * Rebuild Provider Learning Preferences
 *
 * CLI entry point to derive learned provider preferences from
 * current scoreboard metrics. Outputs the learned preferences
 * as JSON to stdout.
 *
 * Usage:
 *   npx tsx scripts/rebuild-provider-learning.ts
 *   npx tsx scripts/rebuild-provider-learning.ts --task-kind blueprint
 *   npx tsx scripts/rebuild-provider-learning.ts --verbose
 */

import { deriveLearnedPreferences, getLearnedPreferences } from "../lib/providers/provider-learning";
import type { ProviderTaskMetric } from "../lib/providers/provider-scoreboard";

// ── Argument Parsing ─────────────────────────────────────────

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const taskKindIdx = args.indexOf("--task-kind");
const filterTaskKind = taskKindIdx !== -1 ? args[taskKindIdx + 1] : null;

// ── Main ─────────────────────────────────────────────────────

async function main() {
  // In production, metrics would come from the scoreboard API.
  // For CLI usage, read from stdin or use sample data.
  let metrics: ProviderTaskMetric[];

  if (!process.stdin.isTTY) {
    // Read metrics from stdin (piped JSON)
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    metrics = JSON.parse(raw) as ProviderTaskMetric[];
  } else {
    console.error(
      "Usage: echo '<metrics-json>' | npx tsx scripts/rebuild-provider-learning.ts [--task-kind <kind>] [--verbose]"
    );
    console.error("  Pipe scoreboard metrics JSON (ProviderTaskMetric[]) to stdin.");
    process.exit(1);
  }

  if (verbose) {
    console.error(`[rebuild-provider-learning] Input: ${metrics.length} metrics`);
  }

  const preferences = deriveLearnedPreferences(metrics);

  if (verbose) {
    console.error(
      `[rebuild-provider-learning] Derived ${preferences.preferences.length} preferences from ${preferences.inputMetricCount} metrics`
    );
  }

  // Filter by taskKind if specified
  if (filterTaskKind) {
    const filtered = getLearnedPreferences(preferences, filterTaskKind as never);
    if (verbose) {
      console.error(
        `[rebuild-provider-learning] Filtered to ${filtered.length} preferences for taskKind=${filterTaskKind}`
      );
    }
    console.log(JSON.stringify({ ...preferences, preferences: filtered }, null, 2));
  } else {
    console.log(JSON.stringify(preferences, null, 2));
  }
}

main().catch((err) => {
  console.error("[rebuild-provider-learning] Error:", err);
  process.exit(1);
});
