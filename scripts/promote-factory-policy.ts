#!/usr/bin/env tsx
/**
 * CLI: Promote factory policy changes across environments.
 *
 * Usage:
 *   npx tsx scripts/promote-factory-policy.ts preview --from dev --to staging
 *   npx tsx scripts/promote-factory-policy.ts apply --from dev --to staging
 *   npx tsx scripts/promote-factory-policy.ts apply --from dev --to staging --proposal provider-routing-recent-score-weight
 *   npx tsx scripts/promote-factory-policy.ts history
 *   npx tsx scripts/promote-factory-policy.ts rollback
 *   npx tsx scripts/promote-factory-policy.ts preview --from dev --to staging --json
 */

import {
  buildPromotionReport,
  formatPromotionReport,
  applyPromotionPlans,
  listPromotionHistory,
  buildPromotionRollbackMetadata,
  type PolicyEnvironment,
} from "../lib/factory/policy-promotion";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ENVS: PolicyEnvironment[] = ["dev", "staging", "prod"];

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdPreview(from: PolicyEnvironment, to: PolicyEnvironment, json: boolean): void {
  const report = buildPromotionReport(from, to);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatPromotionReport(report));
  }
}

function cmdApply(
  from: PolicyEnvironment,
  to: PolicyEnvironment,
  proposalId: string | undefined,
  json: boolean,
): void {
  const { promoted, skipped, history } = applyPromotionPlans(from, to, {
    proposalId: proposalId || undefined,
    appliedBy: "cli",
  });

  if (json) {
    console.log(JSON.stringify({ promoted, skipped, history }, null, 2));
  } else {
    if (promoted.length === 0) {
      console.log("プロモーション対象はありません。");
    } else {
      console.log(`Promoted ${promoted.length} change(s) from ${from} → ${to}:`);
      for (const plan of promoted) {
        console.log(
          `  ${plan.key}: ${plan.currentValue ?? "(unset)"} → ${plan.promotedValue}`,
        );
      }
    }
    if (skipped.length > 0) {
      console.log(`\nSkipped ${skipped.length} plan(s):`);
      for (const plan of skipped) {
        console.log(`  ${plan.promotionId}: ${plan.skipReason ?? plan.status}`);
      }
    }
  }
}

function cmdHistory(json: boolean): void {
  const history = listPromotionHistory();
  if (json) {
    console.log(JSON.stringify(history, null, 2));
  } else {
    if (history.length === 0) {
      console.log("プロモーション履歴はありません。");
    } else {
      console.log("PROMOTION HISTORY:");
      for (const h of history) {
        console.log(
          `  ${h.appliedAt}  ${h.promotionId}  ${h.status.toUpperCase()}  (${h.appliedBy})`,
        );
        console.log(`    ${h.fromEnv} → ${h.toEnv}  ${h.before ?? "(unset)"} → ${h.after}`);
      }
    }
  }
}

function cmdRollback(json: boolean): void {
  const rollbacks = buildPromotionRollbackMetadata();
  if (json) {
    console.log(JSON.stringify(rollbacks, null, 2));
  } else {
    if (rollbacks.length === 0) {
      console.log("ロールバックメタデータはありません。");
    } else {
      console.log("ROLLBACK METADATA:");
      for (const rb of rollbacks) {
        console.log(`  ${rb.promotionId}`);
        console.log(`    target:  ${rb.rollbackAction.targetFile}`);
        console.log(`    key:     ${rb.rollbackAction.key}`);
        console.log(`    restore: ${rb.rollbackAction.restoreValue ?? "(unset)"}`);
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
  npx tsx scripts/promote-factory-policy.ts <command> [options]

Commands:
  preview                      Preview promotion plans (dry-run)
  apply                        Apply promotions
  history                      Show promotion history
  rollback                     Show rollback metadata

Options:
  --from <env>                 Source environment (dev, staging, prod)
  --to <env>                   Target environment (dev, staging, prod)
  --proposal <id>              Promote only this proposal
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/promote-factory-policy.ts preview --from dev --to staging
  npx tsx scripts/promote-factory-policy.ts apply --from dev --to staging
  npx tsx scripts/promote-factory-policy.ts apply --from dev --to staging --proposal provider-routing-recent-score-weight
  npx tsx scripts/promote-factory-policy.ts history --json
  npx tsx scripts/promote-factory-policy.ts rollback
`);
}

function parseEnv(value: string | undefined, flag: string): PolicyEnvironment {
  if (!value || !VALID_ENVS.includes(value as PolicyEnvironment)) {
    console.error(
      `Error: ${flag} must be one of: ${VALID_ENVS.join(", ")}. Got: ${value ?? "(missing)"}`,
    );
    process.exit(1);
  }
  return value as PolicyEnvironment;
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0]!;
  const json = args.includes("--json");

  let from: string | undefined;
  let to: string | undefined;
  let proposalId: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--from":
        from = args[++i];
        break;
      case "--to":
        to = args[++i];
        break;
      case "--proposal":
        proposalId = args[++i];
        break;
    }
  }

  switch (command) {
    case "preview": {
      const fromEnv = parseEnv(from, "--from");
      const toEnv = parseEnv(to, "--to");
      cmdPreview(fromEnv, toEnv, json);
      break;
    }
    case "apply": {
      const fromEnv = parseEnv(from, "--from");
      const toEnv = parseEnv(to, "--to");
      cmdApply(fromEnv, toEnv, proposalId, json);
      break;
    }
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
