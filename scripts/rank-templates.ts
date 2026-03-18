#!/usr/bin/env tsx
/**
 * CLI: Template Analytics / Ranking
 *
 * Usage:
 *   npx tsx scripts/rank-templates.ts
 *   npx tsx scripts/rank-templates.ts --json
 *   npx tsx scripts/rank-templates.ts --health green
 *   npx tsx scripts/rank-templates.ts --sort derivation
 *   npx tsx scripts/rank-templates.ts --trend rising
 *   npx tsx scripts/rank-templates.ts --domain crm --json
 */

import {
  buildTemplateRankingReport,
  filterTemplateAnalytics,
  rankTemplates,
  formatTemplateRankingReport,
  type AnalyticsSortKey,
  type AnalyticsTrend,
  type TemplateAnalyticsFilters,
} from "../lib/factory/template-analytics-ranking";

// ---------------------------------------------------------------------------
// Sort key aliases
// ---------------------------------------------------------------------------

const SORT_ALIASES: Record<string, AnalyticsSortKey> = {
  overall: "overallRankScore",
  health: "healthScore",
  stability: "stabilityScore",
  adoption: "adoptionIntentCount",
  derivation: "derivationIntentCount",
  readiness: "derivationReadinessScore",
  maturity: "marketplaceMaturityScore",
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/rank-templates.ts [options]

Options:
  --json                         Output as JSON
  --health <state>               Filter by health state (green, at_risk, degraded, demoted, candidate)
  --domain <domain>              Filter by domain
  --status <status>              Filter by marketplace status (published, unpublished, experimental)
  --trend <trend>                Filter by trend (rising, stable, declining)
  --sort <key>                   Sort by: overall, health, stability, adoption, derivation, readiness, maturity
  --help                         Show this help

Examples:
  npx tsx scripts/rank-templates.ts
  npx tsx scripts/rank-templates.ts --json
  npx tsx scripts/rank-templates.ts --health green
  npx tsx scripts/rank-templates.ts --sort derivation
  npx tsx scripts/rank-templates.ts --trend rising --json
  npx tsx scripts/rank-templates.ts --domain crm
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const json = args.includes("--json");

  const filters: TemplateAnalyticsFilters = {};
  let sortKey: AnalyticsSortKey = "overallRankScore";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--health":
        filters.healthState = args[++i];
        break;
      case "--domain":
        filters.domain = args[++i];
        break;
      case "--status":
        filters.status = args[++i];
        break;
      case "--trend":
        filters.trend = args[++i] as AnalyticsTrend;
        break;
      case "--sort": {
        const val = args[++i];
        if (val && val in SORT_ALIASES) {
          sortKey = SORT_ALIASES[val]!;
        } else if (val) {
          console.error(
            `Error: --sort must be one of: ${Object.keys(SORT_ALIASES).join(", ")}. Got: ${val}`,
          );
          process.exit(1);
        }
        break;
      }
    }
  }

  const report = buildTemplateRankingReport();

  // Apply filters
  const hasFilters = Object.values(filters).some((v) => v !== undefined);
  let rankings = report.rankings;
  if (hasFilters) {
    rankings = filterTemplateAnalytics(rankings, filters);
  }

  // Apply sort
  rankings = rankTemplates(rankings, sortKey);

  if (json) {
    console.log(JSON.stringify({
      rankings,
      topRanked: report.topRanked,
      bestDerivationParents: report.bestDerivationParents,
      underusedHealthy: report.underusedHealthy,
      summary: report.summary,
    }, null, 2));
  } else {
    // Build a filtered report for formatting
    const filteredReport = {
      ...report,
      rankings,
    };
    console.log(formatTemplateRankingReport(filteredReport));
  }
}

main();
