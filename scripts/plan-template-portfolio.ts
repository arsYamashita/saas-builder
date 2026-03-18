#!/usr/bin/env tsx
/**
 * CLI: Template Portfolio Strategy
 *
 * Usage:
 *   npx tsx scripts/plan-template-portfolio.ts
 *   npx tsx scripts/plan-template-portfolio.ts --json
 *   npx tsx scripts/plan-template-portfolio.ts --top 5
 *   npx tsx scripts/plan-template-portfolio.ts --domain reservation
 */

import {
  analyzePortfolioCoverage,
  detectPortfolioGaps,
  buildPortfolioStrategyReport,
  formatPortfolioStrategyReport,
  formatDomainStrategyRecord,
} from "../lib/factory/template-portfolio-strategy";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/plan-template-portfolio.ts [options]

Options:
  --domain <domain>       Show strategy for a specific domain
  --top <n>               Show top N expansion priorities (default: all)
  --json                  Output as JSON
  --help                  Show this help

Examples:
  npx tsx scripts/plan-template-portfolio.ts
  npx tsx scripts/plan-template-portfolio.ts --json
  npx tsx scripts/plan-template-portfolio.ts --top 5
  npx tsx scripts/plan-template-portfolio.ts --domain reservation
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const json = args.includes("--json");

  let domain: string | undefined;
  let top: number | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
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

  // Specific domain
  if (domain) {
    const coverage = analyzePortfolioCoverage();
    const record = coverage.find((r) => r.domain === domain);

    if (!record) {
      // Check gaps
      const gaps = detectPortfolioGaps();
      const gap = gaps.find((g) => g.domain === domain);
      if (gap) {
        if (json) {
          console.log(JSON.stringify(gap, null, 2));
        } else {
          console.log(`STRATEGIC GAP: ${domain}\n`);
          console.log(`  Adjacent Domains: ${gap.adjacentDomains.join(", ") || "—"}`);
          console.log(`  Adjacent Templates: ${gap.adjacentTemplateCount}`);
          console.log(`  Evolution Proposals: ${gap.evolutionProposalCount}`);
          console.log(`  Avg Proposal Confidence: ${gap.averageProposalConfidence}`);
          console.log(`  Fill Priority: ${gap.fillPriority}`);
          console.log(`  Reasons: ${gap.reasons.join("; ")}`);
        }
      } else {
        console.log(`ドメイン "${domain}" のストラテジーデータはありません。`);
      }
      return;
    }

    if (json) {
      console.log(JSON.stringify(record, null, 2));
    } else {
      console.log(`DOMAIN STRATEGY: ${domain}\n`);
      console.log(formatDomainStrategyRecord(record));
    }
    return;
  }

  // Top N expansion priorities
  if (top !== undefined) {
    const coverage = analyzePortfolioCoverage();
    const expansions = coverage.filter((r) => r.strategy === "expand").slice(0, top);

    if (json) {
      console.log(JSON.stringify(expansions, null, 2));
    } else {
      if (expansions.length === 0) {
        console.log("拡大優先ドメインはありません。");
      } else {
        console.log(`TOP ${top} EXPANSION PRIORITIES:\n`);
        for (const rec of expansions) {
          console.log(formatDomainStrategyRecord(rec));
          console.log();
        }
      }
    }
    return;
  }

  // Full report (default)
  const report = buildPortfolioStrategyReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPortfolioStrategyReport(report));
  }
}

main();
