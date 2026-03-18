#!/usr/bin/env tsx
/**
 * CLI: Strategic Review Workflow v3 — Operational Management
 *
 * Usage:
 *   npx tsx scripts/manage-strategic-review-ops.ts list
 *   npx tsx scripts/manage-strategic-review-ops.ts assign --review <id> --assignee <actorId> --assignee-role reviewer --role admin --actor admin-1
 *   npx tsx scripts/manage-strategic-review-ops.ts unassign --review <id> --role admin --actor admin-1
 *   npx tsx scripts/manage-strategic-review-ops.ts due --review <id> --date 2026-03-25T00:00:00Z --role admin --actor admin-1
 *   npx tsx scripts/manage-strategic-review-ops.ts evaluate
 *   npx tsx scripts/manage-strategic-review-ops.ts rereview --review <id> --set --reason "Policy change" --role admin --actor admin-1
 *   npx tsx scripts/manage-strategic-review-ops.ts history --review <id>
 *   npx tsx scripts/manage-strategic-review-ops.ts report --json
 */

import {
  assignReviewWorkflow,
  unassignReviewWorkflow,
  updateReviewDueDate,
  setRereviewRequired,
  evaluateAllWorkflowOps,
  getWorkflowOpsRecord,
  listWorkflowOpsRecords,
  buildStrategicReviewWorkflowV3Report,
  formatWorkflowOpsRecord,
  formatWorkflowV3Report,
  useInMemoryStore,
} from "../lib/factory/strategic-review-workflow-v3";
import {
  initializeAllReviewWorkflows,
  useInMemoryStore as useWorkflowStore,
} from "../lib/factory/strategic-review-workflow";
import {
  useInMemoryStore as useGovernanceStore,
} from "../lib/factory/scenario-execution-governance";
import { resolveActorRole, type FactoryRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/manage-strategic-review-ops.ts <command> [options]

Commands:
  list                            List all ops records
  assign                          Assign reviewer to a review
  unassign                        Unassign reviewer from a review
  due                             Set due date for a review
  evaluate                        Evaluate SLA/escalation/rereview for all
  rereview                        Set or clear re-review requirement
  history                         Show ops history for a review
  report                          Show full operations report

Options:
  --review <reviewId>             Target review ID
  --assignee <actorId>            Assignee actor ID (for assign)
  --assignee-role <role>          Assignee role (for assign, default: reviewer)
  --date <iso-date>               Due date ISO string (for due)
  --set                           Set re-review (for rereview, omit to clear)
  --reason <reason>               Re-review reason
  --role <role>                   Actor role: owner, admin, reviewer, operator, viewer
  --actor <id>                    Actor ID
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/manage-strategic-review-ops.ts list
  npx tsx scripts/manage-strategic-review-ops.ts assign --review review-expand_reservation_3 --assignee reviewer-1 --role admin --actor admin-1
  npx tsx scripts/manage-strategic-review-ops.ts due --review review-expand_reservation_3 --date 2026-03-25T00:00:00Z --role admin --actor admin-1
  npx tsx scripts/manage-strategic-review-ops.ts evaluate
  npx tsx scripts/manage-strategic-review-ops.ts rereview --review review-expand_reservation_3 --set --reason "Policy change" --role admin --actor admin-1
  npx tsx scripts/manage-strategic-review-ops.ts report --json
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
  initializeAllReviewWorkflows();

  const command = args[0];
  const json = args.includes("--json");

  let reviewId: string | undefined;
  let assigneeId: string | undefined;
  let assigneeRole: string = "reviewer";
  let dueDate: string | undefined;
  let setFlag = false;
  let reason: string = "";
  let role: string = "admin";
  let actorId: string = "cli-user";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--review":
        reviewId = args[++i];
        break;
      case "--assignee":
        assigneeId = args[++i];
        break;
      case "--assignee-role":
        assigneeRole = args[++i];
        break;
      case "--date":
        dueDate = args[++i];
        break;
      case "--set":
        setFlag = true;
        break;
      case "--reason":
        reason = args[++i];
        break;
      case "--role":
        role = args[++i];
        break;
      case "--actor":
        actorId = args[++i];
        break;
    }
  }

  const actor = resolveActorRole(actorId, role as FactoryRole);

  switch (command) {
    case "list": {
      evaluateAllWorkflowOps();
      const records = listWorkflowOpsRecords();

      if (json) {
        console.log(JSON.stringify(records, null, 2));
      } else {
        console.log(`=== Workflow Operations (${records.length}) ===\n`);
        for (const r of records) {
          console.log(formatWorkflowOpsRecord(r));
          console.log("");
        }
      }
      break;
    }

    case "assign": {
      if (!reviewId || !assigneeId) {
        console.error("--review and --assignee are required");
        process.exit(1);
      }

      const result = assignReviewWorkflow(
        reviewId,
        { actorId: assigneeId, role: assigneeRole as FactoryRole },
        actor,
      );

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.success ? "Assignment successful" : `Assignment failed: ${result.reason}`);
        if (result.record) {
          console.log(formatWorkflowOpsRecord(result.record));
        }
      }
      break;
    }

    case "unassign": {
      if (!reviewId) {
        console.error("--review is required");
        process.exit(1);
      }

      const result = unassignReviewWorkflow(reviewId, actor);

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.success ? "Unassignment successful" : `Unassignment failed: ${result.reason}`);
      }
      break;
    }

    case "due": {
      if (!reviewId || !dueDate) {
        console.error("--review and --date are required");
        process.exit(1);
      }

      const result = updateReviewDueDate(reviewId, dueDate, actor);

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.success ? "Due date updated" : `Failed: ${result.reason}`);
        if (result.record) {
          console.log(formatWorkflowOpsRecord(result.record));
        }
      }
      break;
    }

    case "evaluate": {
      const records = evaluateAllWorkflowOps();

      if (json) {
        console.log(JSON.stringify(records, null, 2));
      } else {
        const overdue = records.filter((r) => r.slaStatus === "overdue");
        const dueSoon = records.filter((r) => r.slaStatus === "due_soon");
        const escalated = records.filter((r) => r.escalationStatus !== "none");
        const rereview = records.filter((r) => r.rereviewRequired);

        console.log("=== Workflow Operations Evaluation ===");
        console.log(`Total: ${records.length}`);
        console.log(`Overdue: ${overdue.length} | Due Soon: ${dueSoon.length}`);
        console.log(`Escalated: ${escalated.length} | Re-review: ${rereview.length}`);
        console.log("");
        for (const r of records) {
          console.log(formatWorkflowOpsRecord(r));
          console.log("");
        }
      }
      break;
    }

    case "rereview": {
      if (!reviewId) {
        console.error("--review is required");
        process.exit(1);
      }

      const result = setRereviewRequired(reviewId, setFlag, reason, actor);

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.success ? result.reason : `Failed: ${result.reason}`);
      }
      break;
    }

    case "history": {
      if (!reviewId) {
        console.error("--review is required");
        process.exit(1);
      }

      // Ensure record exists
      evaluateAllWorkflowOps();
      const record = getWorkflowOpsRecord(reviewId);

      if (!record) {
        console.error(`Record not found: ${reviewId}`);
        process.exit(1);
      }

      if (json) {
        console.log(JSON.stringify(record.opsHistory, null, 2));
      } else {
        console.log(`=== Ops History: ${reviewId} ===\n`);
        if (record.opsHistory.length === 0) {
          console.log("No history entries.");
        } else {
          for (const h of record.opsHistory) {
            console.log(`[${h.timestamp}] ${h.action} by ${h.actorId} (${h.role}): ${h.detail}`);
          }
        }
      }
      break;
    }

    case "report": {
      const report = buildStrategicReviewWorkflowV3Report();
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatWorkflowV3Report(report));
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
