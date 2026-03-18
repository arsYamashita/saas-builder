#!/usr/bin/env tsx
/**
 * CLI: Factory Runtime Execution
 *
 * Usage:
 *   npx tsx scripts/run-factory-runtime.ts plan
 *   npx tsx scripts/run-factory-runtime.ts plan --group nightly
 *   npx tsx scripts/run-factory-runtime.ts run --group nightly --role admin --actor admin-1
 *   npx tsx scripts/run-factory-runtime.ts run --job governance_evaluation
 *   npx tsx scripts/run-factory-runtime.ts run --group health_check --json
 *   npx tsx scripts/run-factory-runtime.ts history
 *   npx tsx scripts/run-factory-runtime.ts history --json
 */

import {
  planRuntimeExecution,
  executeRuntimeRun,
  listRuntimeHistory,
  buildRuntimeExecutionReport,
  formatRuntimeExecutionRun,
  formatRuntimeExecutionReport,
  ALL_GROUPS,
  type RuntimeJobGroup,
} from "../lib/factory/factory-runtime-execution";
import {
  resolveActorRole,
  ALL_ROLES,
  type FactoryRole,
} from "../lib/factory/team-role-approval";
import type { OrchestrationJobId } from "../lib/factory/factory-orchestration";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/run-factory-runtime.ts <command> [options]

Commands:
  plan                             Preview execution plan (dry-run)
  run                              Execute jobs with real executors
  history                          Show execution history
  report                           Show execution report

Options:
  --job <jobId>                    Run a specific job
  --group <group>                  Run a job group (${ALL_GROUPS.join(", ")})
  --role <role>                    Actor role (default: admin)
  --actor <id>                     Actor ID (default: "cli")
  --json                           Output as JSON
  --help                           Show this help

Examples:
  npx tsx scripts/run-factory-runtime.ts plan
  npx tsx scripts/run-factory-runtime.ts plan --group health_check
  npx tsx scripts/run-factory-runtime.ts run --group nightly --role admin --actor admin-1
  npx tsx scripts/run-factory-runtime.ts run --job governance_evaluation
  npx tsx scripts/run-factory-runtime.ts history --json
  npx tsx scripts/run-factory-runtime.ts report
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

  let jobId: OrchestrationJobId | undefined;
  let group: RuntimeJobGroup | undefined;
  let role: FactoryRole = "admin";
  let actorId = "cli";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--job":
        jobId = args[++i] as OrchestrationJobId;
        break;
      case "--group": {
        const val = args[++i];
        if (val && ALL_GROUPS.includes(val as RuntimeJobGroup)) {
          group = val as RuntimeJobGroup;
        } else {
          console.error(`Error: --group must be one of: ${ALL_GROUPS.join(", ")}`);
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
    }
  }

  const actor = resolveActorRole(actorId, role);

  switch (command) {
    case "plan": {
      const plan = planRuntimeExecution({
        jobIds: jobId ? [jobId] : undefined,
        group,
        actor,
      });
      if (json) {
        console.log(JSON.stringify(plan, null, 2));
      } else {
        console.log(formatRuntimeExecutionRun(plan));
      }
      break;
    }
    case "run": {
      const run = executeRuntimeRun({
        jobIds: jobId ? [jobId] : undefined,
        group,
        actor,
      });
      if (json) {
        console.log(JSON.stringify(run, null, 2));
      } else {
        console.log(formatRuntimeExecutionRun(run));
      }
      break;
    }
    case "history": {
      const history = listRuntimeHistory();
      if (json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        if (history.length === 0) {
          console.log("実行履歴はありません。");
        } else {
          console.log("RUNTIME EXECUTION HISTORY:");
          for (const h of history) {
            const badge =
              h.status === "completed" ? "[COMPLETED]" :
              h.status === "failed" ? "[FAILED]" :
              "[PARTIAL]";
            const groupStr = h.group ? ` (${h.group})` : "";
            console.log(
              `  ${h.startedAt}  ${badge}  ` +
              `${h.completedJobs}/${h.totalJobs} completed${groupStr}  ` +
              `(${h.executedBy})`,
            );
          }
        }
      }
      break;
    }
    case "report": {
      const report = buildRuntimeExecutionReport();
      if (json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatRuntimeExecutionReport(report));
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
