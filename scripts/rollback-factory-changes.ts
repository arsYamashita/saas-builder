#!/usr/bin/env tsx
/**
 * CLI: Factory Audit / Rollback Execution
 *
 * Usage:
 *   npx tsx scripts/rollback-factory-changes.ts preview
 *   npx tsx scripts/rollback-factory-changes.ts apply
 *   npx tsx scripts/rollback-factory-changes.ts apply --source adopt-plan-1
 *   npx tsx scripts/rollback-factory-changes.ts history
 *   npx tsx scripts/rollback-factory-changes.ts audit
 *   npx tsx scripts/rollback-factory-changes.ts audit --type adoption
 *   npx tsx scripts/rollback-factory-changes.ts preview --json
 */

import {
  previewRollbackCandidates,
  applyRollbackCandidates,
  buildRollbackExecutionReport,
  buildUnifiedAuditReport,
  formatRollbackReport,
  formatAuditReport,
  type AuditEventType,
  type AuditSourceType,
} from "../lib/factory/factory-audit-rollback";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdPreview(json: boolean): void {
  const report = buildRollbackExecutionReport();
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatRollbackReport(report));
  }
}

function cmdApply(sourceId: string | undefined, json: boolean): void {
  const { rolledBack, skipped, history } = applyRollbackCandidates({
    sourceId: sourceId || undefined,
    executedBy: "cli",
  });

  if (json) {
    console.log(JSON.stringify({ rolledBack, skipped, history }, null, 2));
  } else {
    if (rolledBack.length === 0) {
      console.log("ロールバック対象はありません。");
    } else {
      console.log(`Rolled back ${rolledBack.length} change(s):`);
      for (const c of rolledBack) {
        console.log(
          `  ${c.rollbackId}: ${c.key}: ${c.currentValue ?? "(unset)"} → ${c.restoreValue ?? "(unset)"}`,
        );
      }
    }
    if (skipped.length > 0) {
      console.log(`\nSkipped ${skipped.length} candidate(s):`);
      for (const c of skipped) {
        console.log(`  ${c.rollbackId}: ${c.skipReason ?? c.status}`);
      }
    }
  }
}

function cmdHistory(json: boolean): void {
  const report = buildRollbackExecutionReport();
  if (json) {
    console.log(JSON.stringify(report.history, null, 2));
  } else {
    if (report.history.length === 0) {
      console.log("ロールバック履歴はありません。");
    } else {
      console.log("ROLLBACK HISTORY:");
      for (const h of report.history) {
        console.log(
          `  ${h.executedAt}  ${h.rollbackId}  ${h.status.toUpperCase()}  (${h.executedBy})`,
        );
        console.log(
          `    ${h.key}: ${h.before ?? "(unset)"} → ${h.after ?? "(unset)"}`,
        );
      }
    }
  }
}

function cmdAudit(
  eventType: AuditEventType | undefined,
  sourceType: AuditSourceType | undefined,
  json: boolean,
): void {
  const report = buildUnifiedAuditReport({
    eventType,
    sourceType,
  });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAuditReport(report));
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/rollback-factory-changes.ts <command> [options]

Commands:
  preview                      Preview rollback candidates (dry-run)
  apply                        Apply rollbacks
  history                      Show rollback history
  audit                        Show unified factory audit

Options:
  --source <id>                Rollback only this source (planId or promotionId)
  --type <type>                Filter audit by event type (adoption, promotion, rollback)
  --source-type <type>         Filter audit by source type (adoption, promotion)
  --json                       Output as JSON
  --help                       Show this help

Examples:
  npx tsx scripts/rollback-factory-changes.ts preview
  npx tsx scripts/rollback-factory-changes.ts apply
  npx tsx scripts/rollback-factory-changes.ts apply --source adopt-plan-1
  npx tsx scripts/rollback-factory-changes.ts history --json
  npx tsx scripts/rollback-factory-changes.ts audit
  npx tsx scripts/rollback-factory-changes.ts audit --type adoption
`);
}

const VALID_EVENT_TYPES: AuditEventType[] = ["adoption", "promotion", "rollback"];
const VALID_SOURCE_TYPES: AuditSourceType[] = ["adoption", "promotion"];

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0]!;
  const json = args.includes("--json");

  let sourceId: string | undefined;
  let eventType: AuditEventType | undefined;
  let sourceType: AuditSourceType | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--source":
        sourceId = args[++i];
        break;
      case "--type": {
        const val = args[++i];
        if (val && VALID_EVENT_TYPES.includes(val as AuditEventType)) {
          eventType = val as AuditEventType;
        } else {
          console.error(
            `Error: --type must be one of: ${VALID_EVENT_TYPES.join(", ")}. Got: ${val ?? "(missing)"}`,
          );
          process.exit(1);
        }
        break;
      }
      case "--source-type": {
        const val = args[++i];
        if (val && VALID_SOURCE_TYPES.includes(val as AuditSourceType)) {
          sourceType = val as AuditSourceType;
        } else {
          console.error(
            `Error: --source-type must be one of: ${VALID_SOURCE_TYPES.join(", ")}. Got: ${val ?? "(missing)"}`,
          );
          process.exit(1);
        }
        break;
      }
    }
  }

  switch (command) {
    case "preview":
      cmdPreview(json);
      break;
    case "apply":
      cmdApply(sourceId, json);
      break;
    case "history":
      cmdHistory(json);
      break;
    case "audit":
      cmdAudit(eventType, sourceType, json);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main();
