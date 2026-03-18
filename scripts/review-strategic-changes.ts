#!/usr/bin/env tsx
/**
 * CLI: Strategic Change Review Board
 *
 * Usage:
 *   npx tsx scripts/review-strategic-changes.ts
 *   npx tsx scripts/review-strategic-changes.ts --json
 *   npx tsx scripts/review-strategic-changes.ts --readiness ready
 *   npx tsx scripts/review-strategic-changes.ts --top 10
 *   npx tsx scripts/review-strategic-changes.ts --domain reservation
 */

import {
  buildReviewBoardReport,
  formatReviewItem,
  formatReviewBoardReport,
  type ReviewReadiness,
} from "../lib/factory/strategic-change-review-board";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/review-strategic-changes.ts [options]

Options:
  --readiness <state>    Filter: ready, caution, blocked
  --domain <domain>      Filter by domain
  --top <n>              Show top N items by priority
  --json                 Output as JSON
  --help                 Show this help

Examples:
  npx tsx scripts/review-strategic-changes.ts
  npx tsx scripts/review-strategic-changes.ts --json
  npx tsx scripts/review-strategic-changes.ts --readiness ready
  npx tsx scripts/review-strategic-changes.ts --top 10
  npx tsx scripts/review-strategic-changes.ts --domain reservation
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const json = args.includes("--json");

  let readiness: string | undefined;
  let domain: string | undefined;
  let top: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--readiness":
        readiness = args[++i];
        break;
      case "--domain":
        domain = args[++i];
        break;
      case "--top": {
        const val = args[++i];
        if (val) top = parseInt(val, 10);
        break;
      }
    }
  }

  const report = buildReviewBoardReport();

  let items = report.items;

  if (readiness) {
    const validReadiness = ["ready", "caution", "blocked"];
    if (!validReadiness.includes(readiness)) {
      console.error(`Error: --readiness must be one of: ${validReadiness.join(", ")}`);
      process.exit(1);
    }
    items = items.filter((i) => i.readiness === readiness);
  }

  if (domain) {
    items = items.filter((i) => i.domain === domain);
  }

  if (top !== undefined) {
    items = items.slice(0, top);
  }

  if (json) {
    if (readiness || domain || top !== undefined) {
      console.log(JSON.stringify(items, null, 2));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
  } else {
    if (readiness || domain || top !== undefined) {
      if (items.length === 0) {
        console.log("該当するレビューアイテムなし");
      } else {
        for (const item of items) {
          console.log(formatReviewItem(item));
          console.log();
        }
      }
    } else {
      console.log(formatReviewBoardReport(report));
    }
  }
}

main();
