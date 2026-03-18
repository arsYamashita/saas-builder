#!/usr/bin/env tsx
/**
 * CLI: Marketplace Derivation Pipeline
 *
 * Usage:
 *   npx tsx scripts/run-marketplace-derivation.ts preview
 *   npx tsx scripts/run-marketplace-derivation.ts prepare
 *   npx tsx scripts/run-marketplace-derivation.ts prepare --intent derive-reservation_saas-restaurant_reservation_saas-1710594600000
 *   npx tsx scripts/run-marketplace-derivation.ts history
 *   npx tsx scripts/run-marketplace-derivation.ts preview --json
 */

import {
  buildDerivationPlans,
  handoffDerivedCandidates,
  listDerivationHistory,
  buildDerivationReport,
  formatDerivationReport,
} from "../lib/factory/marketplace-derivation-pipeline";
import {
  resolveActorRole,
  ALL_ROLES,
  type FactoryRole,
} from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdPreview(json: boolean): void {
  const report = buildDerivationReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDerivationReport(report));
  }
}

function cmdPrepare(
  intentId: string | undefined,
  role: FactoryRole,
  actorId: string,
  json: boolean,
): void {
  const actor = resolveActorRole(actorId, role);
  const { prepared, skipped, history } = handoffDerivedCandidates({
    intentId: intentId || undefined,
    executedBy: actorId,
    actor,
  });

  if (json) {
    console.log(JSON.stringify({ prepared, skipped, history }, null, 2));
  } else {
    if (prepared.length === 0 && skipped.length === 0) {
      console.log("派生対象はありません。権限が不足している可能性があります。");
      return;
    }
    if (prepared.length === 0) {
      console.log("派生可能な対象はありませんでした。");
    } else {
      console.log(`Prepared ${prepared.length} derivation(s):`);
      for (const p of prepared) {
        console.log(
          `  ${p.derivationId}: ${p.parentTemplateId} → ${p.requestedTemplateId}`,
        );
        if (p.derivedCandidate) {
          console.log(`    type: ${p.derivedCandidate.variantType}`);
        }
      }
    }
    if (skipped.length > 0) {
      console.log(`\nSkipped ${skipped.length} derivation(s):`);
      for (const s of skipped) {
        console.log(`  ${s.derivationId}: ${s.skipReason ?? s.status}`);
      }
    }
  }
}

function cmdHistory(json: boolean): void {
  const history = listDerivationHistory();
  if (json) {
    console.log(JSON.stringify(history, null, 2));
  } else {
    if (history.length === 0) {
      console.log("派生パイプラインの履歴はありません。");
    } else {
      console.log("DERIVATION PIPELINE HISTORY:");
      for (const h of history) {
        console.log(
          `  ${h.executedAt}  ${h.derivationId}  ${h.status.toUpperCase()}  (${h.executedBy})`,
        );
        console.log(
          `    ${h.parentTemplateId} → ${h.requestedTemplateId}`,
        );
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
  npx tsx scripts/run-marketplace-derivation.ts <command> [options]

Commands:
  preview                      Preview derivation plans (dry-run)
  prepare                      Prepare eligible derivations (handoff to candidate store)
  history                      Show derivation pipeline history

Options:
  --intent <id>                Process only this intent
  --role <role>                Actor role (default: admin)
  --actor <id>                 Actor ID (default: "cli")
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/run-marketplace-derivation.ts preview
  npx tsx scripts/run-marketplace-derivation.ts prepare
  npx tsx scripts/run-marketplace-derivation.ts prepare --intent derive-reservation_saas-restaurant_reservation_saas-1710594600000
  npx tsx scripts/run-marketplace-derivation.ts history --json
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

  let intentId: string | undefined;
  let role: FactoryRole = "admin";
  let actorId = "cli";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--intent":
        intentId = args[++i];
        break;
      case "--role": {
        const val = args[++i];
        if (val && ALL_ROLES.includes(val as FactoryRole)) {
          role = val as FactoryRole;
        } else {
          console.error(
            `Error: --role must be one of: ${ALL_ROLES.join(", ")}. Got: ${val ?? "(missing)"}`,
          );
          process.exit(1);
        }
        break;
      }
      case "--actor":
        actorId = args[++i] ?? "cli";
        break;
    }
  }

  switch (command) {
    case "preview":
      cmdPreview(json);
      break;
    case "prepare":
      cmdPrepare(intentId, role, actorId, json);
      break;
    case "history":
      cmdHistory(json);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
