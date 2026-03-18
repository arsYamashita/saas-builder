#!/usr/bin/env tsx
/**
 * CLI: Strategic Change Review Workflow
 *
 * Usage:
 *   npx tsx scripts/manage-strategic-review-workflow.ts list
 *   npx tsx scripts/manage-strategic-review-workflow.ts list --json
 *   npx tsx scripts/manage-strategic-review-workflow.ts transition --review review-expand_reservation_3 --to in_review --role reviewer --actor reviewer-1
 *   npx tsx scripts/manage-strategic-review-workflow.ts note --review review-expand_reservation_3 --message "Looks good" --role reviewer --actor reviewer-1
 *   npx tsx scripts/manage-strategic-review-workflow.ts history --review review-expand_reservation_3
 */

import {
  initializeAllReviewWorkflows,
  transitionReviewWorkflow,
  addReviewWorkflowNote,
  listReviewWorkflowHistory,
  getReviewWorkflow,
  buildStrategicReviewWorkflowReport,
  formatWorkflowRecord,
  formatWorkflowReport,
  useInMemoryStore,
  type WorkflowState,
} from "../lib/factory/strategic-review-workflow";
import { resolveActorRole, type FactoryRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/manage-strategic-review-workflow.ts <command> [options]

Commands:
  list                            List all review workflows
  transition                      Transition a review workflow to a new state
  note                            Add a note to a review workflow
  history                         Show transition/note history for a review

Options:
  --review <reviewId>             Review ID
  --to <state>                    Target state: pending, in_review, approved_candidate, approved_for_execution, deferred, rejected, archived
  --message <text>                Note message
  --role <role>                   Actor role: owner, admin, reviewer, operator, viewer
  --actor <id>                    Actor ID
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/manage-strategic-review-workflow.ts list
  npx tsx scripts/manage-strategic-review-workflow.ts transition --review review-expand_reservation_3 --to in_review --role reviewer --actor reviewer-1
  npx tsx scripts/manage-strategic-review-workflow.ts transition --review review-expand_reservation_3 --to approved_candidate --role admin --actor admin-1
  npx tsx scripts/manage-strategic-review-workflow.ts note --review review-expand_reservation_3 --message "Need more confidence" --role reviewer --actor reviewer-1
  npx tsx scripts/manage-strategic-review-workflow.ts history --review review-expand_reservation_3
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  // Enable in-memory store
  useInMemoryStore();

  const command = args[0];
  const json = args.includes("--json");

  let reviewId: string | undefined;
  let targetState: string | undefined;
  let message: string | undefined;
  let role: string = "admin";
  let actorId: string = "cli-user";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--review":
        reviewId = args[++i];
        break;
      case "--to":
        targetState = args[++i];
        break;
      case "--message":
        message = args[++i];
        break;
      case "--role":
        role = args[++i];
        break;
      case "--actor":
        actorId = args[++i];
        break;
    }
  }

  switch (command) {
    case "list": {
      // Initialize all workflows from review board
      initializeAllReviewWorkflows();

      const report = buildStrategicReviewWorkflowReport();
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatWorkflowReport(report));
      }
      break;
    }

    case "transition": {
      if (!reviewId) {
        console.error("Error: --review is required");
        process.exit(1);
      }
      if (!targetState) {
        console.error("Error: --to is required");
        process.exit(1);
      }

      // Initialize all workflows first so the target exists
      initializeAllReviewWorkflows();

      const actor = resolveActorRole(actorId, role as FactoryRole);
      const result = transitionReviewWorkflow(
        reviewId,
        targetState as WorkflowState,
        actor,
      );

      if (!result.success) {
        console.error(`BLOCKED: ${result.reasons.join("; ")}`);
        process.exit(1);
      }

      if (json) {
        console.log(JSON.stringify(result.workflow, null, 2));
      } else {
        console.log(`TRANSITIONED: ${reviewId} → ${targetState}`);
        console.log(`  Actor: ${actorId} (${role})`);
        if (result.workflow) {
          console.log(formatWorkflowRecord(result.workflow));
        }
      }
      break;
    }

    case "note": {
      if (!reviewId) {
        console.error("Error: --review is required");
        process.exit(1);
      }
      if (!message) {
        console.error("Error: --message is required");
        process.exit(1);
      }

      // Initialize all workflows first
      initializeAllReviewWorkflows();

      const actor = resolveActorRole(actorId, role as FactoryRole);
      const result = addReviewWorkflowNote(reviewId, actor, message);

      if (!result.success) {
        console.error(`BLOCKED: ${result.reason}`);
        process.exit(1);
      }

      if (json) {
        console.log(JSON.stringify(result.workflow, null, 2));
      } else {
        console.log(`NOTE ADDED: ${reviewId}`);
        console.log(`  By: ${actorId} (${role})`);
        console.log(`  Message: ${message}`);
      }
      break;
    }

    case "history": {
      if (!reviewId) {
        console.error("Error: --review is required");
        process.exit(1);
      }

      // Initialize all workflows first
      initializeAllReviewWorkflows();

      const history = listReviewWorkflowHistory(reviewId);
      if (!history) {
        console.error(`Workflow not found: ${reviewId}`);
        process.exit(1);
      }

      if (json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        const wf = getReviewWorkflow(reviewId);
        console.log(`=== History: ${reviewId} ===`);
        if (wf) {
          console.log(`Current State: ${wf.currentState}`);
        }
        console.log(`Transitions: ${history.transitions.length}`);
        for (const t of history.transitions) {
          console.log(`  ${t.from} → ${t.to} by ${t.actorId} (${t.role}) at ${t.timestamp}`);
        }
        if (history.notes.length > 0) {
          console.log(`Notes: ${history.notes.length}`);
          for (const n of history.notes) {
            console.log(`  [${n.actorId} (${n.role})] ${n.message} — ${n.timestamp}`);
          }
        }
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
