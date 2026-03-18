#!/usr/bin/env tsx
/**
 * CLI: Scenario Auto-Promotion Rules
 *
 * Usage:
 *   npx tsx scripts/auto-promote-scenarios.ts evaluate
 *   npx tsx scripts/auto-promote-scenarios.ts evaluate --review review-expand_reservation_3
 *   npx tsx scripts/auto-promote-scenarios.ts apply --role admin --actor admin-1
 *   npx tsx scripts/auto-promote-scenarios.ts apply --review review-expand_reservation_3 --role admin --actor admin-1
 *   npx tsx scripts/auto-promote-scenarios.ts report --json
 */

import {
  evaluateScenarioAutoPromotion,
  evaluateAllScenarioAutoPromotions,
  applyScenarioAutoPromotions,
  buildScenarioAutoPromotionReport,
  formatAutoPromotionResult,
  formatAutoPromotionReport,
  useInMemoryStore,
} from "../lib/factory/scenario-auto-promotion";
import {
  initializeAllReviewWorkflows,
  transitionReviewWorkflow,
  useInMemoryStore as useWorkflowStore,
} from "../lib/factory/strategic-review-workflow";
import {
  useInMemoryStore as useGovernanceStore,
} from "../lib/factory/scenario-execution-governance";
import {
  buildStrategicReviewBoard,
} from "../lib/factory/strategic-change-review-board";
import { resolveActorRole, type FactoryRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/auto-promote-scenarios.ts <command> [options]

Commands:
  evaluate                        Evaluate auto-promotion eligibility
  apply                           Apply eligible auto-promotions
  report                          Show auto-promotion report

Options:
  --review <reviewId>             Specific review to evaluate/apply
  --role <role>                   Actor role: owner, admin, reviewer, operator, viewer
  --actor <id>                    Actor ID
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/auto-promote-scenarios.ts evaluate
  npx tsx scripts/auto-promote-scenarios.ts evaluate --review review-expand_reservation_3
  npx tsx scripts/auto-promote-scenarios.ts apply --role admin --actor admin-1
  npx tsx scripts/auto-promote-scenarios.ts apply --review review-expand_reservation_3 --role admin --actor admin-1
  npx tsx scripts/auto-promote-scenarios.ts report --json
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  // Enable in-memory stores
  useInMemoryStore();
  useWorkflowStore();
  useGovernanceStore();

  const command = args[0];
  const json = args.includes("--json");

  let reviewId: string | undefined;
  let role: string = "admin";
  let actorId: string = "cli-user";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--review":
        reviewId = args[++i];
        break;
      case "--role":
        role = args[++i];
        break;
      case "--actor":
        actorId = args[++i];
        break;
    }
  }

  // Initialize workflows and move scenario items to in_review for demo
  const items = buildStrategicReviewBoard();
  initializeAllReviewWorkflows();
  const actor = resolveActorRole(actorId, role as FactoryRole);

  // Move scenario items to in_review for evaluation
  const scenarioItems = items.filter((i) => i.reviewType === "scenario");
  for (const item of scenarioItems) {
    transitionReviewWorkflow(item.reviewId, "in_review", actor);
  }

  switch (command) {
    case "evaluate": {
      let results;
      if (reviewId) {
        const result = evaluateScenarioAutoPromotion(reviewId);
        results = [result];
      } else {
        results = evaluateAllScenarioAutoPromotions();
      }

      if (json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log("=== Auto-Promotion Evaluation ===");
        console.log(`Evaluated: ${results.length}`);
        console.log(`Eligible: ${results.filter((r) => r.eligible).length}`);
        console.log(`Not Eligible: ${results.filter((r) => !r.eligible).length}`);
        console.log("");
        for (const r of results) {
          console.log(formatAutoPromotionResult(r));
          console.log("");
        }
      }
      break;
    }

    case "apply": {
      const results = applyScenarioAutoPromotions(actor, undefined, reviewId);

      if (results.length === 0) {
        console.error(`Role ${role} is not authorized to apply auto-promotions`);
        process.exit(1);
      }

      if (json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        const promoted = results.filter((r) => r.applied);
        console.log("=== Auto-Promotion Apply ===");
        console.log(`Applied: ${promoted.length}`);
        console.log(`Skipped: ${results.length - promoted.length}`);
        console.log("");
        for (const r of results) {
          console.log(formatAutoPromotionResult(r));
          console.log("");
        }
      }
      break;
    }

    case "report": {
      const report = buildScenarioAutoPromotionReport();
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatAutoPromotionReport(report));
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
