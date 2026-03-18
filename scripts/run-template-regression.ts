#!/usr/bin/env npx tsx
/**
 * Unified Template Regression CLI
 *
 * Usage:
 *   npx tsx scripts/run-template-regression.ts --template reservation_saas
 *   npx tsx scripts/run-template-regression.ts --all-green
 *   npx tsx scripts/run-template-regression.ts --templates reservation_saas,simple_crm_saas
 *
 * Options:
 *   --template <key>      Run regression for a single template
 *   --templates <keys>    Run regression for comma-separated template list
 *   --all-green           Run regression for all GREEN templates
 *   --base-url <url>      Base URL (default: http://localhost:3000)
 *   --poll-interval <ms>  Poll interval in ms (default: 10000)
 *   --max-polls <n>       Max poll attempts (default: 60)
 *   --dry-run             Show resolved templates without running
 */

import {
  runAllGreenRegressions,
  runSingleTemplateRegression,
  runSelectedTemplateRegressions,
  formatSingleResult,
} from "../lib/regression/template-regression-runner";
import {
  resolveGreenTemplatesForRegression,
  resolveTemplatesForRegression,
} from "../lib/regression/template-regression-config";

async function main() {
  const args = process.argv.slice(2);

  const baseUrl = getArg(args, "--base-url") ?? process.env.BASE_URL ?? "http://localhost:3000";
  const pollInterval = parseInt(getArg(args, "--poll-interval") ?? "10000", 10);
  const maxPolls = parseInt(getArg(args, "--max-polls") ?? "60", 10);
  const dryRun = args.includes("--dry-run");

  const opts = { baseUrl, pollIntervalMs: pollInterval, maxPolls };

  // Resolve mode
  const singleTemplate = getArg(args, "--template");
  const templateList = getArg(args, "--templates");
  const allGreen = args.includes("--all-green");

  if (!singleTemplate && !templateList && !allGreen) {
    console.error("Usage:");
    console.error("  npx tsx scripts/run-template-regression.ts --template <key>");
    console.error("  npx tsx scripts/run-template-regression.ts --templates <key1,key2>");
    console.error("  npx tsx scripts/run-template-regression.ts --all-green");
    process.exit(1);
  }

  // Dry run: show resolved templates
  if (dryRun) {
    const templates = allGreen
      ? resolveGreenTemplatesForRegression()
      : singleTemplate
        ? resolveTemplatesForRegression([singleTemplate])
        : resolveTemplatesForRegression(templateList!.split(","));

    console.log("=== DRY RUN: Resolved Templates ===");
    for (const t of templates) {
      console.log(`  ${t.shortName}  ${t.templateKey}`);
      console.log(`    quality: ${t.config.qualityGates}  baseline: ${t.config.baselineCompare}  smoke: ${t.config.templateSmoke}  runtime: ${t.config.runtimeVerification}`);
    }
    console.log(`\nTotal: ${templates.length} templates`);
    process.exit(0);
  }

  // Run regressions
  console.log("=== UNIFIED TEMPLATE REGRESSION ===");
  console.log(`Base URL: ${baseUrl}`);
  console.log("");

  try {
    const batch = singleTemplate
      ? await runSingleTemplateRegression(singleTemplate, opts)
      : templateList
        ? await runSelectedTemplateRegressions(templateList.split(","), opts)
        : await runAllGreenRegressions(opts);

    // Print per-template results
    for (const result of batch.results) {
      console.log(formatSingleResult(result));
      console.log("");
    }

    // Print consolidated report
    console.log(batch.formattedReport);

    // Exit with failure code if any template failed
    const failCount = batch.report.summary.failCount;
    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Regression failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

main();
