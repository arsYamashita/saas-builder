#!/usr/bin/env tsx
/**
 * CLI: Preview and apply approved factory changes.
 *
 * Usage:
 *   npx tsx scripts/apply-approved-factory-changes.ts preview
 *   npx tsx scripts/apply-approved-factory-changes.ts preview --json
 *   npx tsx scripts/apply-approved-factory-changes.ts apply
 *   npx tsx scripts/apply-approved-factory-changes.ts apply --proposal routing-weight-adjustment-schema
 *   npx tsx scripts/apply-approved-factory-changes.ts history
 *   npx tsx scripts/apply-approved-factory-changes.ts history --json
 *   npx tsx scripts/apply-approved-factory-changes.ts rollback
 */

import {
  buildAdoptionReport,
  formatAdoptionReport,
  previewAdoptionPlans,
  applyAdoptionPlans,
  listAdoptionHistory,
  buildRollbackMetadata,
} from "../lib/factory/approved-change-adoption";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdPreview(json: boolean): void {
  const report = buildAdoptionReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAdoptionReport(report));
  }
}

function cmdApply(proposalId: string | undefined, json: boolean): void {
  const { applied, skipped, history } = applyAdoptionPlans({
    proposalId: proposalId || undefined,
    appliedBy: "cli",
  });

  if (json) {
    console.log(JSON.stringify({ applied, skipped, history }, null, 2));
  } else {
    if (applied.length === 0) {
      console.log("適用可能なプランはありません。");
    } else {
      console.log(`Applied ${applied.length} plan(s):`);
      for (const plan of applied) {
        console.log(
          `  ${plan.planId}: ${plan.dryRunDiff.key} ${plan.dryRunDiff.before} → ${plan.dryRunDiff.after}`,
        );
      }
    }
    if (skipped.length > 0) {
      console.log(`\nSkipped ${skipped.length} plan(s):`);
      for (const plan of skipped) {
        console.log(`  ${plan.planId}: ${plan.skipReason ?? plan.status}`);
      }
    }
  }
}

function cmdHistory(json: boolean): void {
  const history = listAdoptionHistory();
  if (json) {
    console.log(JSON.stringify(history, null, 2));
  } else {
    if (history.length === 0) {
      console.log("適用履歴はありません。");
    } else {
      console.log("ADOPTION HISTORY:");
      for (const h of history) {
        console.log(
          `  ${h.appliedAt}  ${h.planId}  ${h.status.toUpperCase()}  (${h.appliedBy})`,
        );
        console.log(`    ${h.before} → ${h.after}`);
        if (h.notes) console.log(`    notes: ${h.notes}`);
      }
    }
  }
}

function cmdRollback(json: boolean): void {
  const rollbacks = buildRollbackMetadata();
  if (json) {
    console.log(JSON.stringify(rollbacks, null, 2));
  } else {
    if (rollbacks.length === 0) {
      console.log("ロールバックメタデータはありません。");
    } else {
      console.log("ROLLBACK METADATA:");
      for (const rb of rollbacks) {
        console.log(`  ${rb.planId}`);
        console.log(`    target:  ${rb.rollbackAction.targetFile}`);
        console.log(`    key:     ${rb.rollbackAction.key}`);
        console.log(`    restore: ${rb.rollbackAction.restoreValue}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/apply-approved-factory-changes.ts <command> [options]

Commands:
  preview                      Preview adoption plans (dry-run, no mutation)
  apply                        Apply all ready plans
  history                      Show adoption history
  rollback                     Show rollback metadata

Options:
  --proposal <id>              Apply only this proposal (with apply command)
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/apply-approved-factory-changes.ts preview
  npx tsx scripts/apply-approved-factory-changes.ts apply --proposal routing-weight-adjustment-schema
  npx tsx scripts/apply-approved-factory-changes.ts history --json
  npx tsx scripts/apply-approved-factory-changes.ts rollback
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0]!;
  const json = args.includes("--json");

  let proposalId: string | undefined;
  const proposalIdx = args.indexOf("--proposal");
  if (proposalIdx !== -1 && args[proposalIdx + 1]) {
    proposalId = args[proposalIdx + 1];
  }

  switch (command) {
    case "preview":
      cmdPreview(json);
      break;
    case "apply":
      cmdApply(proposalId, json);
      break;
    case "history":
      cmdHistory(json);
      break;
    case "rollback":
      cmdRollback(json);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
