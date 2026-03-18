#!/usr/bin/env tsx
/**
 * CLI: Factory Permission Checks
 *
 * Usage:
 *   npx tsx scripts/check-factory-permissions.ts matrix
 *   npx tsx scripts/check-factory-permissions.ts check --role admin --action marketplace.publish
 *   npx tsx scripts/check-factory-permissions.ts check --role operator --action policy.promote.staging_to_prod
 *   npx tsx scripts/check-factory-permissions.ts matrix --json
 */

import {
  resolveActorRole,
  authorizeFactoryAction,
  buildPermissionMatrix,
  buildRoleApprovalReport,
  formatPermissionMatrix,
  formatRoleApprovalReport,
  ALL_ROLES,
  ALL_ACTIONS,
  type FactoryRole,
  type FactoryAction,
} from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdMatrix(json: boolean): void {
  if (json) {
    const report = buildRoleApprovalReport();
    console.log(JSON.stringify(report, null, 2));
  } else {
    const report = buildRoleApprovalReport();
    console.log(formatRoleApprovalReport(report));
  }
}

function cmdCheck(
  role: FactoryRole,
  action: FactoryAction,
  actorId: string,
  json: boolean,
): void {
  const actor = resolveActorRole(actorId, role);
  const result = authorizeFactoryAction(actor, action);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const badge = result.allowed ? "[ALLOWED]" : "[DENIED]";
    console.log(`${badge} ${result.action}`);
    console.log(`  actor:  ${result.actor.actorId} (${result.actor.role})`);
    console.log(`  reason: ${result.reason}`);
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/check-factory-permissions.ts <command> [options]

Commands:
  matrix                       Show full permission matrix
  check                        Check one actor/action permission

Options:
  --role <role>                Role (${ALL_ROLES.join(", ")})
  --action <action>            Action to check
  --actor <id>                 Actor ID (default: "local-user")
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/check-factory-permissions.ts matrix
  npx tsx scripts/check-factory-permissions.ts check --role admin --action marketplace.publish
  npx tsx scripts/check-factory-permissions.ts check --role operator --action policy.promote.staging_to_prod
  npx tsx scripts/check-factory-permissions.ts matrix --json
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

  let role: string | undefined;
  let action: string | undefined;
  let actorId = "local-user";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--role":
        role = args[++i];
        break;
      case "--action":
        action = args[++i];
        break;
      case "--actor":
        actorId = args[++i] ?? "local-user";
        break;
    }
  }

  switch (command) {
    case "matrix":
      cmdMatrix(json);
      break;
    case "check": {
      if (!role || !ALL_ROLES.includes(role as FactoryRole)) {
        console.error(
          `Error: --role must be one of: ${ALL_ROLES.join(", ")}. Got: ${role ?? "(missing)"}`,
        );
        process.exit(1);
      }
      if (!action || !ALL_ACTIONS.includes(action as FactoryAction)) {
        console.error(
          `Error: --action must be one of:\n  ${ALL_ACTIONS.join("\n  ")}\nGot: ${action ?? "(missing)"}`,
        );
        process.exit(1);
      }
      cmdCheck(role as FactoryRole, action as FactoryAction, actorId, json);
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
