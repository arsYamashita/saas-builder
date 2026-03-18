#!/usr/bin/env tsx
/**
 * CLI: Notification Escalation Rules v2
 *
 * Usage:
 *   npx tsx scripts/factory-notification-escalations.ts list
 *   npx tsx scripts/factory-notification-escalations.ts list --severity critical
 *   npx tsx scripts/factory-notification-escalations.ts list --level 2
 *   npx tsx scripts/factory-notification-escalations.ts evaluate
 *   npx tsx scripts/factory-notification-escalations.ts report --json
 */

import {
  evaluateNotificationEscalation,
  listNotificationEscalations,
  buildNotificationEscalationReport,
  formatNotificationEscalation,
  formatNotificationEscalationReport,
  useInMemoryStore,
  type EscalationLevel,
  type EscalationDecisionType,
} from "../lib/factory/notification-escalation-rules";
import type { NotificationSeverity } from "../lib/factory/notification-policy-layer";
import {
  emitFactoryEvent,
  useInMemoryStore as useHooksStore,
  resetCounters as resetHooksCounters,
} from "../lib/factory/external-automation-hooks";
import {
  useInMemoryStore as useNotificationStore,
  resetCounters as resetNotificationCounters,
} from "../lib/factory/notification-policy-layer";
import {
  useInMemoryStore as useWorkflowV3Store,
  updateReviewDueDate,
} from "../lib/factory/strategic-review-workflow-v3";
import {
  initializeAllReviewWorkflows,
  useInMemoryStore as useWorkflowStore,
} from "../lib/factory/strategic-review-workflow";
import {
  useInMemoryStore as useGovernanceStore,
} from "../lib/factory/scenario-execution-governance";
import {
  buildStrategicReviewBoard,
} from "../lib/factory/strategic-change-review-board";
import { resolveActorRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/factory-notification-escalations.ts <command> [options]

Commands:
  list                            List escalation decisions
  evaluate                        Evaluate all escalation rules
  report                          Show escalation report

Options:
  --severity <severity>           Filter: info, warning, high, critical
  --level <level>                 Filter: 0, 1, 2
  --event-type <type>             Filter by event type
  --decision <decision>           Filter: notify, suppress, renotify
  --limit <n>                     Limit results
  --demo                          Seed demo events for testing
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/factory-notification-escalations.ts evaluate --demo
  npx tsx scripts/factory-notification-escalations.ts list --severity critical
  npx tsx scripts/factory-notification-escalations.ts list --level 2
  npx tsx scripts/factory-notification-escalations.ts report --json
`);
}

function seedDemoEvents(): void {
  // Emit repeated runtime failures
  for (let i = 0; i < 3; i++) {
    emitFactoryEvent("runtime.job.failed", {
      scenarioId: "demo-scenario-1",
      reason: `Demo runtime failure ${i + 1}`,
    });
  }

  // Emit repeated governance alerts
  for (let i = 0; i < 2; i++) {
    emitFactoryEvent("governance.alert", {
      scenarioId: "demo-scenario-2",
      alertLevel: "blocked",
    });
  }

  // Emit blocked scenario
  emitFactoryEvent("scenario.execution.blocked", {
    scenarioId: "demo-scenario-3",
    reason: "Governance blocked",
  });

  // Set up overdue review
  const items = buildStrategicReviewBoard();
  initializeAllReviewWorkflows();

  if (items.length > 0) {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const actor = resolveActorRole("cli-user", "admin");
    updateReviewDueDate(items[0].reviewId, pastDate, actor);
  }

  console.log("Demo events seeded.\n");
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  // Initialize stores
  useInMemoryStore();
  useHooksStore();
  useNotificationStore();
  useWorkflowV3Store();
  useWorkflowStore();
  useGovernanceStore();
  resetHooksCounters();
  resetNotificationCounters();

  const command = args[0];
  const json = args.includes("--json");
  const demo = args.includes("--demo");

  let severity: NotificationSeverity | undefined;
  let level: EscalationLevel | undefined;
  let eventType: string | undefined;
  let decision: EscalationDecisionType | undefined;
  let limit: number | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--severity":
        severity = args[++i] as NotificationSeverity;
        break;
      case "--level":
        level = Number(args[++i]) as EscalationLevel;
        break;
      case "--event-type":
        eventType = args[++i];
        break;
      case "--decision":
        decision = args[++i] as EscalationDecisionType;
        break;
      case "--limit":
        limit = Number(args[++i]);
        break;
    }
  }

  if (demo) {
    seedDemoEvents();
  }

  switch (command) {
    case "list": {
      evaluateNotificationEscalation();
      const escalations = listNotificationEscalations({
        severity,
        level,
        eventType: eventType as any,
        decision,
        limit,
      });

      if (json) {
        console.log(JSON.stringify(escalations, null, 2));
      } else {
        console.log(`=== Notification Escalations (${escalations.length}) ===\n`);
        for (const e of escalations) {
          console.log(formatNotificationEscalation(e));
          console.log("");
        }
      }
      break;
    }

    case "evaluate": {
      const escalations = evaluateNotificationEscalation();

      if (json) {
        console.log(JSON.stringify(escalations, null, 2));
      } else {
        const l1 = escalations.filter((e) => e.escalationLevel === 1);
        const l2 = escalations.filter((e) => e.escalationLevel === 2);
        const critical = escalations.filter((e) => e.severity === "critical");

        console.log("=== Notification Escalation Evaluation ===");
        console.log(`Total: ${escalations.length}`);
        console.log(`Level 1: ${l1.length} | Level 2: ${l2.length}`);
        console.log(`Critical: ${critical.length}`);
        console.log("");

        for (const e of escalations) {
          console.log(formatNotificationEscalation(e));
          console.log("");
        }
      }
      break;
    }

    case "report": {
      const report = buildNotificationEscalationReport();

      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatNotificationEscalationReport(report));
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
