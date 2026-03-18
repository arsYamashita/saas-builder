#!/usr/bin/env tsx
/**
 * CLI: External Automation Hooks
 *
 * Usage:
 *   npx tsx scripts/factory-hooks.ts events
 *   npx tsx scripts/factory-hooks.ts events --json
 *   npx tsx scripts/factory-hooks.ts trigger --type scenario.preview --scenario expand_reservation_3 --role reviewer --actor reviewer-1
 *   npx tsx scripts/factory-hooks.ts trigger --type scenario.execute --scenario expand_reservation_3 --role admin --actor admin-1
 *   npx tsx scripts/factory-hooks.ts trigger --type runtime.run_group --group nightly --role admin --actor admin-1
 *   npx tsx scripts/factory-hooks.ts trigger --type export.generate --target kpis --format json --role viewer --actor viewer-1
 *   npx tsx scripts/factory-hooks.ts report
 */

import {
  listFactoryEvents,
  listTriggerRequests,
  executeInboundTrigger,
  buildAutomationHooksReport,
  formatFactoryEvent,
  formatTriggerRequest,
  formatAutomationHooksReport,
  useInMemoryStore,
  emitFactoryEvent,
  type TriggerType,
} from "../lib/factory/external-automation-hooks";
import {
  useInMemoryStore as useGovernanceStore,
} from "../lib/factory/scenario-execution-governance";
import {
  useInMemoryStore as useBridgeStore,
} from "../lib/factory/scenario-execution-bridge";
import {
  useInMemoryStore as useRuntimeStore,
} from "../lib/factory/factory-runtime-execution";
import { resolveActorRole, type FactoryRole } from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/factory-hooks.ts <command> [options]

Commands:
  events                          List recent factory events
  triggers                        List recent trigger requests
  trigger                         Execute an inbound trigger
  report                          Show full automation hooks report

Options:
  --type <triggerType>             Trigger type: runtime.run_group, scenario.preview, scenario.execute, export.generate
  --scenario <id>                 Scenario ID (for scenario triggers)
  --group <name>                  Runtime group: nightly, health_check, marketplace_refresh
  --target <name>                 Export target: marketplace, releases, ranking, recommendations, portfolio, scenarios, kpis
  --format <fmt>                  Export format: json, csv
  --role <role>                   Actor role: owner, admin, reviewer, operator, viewer
  --actor <id>                    Actor ID
  --json                          Output as JSON
  --help                          Show this help

Examples:
  npx tsx scripts/factory-hooks.ts events
  npx tsx scripts/factory-hooks.ts trigger --type scenario.preview --scenario expand_reservation_3 --role reviewer --actor reviewer-1
  npx tsx scripts/factory-hooks.ts trigger --type runtime.run_group --group nightly --role admin --actor admin-1
  npx tsx scripts/factory-hooks.ts trigger --type export.generate --target kpis --format json --role viewer --actor viewer-1
  npx tsx scripts/factory-hooks.ts report --json
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
  useGovernanceStore();
  useBridgeStore();
  useRuntimeStore();

  const command = args[0];
  const json = args.includes("--json");

  let triggerType: string | undefined;
  let scenarioId: string | undefined;
  let group: string | undefined;
  let target: string | undefined;
  let format: string | undefined;
  let role: string = "admin";
  let actorId: string = "cli-user";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--type":
        triggerType = args[++i];
        break;
      case "--scenario":
        scenarioId = args[++i];
        break;
      case "--group":
        group = args[++i];
        break;
      case "--target":
        target = args[++i];
        break;
      case "--format":
        format = args[++i];
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
    case "events": {
      // Seed some demo events for CLI demo
      emitFactoryEvent("scenario.review.ready", { scenarioId: "demo_scenario", status: "ready" });
      emitFactoryEvent("governance.alert", { message: "Governance check triggered" });

      const events = listFactoryEvents();
      if (json) {
        console.log(JSON.stringify(events, null, 2));
      } else {
        console.log("=== Recent Factory Events ===");
        console.log(`Total: ${events.length}`);
        console.log("");
        for (const e of events) {
          console.log(formatFactoryEvent(e));
          console.log("");
        }
      }
      break;
    }

    case "triggers": {
      const triggers = listTriggerRequests();
      if (json) {
        console.log(JSON.stringify(triggers, null, 2));
      } else {
        console.log("=== Recent Trigger Requests ===");
        console.log(`Total: ${triggers.length}`);
        console.log("");
        for (const t of triggers) {
          console.log(formatTriggerRequest(t));
          console.log("");
        }
      }
      break;
    }

    case "trigger": {
      if (!triggerType) {
        console.error("Error: --type is required");
        process.exit(1);
      }

      const parameters: Record<string, unknown> = {};
      if (scenarioId) parameters.scenarioId = scenarioId;
      if (group) parameters.group = group;
      if (target) parameters.target = target;
      if (format) parameters.format = format;

      const actor = resolveActorRole(actorId, role as FactoryRole);
      const result = executeInboundTrigger(
        triggerType as TriggerType,
        actor,
        parameters,
      );

      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`${result.status.toUpperCase()}: ${result.triggerType}`);
        console.log(`  Trigger ID: ${result.triggerId}`);
        console.log(`  Actor: ${result.requestedBy.actorId} (${result.requestedBy.role})`);
        console.log(`  Timestamp: ${result.requestedAt}`);
        if (result.reasons.length > 0) {
          console.log(`  Reason: ${result.reasons[0]}`);
        }
        if (result.resultPayload) {
          console.log(`  Result: ${JSON.stringify(result.resultPayload)}`);
        }
        if (result.emittedEventIds.length > 0) {
          console.log(`  Emitted Events: ${result.emittedEventIds.join(", ")}`);
        }
      }
      break;
    }

    case "report": {
      // Seed some demo data
      emitFactoryEvent("scenario.review.ready", { scenarioId: "demo_scenario" });
      const actor = resolveActorRole(actorId, role as FactoryRole);
      executeInboundTrigger("export.generate", actor, { target: "kpis" });

      const report = buildAutomationHooksReport();
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatAutomationHooksReport(report));
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
