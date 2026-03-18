#!/usr/bin/env npx tsx
/**
 * Idea Discovery CLI Script
 *
 * Usage:
 *   npx tsx scripts/run-idea-discovery.ts discover          # full discovery run
 *   npx tsx scripts/run-idea-discovery.ts report             # show report
 *   npx tsx scripts/run-idea-discovery.ts list --source twitter --limit 10
 */

import { createSaaSBuilderDiscoveryEngine } from "../lib/idea-discovery/integrations/saas-builder-factory";
import { SaaSBuilderStorageAdapter } from "../lib/idea-discovery/integrations/saas-builder-storage-adapter";
import type { DataSourceType } from "../lib/idea-discovery/core/types";

const args = process.argv.slice(2);
const command = args[0] || "help";

async function runDiscovery() {
  console.log("Starting full discovery run...");
  const engine = createSaaSBuilderDiscoveryEngine({
    maxIdeasPerRun: 500,
  });

  const report = await engine.run();

  console.log("\n=== Discovery Report ===");
  console.log(`Total scraped: ${report.totalScraped}`);
  console.log(`Total filtered: ${report.totalFiltered}`);
  console.log(`Total analyzed: ${report.totalAnalyzed}`);
  console.log(`Total matched: ${report.totalMatched}`);
  console.log(`Total gaps: ${report.totalGaps}`);

  console.log("\nBy source:");
  Object.entries(report.bySource).forEach(([source, count]) => {
    if (count > 0) console.log(`  ${source}: ${count}`);
  });

  console.log("\nBy domain:");
  Object.entries(report.byDomain).forEach(([domain, count]) => {
    if (count > 0) console.log(`  ${domain}: ${count}`);
  });

  console.log("\nTop 5 ideas:");
  report.topIdeas.slice(0, 5).forEach((item, i) => {
    console.log(
      `  ${i + 1}. ${item.idea.quickFilter.domain} (${item.rankingScore}%)`,
    );
  });

  if (report.gapAnalysis.length > 0) {
    console.log("\nTemplate gaps detected:");
    report.gapAnalysis.slice(0, 3).forEach((gap) => {
      console.log(`  - ${gap.domain}: ${gap.description}`);
    });
  }
}

async function showReport() {
  console.log("=== Discovery Report ===\n");

  const storage = new SaaSBuilderStorageAdapter();
  const feedItems = await storage.loadFeedItems();
  const ideas = await storage.loadAnalyzedIdeas();

  if (ideas.length === 0) {
    console.log("No ideas discovered yet. Run 'discover' first.");
    return;
  }

  const matchedCount = feedItems.filter(
    (f) => f.templateMatch.type === "matched",
  ).length;
  const gapCount = feedItems.filter(
    (f) => f.templateMatch.type === "gap_detected",
  ).length;

  console.log(`Total ideas: ${ideas.length}`);
  console.log(`Ranked feed items: ${feedItems.length}`);
  console.log(`Template matches: ${matchedCount}`);
  console.log(`Template gaps: ${gapCount}`);

  const avgScore =
    feedItems.length > 0
      ? Math.round(
          feedItems.reduce((sum, f) => sum + f.rankingScore, 0) /
            feedItems.length,
        )
      : 0;
  console.log(`Average ranking score: ${avgScore}%`);

  console.log("\nTop 10 ideas:");
  feedItems.slice(0, 10).forEach((item, i) => {
    console.log(
      `  ${i + 1}. ${item.idea.quickFilter.domain} (${item.rankingScore}%) - ${item.idea.quickFilter.reason}`,
    );
  });
}

async function listIdeas() {
  const sourceArg = args.indexOf("--source");
  const limitArg = args.indexOf("--limit");

  const source = sourceArg !== -1 ? (args[sourceArg + 1] as DataSourceType) : undefined;
  const limit = limitArg !== -1 ? parseInt(args[limitArg + 1]!, 10) : 10;

  const storage = new SaaSBuilderStorageAdapter();
  const ideas = await storage.loadAnalyzedIdeas({ source });

  console.log(`=== Ideas (showing ${Math.min(limit, ideas.length)} of ${ideas.length}) ===\n`);

  ideas.slice(0, limit).forEach((idea, i) => {
    console.log(
      `${i + 1}. ${idea.quickFilter.domain} (${idea.id})`,
    );
    console.log(`   Problem: ${idea.needsAnalysis.problemStatement}`);
    console.log(`   Target users: ${idea.needsAnalysis.targetUsers}`);
    console.log(`   Confidence: ${idea.quickFilter.confidence}%`);
    console.log("");
  });
}

function showHelp() {
  console.log(`
Idea Discovery CLI

Usage:
  npx tsx scripts/run-idea-discovery.ts <command> [options]

Commands:
  discover              Run full discovery pipeline
  report                Show discovery report and statistics
  list                  List discovered ideas

Options for 'list':
  --source <source>     Filter by data source (twitter, qiita, hatena, etc.)
  --limit <n>           Maximum ideas to show (default: 10)

Examples:
  npx tsx scripts/run-idea-discovery.ts discover
  npx tsx scripts/run-idea-discovery.ts report
  npx tsx scripts/run-idea-discovery.ts list --source twitter --limit 20
`);
}

async function main() {
  try {
    switch (command) {
      case "discover":
        await runDiscovery();
        break;
      case "report":
        await showReport();
        break;
      case "list":
        await listIdeas();
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
