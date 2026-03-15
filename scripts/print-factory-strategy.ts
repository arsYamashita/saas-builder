#!/usr/bin/env npx tsx
/**
 * Print Factory Intelligence Strategy
 *
 * CLI entry point to resolve and display the Factory Intelligence
 * execution strategy for a given mode and optional configuration.
 *
 * Usage:
 *   npx tsx scripts/print-factory-strategy.ts
 *   npx tsx scripts/print-factory-strategy.ts --mode safe
 *   npx tsx scripts/print-factory-strategy.ts --mode aggressive --budget 1.0
 *   npx tsx scripts/print-factory-strategy.ts --compare baseline aggressive
 */

import {
  resolveFactoryStrategy,
  MODE_CONSTANTS,
  DEFAULT_MODE,
  type FactoryIntelligenceMode,
  type FactoryExecutionStrategy,
} from "../lib/factory/factory-intelligence-control-plane";

// ── Argument Parsing ─────────────────────────────────────────

const args = process.argv.slice(2);
const VALID_MODES: FactoryIntelligenceMode[] = ["baseline", "balanced", "aggressive", "safe"];

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const isCompare = args.includes("--compare");

// ── Helpers ──────────────────────────────────────────────────

function printStrategy(strategy: FactoryExecutionStrategy): void {
  console.log(JSON.stringify(strategy, null, 2));
}

function printCompactRow(label: string, value: unknown): void {
  const v = typeof value === "boolean"
    ? (value ? "YES" : "no")
    : String(value);
  console.log(`  ${label.padEnd(36)} ${v}`);
}

function printStrategyTable(strategy: FactoryExecutionStrategy): void {
  console.log(`\n── Mode: ${strategy.mode.toUpperCase()} ──`);
  printCompactRow("routingEnabled", strategy.routingEnabled);
  printCompactRow("adaptiveRoutingEnabled", strategy.adaptiveRoutingEnabled);
  printCompactRow("learningEnabled", strategy.learningEnabled);
  printCompactRow("learningMaxInfluence", strategy.learningMaxInfluence);
  printCompactRow("costGuardrailEnabled", strategy.costGuardrailEnabled);
  printCompactRow("fallbackStrictness", strategy.fallbackStrictness);
  printCompactRow("riskTolerance", strategy.riskTolerance);
  printCompactRow("minConfidenceForLearningBoost", strategy.minConfidenceForLearningBoost);
  printCompactRow("regressionDegradationPenalty", strategy.regressionDegradationPenalty);
  printCompactRow("budgetProvided", strategy.budgetProvided);
  printCompactRow("regressionSignalsAvailable", strategy.regressionSignalsAvailable);
}

// ── Main ─────────────────────────────────────────────────────

function main(): void {
  if (isCompare) {
    // Compare two or more modes
    const compareIdx = args.indexOf("--compare");
    const modes = args.slice(compareIdx + 1).filter((m) =>
      VALID_MODES.includes(m as FactoryIntelligenceMode)
    ) as FactoryIntelligenceMode[];

    if (modes.length < 2) {
      console.error("Usage: --compare <mode1> <mode2> [mode3] ...");
      console.error(`Valid modes: ${VALID_MODES.join(", ")}`);
      process.exit(1);
    }

    const budgetStr = getArg("--budget");
    const budgetContext = budgetStr
      ? { maxCostPerRun: parseFloat(budgetStr) }
      : undefined;

    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║  Factory Intelligence — Strategy Comparison     ║");
    console.log("╚══════════════════════════════════════════════════╝");
    if (budgetContext) {
      console.log(`  Budget: $${budgetContext.maxCostPerRun}`);
    }

    for (const mode of modes) {
      const strategy = resolveFactoryStrategy({ mode, budgetContext });
      printStrategyTable(strategy);
    }
    return;
  }

  // Single mode
  const modeStr = getArg("--mode") ?? DEFAULT_MODE;
  if (!VALID_MODES.includes(modeStr as FactoryIntelligenceMode)) {
    console.error(`Invalid mode: ${modeStr}`);
    console.error(`Valid modes: ${VALID_MODES.join(", ")}`);
    process.exit(1);
  }
  const mode = modeStr as FactoryIntelligenceMode;

  const budgetStr = getArg("--budget");
  const budgetContext = budgetStr
    ? { maxCostPerRun: parseFloat(budgetStr) }
    : undefined;

  const strategy = resolveFactoryStrategy({
    mode,
    budgetContext,
  });

  if (args.includes("--json")) {
    printStrategy(strategy);
  } else {
    console.log("╔══════════════════════════════════════════════════╗");
    console.log("║  Factory Intelligence — Resolved Strategy       ║");
    console.log("╚══════════════════════════════════════════════════╝");
    printStrategyTable(strategy);
    console.log("");
  }
}

main();
