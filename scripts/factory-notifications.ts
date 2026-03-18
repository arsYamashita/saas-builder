#!/usr/bin/env tsx
/**
 * CLI: Notification Policy Layer
 *
 * Usage:
 *   npx tsx scripts/factory-notifications.ts list
 *   npx tsx scripts/factory-notifications.ts list --severity high
 *   npx tsx scripts/factory-notifications.ts list --decision notify
 *   npx tsx scripts/factory-notifications.ts evaluate --event evt-20260318-001
 *   npx tsx scripts/factory-notifications.ts report
 *   npx tsx scripts/factory-notifications.ts list --json
 */

import {
  evaluateNotificationPolicy,
  evaluateAllNotificationPolicies,
  listNotificationDecisions,
  getNotificationDecisionByEventId,
  buildNotificationPolicyReport,
  formatNotificationDecision,
  formatNotificationPolicyReport,
  useInMemoryStore,
  type NotificationSeverity,
  type NotificationDecisionType,
} from "../lib/factory/notification-policy-layer";
import {
  emitFactoryEvent,
  listFactoryEvents,
  useInMemoryStore as useHooksStore,
  type FactoryEventType,
} from "../lib/factory/external-automation-hooks";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/factory-notifications.ts <command> [options]

Commands:
  list                            List notification decisions
  evaluate                        Evaluate notification policy for an event
  report                          Show full notification policy report

Options:
  --severity <level>              Filter: info, warning, high, critical
  --decision <type>               Filter: notify, suppress, queue
  --event <eventId>               Event ID to evaluate
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/factory-notifications.ts list
  npx tsx scripts/factory-notifications.ts list --severity high
  npx tsx scripts/factory-notifications.ts list --decision notify
  npx tsx scripts/factory-notifications.ts evaluate --event evt-20260318-001
  npx tsx scripts/factory-notifications.ts report --json
`);
}

function seedDemoEvents(): void {
  emitFactoryEvent("scenario.execution.blocked", { scenarioId: "expand_reservation_3", status: "blocked" });
  emitFactoryEvent("runtime.job.failed", { jobId: "nightly_regression", error: "timeout" });
  emitFactoryEvent("governance.alert", { level: "high", message: "Governance threshold exceeded" });
  emitFactoryEvent("scenario.review.ready", { scenarioId: "gap_fill_support", priority: 0.85 });
  emitFactoryEvent("template.release.promoted", { templateKey: "reservation_saas", stage: "staging" });
  emitFactoryEvent("scenario.execution.completed", { scenarioId: "stabilize_crm", priority: 0.2 });
  emitFactoryEvent("marketplace.template.published", { templateKey: "invoice_saas" });
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  useInMemoryStore();
  useHooksStore();

  const command = args[0];
  const json = args.includes("--json");

  let severity: string | undefined;
  let decision: string | undefined;
  let eventId: string | undefined;

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--severity":
        severity = args[++i];
        break;
      case "--decision":
        decision = args[++i];
        break;
      case "--event":
        eventId = args[++i];
        break;
    }
  }

  switch (command) {
    case "list": {
      // Seed and evaluate demo events
      seedDemoEvents();
      evaluateAllNotificationPolicies();

      const decisions = listNotificationDecisions({
        severity: severity as NotificationSeverity | undefined,
        decision: decision as NotificationDecisionType | undefined,
      });

      if (json) {
        console.log(JSON.stringify(decisions, null, 2));
      } else {
        console.log("=== Notification Decisions ===");
        console.log(`Total: ${decisions.length}`);
        console.log("");
        for (const d of decisions) {
          console.log(formatNotificationDecision(d));
          console.log("");
        }
      }
      break;
    }

    case "evaluate": {
      if (!eventId) {
        console.error("Error: --event is required");
        process.exit(1);
      }

      // Seed demo events
      seedDemoEvents();

      const events = listFactoryEvents();
      const event = events.find((e) => e.eventId === eventId);
      if (!event) {
        console.error(`Event not found: ${eventId}`);
        console.log(`Available events: ${events.map((e) => e.eventId).join(", ")}`);
        process.exit(1);
      }

      const d = evaluateNotificationPolicy(event);

      if (json) {
        console.log(JSON.stringify(d, null, 2));
      } else {
        console.log(formatNotificationDecision(d));
      }
      break;
    }

    case "report": {
      // Seed and evaluate demo events
      seedDemoEvents();
      evaluateAllNotificationPolicies();

      const report = buildNotificationPolicyReport();
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatNotificationPolicyReport(report));
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
