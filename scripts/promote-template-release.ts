#!/usr/bin/env tsx
/**
 * CLI: Template Release Management
 *
 * Usage:
 *   npx tsx scripts/promote-template-release.ts preview --template reservation_saas --from candidate --to dev
 *   npx tsx scripts/promote-template-release.ts apply --template reservation_saas --from dev --to staging --role admin --actor admin-1
 *   npx tsx scripts/promote-template-release.ts apply --template reservation_saas --from staging --to prod --role owner --actor owner-1
 *   npx tsx scripts/promote-template-release.ts history
 *   npx tsx scripts/promote-template-release.ts report
 *   npx tsx scripts/promote-template-release.ts preview --json
 */

import {
  previewTemplateReleasePlans,
  applyTemplateReleasePlans,
  listTemplateReleaseHistory,
  buildTemplateReleaseReport,
  formatTemplateReleaseReport,
  formatReleasePromotionPlans,
  type ReleaseStage,
} from "../lib/factory/template-release-management";
import {
  resolveActorRole,
  ALL_ROLES,
  type FactoryRole,
} from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const VALID_STAGES: ReleaseStage[] = ["candidate", "dev", "staging", "prod"];

function cmdPreview(
  templateId: string | undefined,
  fromStage: ReleaseStage | undefined,
  toStage: ReleaseStage | undefined,
  json: boolean,
): void {
  const plans = previewTemplateReleasePlans({
    templateId,
    fromStage,
    toStage,
  });

  if (json) {
    console.log(JSON.stringify(plans, null, 2));
  } else {
    console.log(formatReleasePromotionPlans(plans));
  }
}

function cmdApply(
  templateId: string | undefined,
  fromStage: ReleaseStage | undefined,
  toStage: ReleaseStage | undefined,
  role: FactoryRole,
  actorId: string,
  releaseNotes: string | undefined,
  json: boolean,
): void {
  const actor = resolveActorRole(actorId, role);
  const result = applyTemplateReleasePlans({
    templateId,
    fromStage,
    toStage,
    actor,
    releaseNotes,
  });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (result.applied.length > 0) {
      console.log(`Applied ${result.applied.length} promotion(s):`);
      for (const p of result.applied) {
        console.log(`  ${p.templateId}: ${p.fromStage} → ${p.toStage} [PROMOTED]`);
      }
    }
    if (result.skipped.length > 0) {
      console.log(`\nSkipped ${result.skipped.length} promotion(s):`);
      for (const p of result.skipped) {
        console.log(`  ${p.templateId}: ${p.fromStage} → ${p.toStage} — ${p.eligibility.reason}`);
      }
    }
    if (result.applied.length === 0 && result.skipped.length === 0) {
      console.log("リリースプロモーション対象はありません。");
    }
  }
}

function cmdHistory(json: boolean): void {
  const history = listTemplateReleaseHistory();
  if (json) {
    console.log(JSON.stringify(history, null, 2));
  } else {
    if (history.length === 0) {
      console.log("リリース履歴はありません。");
    } else {
      console.log("TEMPLATE RELEASE HISTORY:");
      for (const h of history) {
        console.log(
          `  ${h.executedAt}  ${h.templateId}: ${h.fromStage} → ${h.toStage}  ` +
          `[${h.status.toUpperCase()}]  (${h.executedBy})`,
        );
      }
    }
  }
}

function cmdReport(json: boolean): void {
  const report = buildTemplateReleaseReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatTemplateReleaseReport(report));
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/promote-template-release.ts <command> [options]

Commands:
  preview                        Preview release promotions (dry-run)
  apply                          Apply release promotions
  history                        Show release history
  report                         Show full release report

Options:
  --template <id>                Template to promote
  --from <stage>                 Source stage (candidate, dev, staging, prod)
  --to <stage>                   Target stage (candidate, dev, staging, prod)
  --role <role>                  Actor role (default: admin)
  --actor <id>                   Actor ID (default: "cli")
  --notes <text>                 Release notes
  --json                         Output as JSON
  --help                         Show this help

Examples:
  npx tsx scripts/promote-template-release.ts preview
  npx tsx scripts/promote-template-release.ts preview --template reservation_saas --from candidate --to dev
  npx tsx scripts/promote-template-release.ts apply --template reservation_saas --from dev --to staging --role admin --actor admin-1
  npx tsx scripts/promote-template-release.ts apply --template reservation_saas --from staging --to prod --role owner --actor owner-1
  npx tsx scripts/promote-template-release.ts history --json
  npx tsx scripts/promote-template-release.ts report
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

  let templateId: string | undefined;
  let fromStage: ReleaseStage | undefined;
  let toStage: ReleaseStage | undefined;
  let role: FactoryRole = "admin";
  let actorId = "cli";
  let releaseNotes: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--template":
        templateId = args[++i];
        break;
      case "--from": {
        const val = args[++i];
        if (val && VALID_STAGES.includes(val as ReleaseStage)) {
          fromStage = val as ReleaseStage;
        } else {
          console.error(`Error: --from must be one of: ${VALID_STAGES.join(", ")}`);
          process.exit(1);
        }
        break;
      }
      case "--to": {
        const val = args[++i];
        if (val && VALID_STAGES.includes(val as ReleaseStage)) {
          toStage = val as ReleaseStage;
        } else {
          console.error(`Error: --to must be one of: ${VALID_STAGES.join(", ")}`);
          process.exit(1);
        }
        break;
      }
      case "--role": {
        const val = args[++i];
        if (val && ALL_ROLES.includes(val as FactoryRole)) {
          role = val as FactoryRole;
        } else {
          console.error(`Error: --role must be one of: ${ALL_ROLES.join(", ")}`);
          process.exit(1);
        }
        break;
      }
      case "--actor":
        actorId = args[++i] ?? "cli";
        break;
      case "--notes":
        releaseNotes = args[++i];
        break;
    }
  }

  switch (command) {
    case "preview":
      cmdPreview(templateId, fromStage, toStage, json);
      break;
    case "apply":
      cmdApply(templateId, fromStage, toStage, role, actorId, releaseNotes, json);
      break;
    case "history":
      cmdHistory(json);
      break;
    case "report":
      cmdReport(json);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
