#!/usr/bin/env tsx
/**
 * CLI: Factory Orchestration
 *
 * Usage:
 *   npx tsx scripts/run-factory-orchestration.ts list
 *   npx tsx scripts/run-factory-orchestration.ts plan
 *   npx tsx scripts/run-factory-orchestration.ts plan --jobs governance_evaluation,nightly_regression
 *   npx tsx scripts/run-factory-orchestration.ts run
 *   npx tsx scripts/run-factory-orchestration.ts run --jobs governance_evaluation
 *   npx tsx scripts/run-factory-orchestration.ts history
 *   npx tsx scripts/run-factory-orchestration.ts history --json
 */

import {
  listJobs,
  planOrchestrationRun,
  executeOrchestrationRun,
  listOrchestrationHistory,
  buildOrchestrationReport,
  formatOrchestrationReport,
  formatOrchestrationPlan,
  formatOrchestrationResult,
  type OrchestrationJobId,
} from "../lib/factory/factory-orchestration";
import {
  resolveActorRole,
  ALL_ROLES,
  type FactoryRole,
} from "../lib/factory/team-role-approval";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList(json: boolean): void {
  const jobs = listJobs();
  if (json) {
    console.log(JSON.stringify(jobs, null, 2));
  } else {
    console.log("REGISTERED FACTORY JOBS:");
    for (const job of jobs) {
      const deps = job.dependsOn.length > 0
        ? ` (depends: ${job.dependsOn.join(", ")})`
        : "";
      console.log(`  [${job.jobId}] ${job.label}${deps}`);
      console.log(`    ${job.description}  ${job.estimatedDuration}`);
    }
  }
}

function cmdPlan(
  jobIds: OrchestrationJobId[] | undefined,
  role: FactoryRole,
  actorId: string,
  json: boolean,
): void {
  const actor = resolveActorRole(actorId, role);
  const plan = planOrchestrationRun({ jobIds, actor });

  if (json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(formatOrchestrationPlan(plan));
  }
}

function cmdRun(
  jobIds: OrchestrationJobId[] | undefined,
  role: FactoryRole,
  actorId: string,
  json: boolean,
): void {
  const actor = resolveActorRole(actorId, role);
  const result = executeOrchestrationRun({ jobIds, actor });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatOrchestrationResult(result));
  }
}

function cmdHistory(json: boolean): void {
  const history = listOrchestrationHistory();
  if (json) {
    console.log(JSON.stringify(history, null, 2));
  } else {
    if (history.length === 0) {
      console.log("オーケストレーション履歴はありません。");
    } else {
      const report = buildOrchestrationReport();
      console.log(formatOrchestrationReport(report));
    }
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/run-factory-orchestration.ts <command> [options]

Commands:
  list                           List all registered jobs
  plan                           Generate a dry-run plan
  run                            Execute orchestration run
  history                        Show orchestration run history

Options:
  --jobs <id,id,...>             Run only specific jobs (comma-separated)
  --role <role>                  Actor role (default: admin)
  --actor <id>                   Actor ID (default: "cli")
  --json                         Output as JSON
  --help                         Show this help

Examples:
  npx tsx scripts/run-factory-orchestration.ts list
  npx tsx scripts/run-factory-orchestration.ts plan
  npx tsx scripts/run-factory-orchestration.ts plan --jobs governance_evaluation,nightly_regression
  npx tsx scripts/run-factory-orchestration.ts run
  npx tsx scripts/run-factory-orchestration.ts run --jobs governance_evaluation
  npx tsx scripts/run-factory-orchestration.ts history --json
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

  let jobIds: OrchestrationJobId[] | undefined;
  let role: FactoryRole = "admin";
  let actorId = "cli";

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--jobs": {
        const val = args[++i];
        if (val) {
          jobIds = val.split(",") as OrchestrationJobId[];
        }
        break;
      }
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
    case "list":
      cmdList(json);
      break;
    case "plan":
      cmdPlan(jobIds, role, actorId, json);
      break;
    case "run":
      cmdRun(jobIds, role, actorId, json);
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
