#!/usr/bin/env npx tsx
/**
 * Evaluate Template Health Governance
 *
 * CLI entry point to evaluate template health and print governance decisions.
 *
 * Usage:
 *   npx tsx scripts/evaluate-template-health.ts
 *   npx tsx scripts/evaluate-template-health.ts --template reservation_saas
 *   npx tsx scripts/evaluate-template-health.ts --json
 *   echo '<signals-json>' | npx tsx scripts/evaluate-template-health.ts --from-stdin
 *
 * When run without --from-stdin, generates sample evaluations for all
 * catalog templates based on their current statusBadge.
 */

import { TEMPLATE_CATALOG } from "../lib/templates/template-catalog";
import {
  evaluateTemplateHealth,
  evaluateAllTemplateHealth,
  formatGovernanceResult,
  formatGovernanceBatchReport,
  type TemplateHealthSignals,
  type TemplateHealthState,
  type GreenCriteria,
} from "../lib/factory/template-health-governance";

// ── Argument Parsing ─────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const fromStdin = args.includes("--from-stdin");
const templateIdx = args.indexOf("--template");
const filterTemplate = templateIdx !== -1 ? args[templateIdx + 1] : null;

// ── Helpers ──────────────────────────────────────────────────

function catalogStateToHealthState(statusBadge: "GREEN" | "DRAFT"): TemplateHealthState {
  return statusBadge === "GREEN" ? "green" : "candidate";
}

function makeDefaultGreenCriteria(isGreen: boolean): GreenCriteria {
  return {
    pipelineComplete: isGreen,
    qualityGatesPass: isGreen,
    baselinePass: isGreen,
    tenantIsolationVerified: isGreen,
    rbacVerified: isGreen,
    runtimeVerificationDone: isGreen,
  };
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (fromStdin) {
    // Read signals from stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const raw = Buffer.concat(chunks).toString("utf-8");
    const input = JSON.parse(raw) as Array<{
      templateKey: string;
      signals: TemplateHealthSignals;
    }>;

    const batch = evaluateAllTemplateHealth(input);

    if (jsonMode) {
      console.log(JSON.stringify(batch, null, 2));
    } else {
      console.log(formatGovernanceBatchReport(batch));
    }
    return;
  }

  // Default: evaluate catalog templates with assumed current state
  let catalog = TEMPLATE_CATALOG;
  if (filterTemplate) {
    catalog = catalog.filter((e) => e.templateKey === filterTemplate);
    if (catalog.length === 0) {
      console.error(`Template not found: ${filterTemplate}`);
      console.error(`Available: ${TEMPLATE_CATALOG.map((e) => e.templateKey).join(", ")}`);
      process.exit(1);
    }
  }

  const templates = catalog.map((entry) => {
    const currentState = catalogStateToHealthState(entry.statusBadge);
    const isGreen = entry.statusBadge === "GREEN";

    return {
      templateKey: entry.templateKey,
      signals: {
        currentState,
        greenCriteria: makeDefaultGreenCriteria(isGreen),
        recentRegressionStatuses: isGreen ? ["pass" as const] : [],
        latestRegressionStatus: isGreen ? ("pass" as const) : undefined,
        latestBaselinePassed: isGreen,
        latestQualityGatesPassed: isGreen,
      } satisfies TemplateHealthSignals,
    };
  });

  const batch = evaluateAllTemplateHealth(templates);

  if (jsonMode) {
    console.log(JSON.stringify(batch, null, 2));
  } else {
    console.log(formatGovernanceBatchReport(batch));
  }
}

main().catch((err) => {
  console.error("[evaluate-template-health] Error:", err);
  process.exit(1);
});
