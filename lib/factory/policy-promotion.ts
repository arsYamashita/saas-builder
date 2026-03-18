/**
 * Multi-Environment Policy Promotion v1
 *
 * Promotes approved/applied policy changes across environments:
 *   dev → staging → prod
 *
 * Each environment has its own policy artifact file.
 * Promotion is explicit, deterministic, and auditable.
 * No auto-promote. No environment skipping.
 *
 * Policy artifacts:  data/factory-policy.{env}.json
 * Promotion history: data/promotion-history.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyEnvironment = "dev" | "staging" | "prod";

export type PromotionPlanStatus =
  | "ready"
  | "promoted"
  | "skipped"
  | "failed"
  | "rolled_back";

export interface PromotionPlan {
  promotionId: string;
  planId: string;
  proposalId: string;
  fromEnv: PolicyEnvironment;
  toEnv: PolicyEnvironment;
  targetFile: string;
  key: string;
  currentValue: number | string | null;
  promotedValue: number | string | null;
  status: PromotionPlanStatus;
  skipReason?: string;
}

export interface PromotionHistoryEntry {
  promotionId: string;
  proposalId: string;
  planId: string;
  fromEnv: PolicyEnvironment;
  toEnv: PolicyEnvironment;
  appliedAt: string;
  appliedBy: string;
  status: "promoted" | "failed" | "rolled_back";
  before: number | string | null;
  after: number | string | null;
}

export interface PromotionRollbackAction {
  targetFile: string;
  key: string;
  restoreValue: number | string | null;
}

export interface PromotionRollbackMetadata {
  promotionId: string;
  proposalId: string;
  rollbackAction: PromotionRollbackAction;
}

export interface PromotionReport {
  plans: PromotionPlan[];
  history: PromotionHistoryEntry[];
  rollbacks: PromotionRollbackMetadata[];
  summary: {
    totalPlans: number;
    readyCount: number;
    promotedCount: number;
    skippedCount: number;
    failedCount: number;
    rolledBackCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Policy data shape (same as adoption engine)
// ---------------------------------------------------------------------------

type PolicyData = Record<string, Record<string, number | string | null>>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_ENVIRONMENTS: PolicyEnvironment[] = ["dev", "staging", "prod"];

/** Allowed promotion transitions — no skipping. */
const PROMOTION_PATH: Record<PolicyEnvironment, PolicyEnvironment | null> = {
  dev: "staging",
  staging: "prod",
  prod: null,
};

const DATA_DIR = join(process.cwd(), "data");
const PROMOTION_HISTORY_PATH = join(DATA_DIR, "promotion-history.json");

// ---------------------------------------------------------------------------
// In-memory store (for testing)
// ---------------------------------------------------------------------------

interface MemoryState {
  envPolicies: Record<PolicyEnvironment, PolicyData>;
  history: PromotionHistoryEntry[];
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(
  initial?: Partial<MemoryState>,
): void {
  memoryState = {
    envPolicies: initial?.envPolicies ?? { dev: {}, staging: {}, prod: {} },
    history: initial?.history ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Resolve the policy file path for a given environment.
 */
export function resolveEnvironmentPolicyFile(env: PolicyEnvironment): string {
  return `data/factory-policy.${env}.json`;
}

function resolveAbsolutePolicyPath(env: PolicyEnvironment): string {
  return join(DATA_DIR, `factory-policy.${env}.json`);
}

function readEnvPolicy(env: PolicyEnvironment): PolicyData {
  if (memoryState !== null) return memoryState.envPolicies[env];
  try {
    const raw = readFileSync(resolveAbsolutePolicyPath(env), "utf-8");
    return JSON.parse(raw) as PolicyData;
  } catch {
    return {};
  }
}

function writeEnvPolicy(env: PolicyEnvironment, policy: PolicyData): void {
  if (memoryState !== null) {
    memoryState.envPolicies[env] = policy;
    return;
  }
  ensureDataDir();
  writeFileSync(
    resolveAbsolutePolicyPath(env),
    JSON.stringify(policy, null, 2),
    "utf-8",
  );
}

function readPromotionHistoryStore(): PromotionHistoryEntry[] {
  if (memoryState !== null) return memoryState.history;
  try {
    const raw = readFileSync(PROMOTION_HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as PromotionHistoryEntry[];
  } catch {
    return [];
  }
}

function writePromotionHistoryStore(entries: PromotionHistoryEntry[]): void {
  if (memoryState !== null) {
    memoryState.history = entries;
    return;
  }
  ensureDataDir();
  writeFileSync(
    PROMOTION_HISTORY_PATH,
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getPolicyValue(
  policy: PolicyData,
  configKey: string,
): number | string | null {
  const [subsystem, ...rest] = configKey.split(".");
  const actionKey = rest.join(".");
  if (!subsystem || !actionKey) return null;
  return policy[subsystem]?.[actionKey] ?? null;
}

function setPolicyValue(
  policy: PolicyData,
  configKey: string,
  value: number | string | null,
): void {
  const [subsystem, ...rest] = configKey.split(".");
  const actionKey = rest.join(".");
  if (!subsystem || !actionKey) return;
  if (!policy[subsystem]) {
    policy[subsystem] = {};
  }
  policy[subsystem]![actionKey] = value;
}

function isValidTransition(
  from: PolicyEnvironment,
  to: PolicyEnvironment,
): boolean {
  return PROMOTION_PATH[from] === to;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect changes from the source environment that are eligible for promotion.
 * Returns all key/value pairs present in the source environment policy.
 */
export function collectPromotableChanges(
  fromEnv: PolicyEnvironment,
): Array<{ key: string; value: number | string | null }> {
  const policy = readEnvPolicy(fromEnv);
  const changes: Array<{ key: string; value: number | string | null }> = [];

  for (const [subsystem, entries] of Object.entries(policy)) {
    for (const [actionKey, value] of Object.entries(entries)) {
      changes.push({ key: `${subsystem}.${actionKey}`, value });
    }
  }

  return changes;
}

/**
 * Build deterministic promotion plans for all promotable changes
 * from one environment to the next.
 */
export function buildPromotionPlans(
  fromEnv: PolicyEnvironment,
  toEnv: PolicyEnvironment,
  options?: { proposalId?: string },
): PromotionPlan[] {
  const plans: PromotionPlan[] = [];

  // Validate transition
  if (!isValidTransition(fromEnv, toEnv)) {
    // Return a single skipped plan indicating invalid path
    return [{
      promotionId: `promote-invalid-${fromEnv}-to-${toEnv}`,
      planId: "n/a",
      proposalId: "n/a",
      fromEnv,
      toEnv,
      targetFile: resolveEnvironmentPolicyFile(toEnv),
      key: "n/a",
      currentValue: null,
      promotedValue: null,
      status: "skipped",
      skipReason: `Direct promotion from ${fromEnv} to ${toEnv} is not allowed. Path: dev → staging → prod`,
    }];
  }

  const sourcePolicy = readEnvPolicy(fromEnv);
  const targetPolicy = readEnvPolicy(toEnv);
  const targetFile = resolveEnvironmentPolicyFile(toEnv);

  for (const [subsystem, entries] of Object.entries(sourcePolicy)) {
    for (const [actionKey, sourceValue] of Object.entries(entries)) {
      const configKey = `${subsystem}.${actionKey}`;

      // Derive proposalId and planId from the config key
      const proposalId = `${subsystem}-${actionKey}`.replace(/_/g, "-");
      const planId = `adopt-${proposalId}`;

      // Filter by proposalId if specified
      if (options?.proposalId && proposalId !== options.proposalId) {
        continue;
      }

      const promotionId = `promote-${proposalId}-${fromEnv}-to-${toEnv}`;
      const targetValue = getPolicyValue(targetPolicy, configKey);

      // Check if target already has the same value
      const alreadyEqual =
        targetValue !== null &&
        String(targetValue) === String(sourceValue);

      plans.push({
        promotionId,
        planId,
        proposalId,
        fromEnv,
        toEnv,
        targetFile,
        key: configKey,
        currentValue: targetValue,
        promotedValue: sourceValue,
        status: alreadyEqual ? "skipped" : "ready",
        ...(alreadyEqual
          ? { skipReason: "Target environment already has the same value" }
          : {}),
      });
    }
  }

  return plans;
}

/**
 * Preview promotion plans without applying any changes (dry-run).
 * Guarantees no mutation.
 */
export function previewPromotionPlans(
  fromEnv: PolicyEnvironment,
  toEnv: PolicyEnvironment,
  options?: { proposalId?: string },
): PromotionPlan[] {
  return buildPromotionPlans(fromEnv, toEnv, options);
}

/**
 * Apply ready promotion plans to the target environment.
 * Only "ready" plans are promoted. Source is never mutated.
 */
export function applyPromotionPlans(
  fromEnv: PolicyEnvironment,
  toEnv: PolicyEnvironment,
  options: {
    proposalId?: string;
    appliedBy?: string;
  } = {},
): {
  promoted: PromotionPlan[];
  skipped: PromotionPlan[];
  history: PromotionHistoryEntry[];
} {
  const appliedBy = options.appliedBy ?? "user";
  const plans = buildPromotionPlans(fromEnv, toEnv, {
    proposalId: options.proposalId,
  });

  const targetPolicy = readEnvPolicy(toEnv);
  const historyStore = readPromotionHistoryStore();
  const promoted: PromotionPlan[] = [];
  const skipped: PromotionPlan[] = [];
  const newHistory: PromotionHistoryEntry[] = [];

  for (const plan of plans) {
    if (plan.status !== "ready") {
      skipped.push(plan);
      continue;
    }

    // Write to target policy
    setPolicyValue(targetPolicy, plan.key, plan.promotedValue);

    plan.status = "promoted";
    promoted.push(plan);

    const entry: PromotionHistoryEntry = {
      promotionId: plan.promotionId,
      proposalId: plan.proposalId,
      planId: plan.planId,
      fromEnv: plan.fromEnv,
      toEnv: plan.toEnv,
      appliedAt: new Date().toISOString(),
      appliedBy,
      status: "promoted",
      before: plan.currentValue,
      after: plan.promotedValue,
    };
    newHistory.push(entry);
    historyStore.push(entry);
  }

  writeEnvPolicy(toEnv, targetPolicy);
  writePromotionHistoryStore(historyStore);

  return { promoted, skipped, history: newHistory };
}

/**
 * Return promotion history entries.
 */
export function listPromotionHistory(): PromotionHistoryEntry[] {
  return readPromotionHistoryStore();
}

/**
 * Generate rollback metadata for promoted plans.
 */
export function buildPromotionRollbackMetadata(
  plans?: PromotionPlan[],
): PromotionRollbackMetadata[] {
  const rollbacks: PromotionRollbackMetadata[] = [];

  if (plans) {
    for (const plan of plans) {
      if (plan.status !== "promoted") continue;
      rollbacks.push({
        promotionId: plan.promotionId,
        proposalId: plan.proposalId,
        rollbackAction: {
          targetFile: plan.targetFile,
          key: plan.key,
          restoreValue: plan.currentValue,
        },
      });
    }
  } else {
    const history = readPromotionHistoryStore();
    for (const entry of history) {
      if (entry.status !== "promoted") continue;
      rollbacks.push({
        promotionId: entry.promotionId,
        proposalId: entry.proposalId,
        rollbackAction: {
          targetFile: resolveEnvironmentPolicyFile(entry.toEnv),
          key: `${entry.proposalId.replace(/-/g, "_").replace(/_([^_]+)$/, ".$1")}`,
          restoreValue: entry.before,
        },
      });
    }
  }

  return rollbacks;
}

/**
 * Build a complete promotion report.
 */
export function buildPromotionReport(
  fromEnv?: PolicyEnvironment,
  toEnv?: PolicyEnvironment,
): PromotionReport {
  const plans =
    fromEnv && toEnv ? buildPromotionPlans(fromEnv, toEnv) : [];
  const history = listPromotionHistory();
  const rollbacks = buildPromotionRollbackMetadata(
    plans.filter((p) => p.status === "promoted"),
  );

  const summary = {
    totalPlans: plans.length,
    readyCount: plans.filter((p) => p.status === "ready").length,
    promotedCount: plans.filter((p) => p.status === "promoted").length,
    skippedCount: plans.filter((p) => p.status === "skipped").length,
    failedCount: plans.filter((p) => p.status === "failed").length,
    rolledBackCount: plans.filter((p) => p.status === "rolled_back").length,
  };

  return {
    plans,
    history,
    rollbacks,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting (console output)
// ---------------------------------------------------------------------------

function statusBadge(status: PromotionPlanStatus): string {
  const badges: Record<PromotionPlanStatus, string> = {
    ready: "[READY]",
    promoted: "[PROMOTED]",
    skipped: "[SKIPPED]",
    failed: "[FAILED]",
    rolled_back: "[ROLLED_BACK]",
  };
  return badges[status];
}

export function formatPromotionReport(report: PromotionReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  POLICY PROMOTION REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalPlans}  |  ` +
    `Ready: ${report.summary.readyCount}  |  ` +
    `Promoted: ${report.summary.promotedCount}  |  ` +
    `Skipped: ${report.summary.skippedCount}  |  ` +
    `Failed: ${report.summary.failedCount}`,
  );
  lines.push("");

  if (report.plans.length === 0) {
    lines.push("  プロモーション対象はありません。");
  } else {
    for (const plan of report.plans) {
      lines.push(
        `  ${statusBadge(plan.status)} ${plan.promotionId}`,
      );
      lines.push(`    proposal:  ${plan.proposalId}`);
      lines.push(`    path:      ${plan.fromEnv} → ${plan.toEnv}`);
      lines.push(`    target:    ${plan.targetFile}`);
      lines.push(
        `    diff:      ${plan.key}: ${plan.currentValue ?? "(unset)"} → ${plan.promotedValue}`,
      );
      if (plan.skipReason) {
        lines.push(`    reason:    ${plan.skipReason}`);
      }
      lines.push("");
    }
  }

  if (report.history.length > 0) {
    lines.push(hr);
    lines.push("  PROMOTION HISTORY");
    lines.push(hr);
    for (const h of report.history) {
      lines.push(
        `  ${h.appliedAt}  ${h.promotionId}  ${h.status.toUpperCase()}  (${h.appliedBy})`,
      );
      lines.push(`    ${h.fromEnv} → ${h.toEnv}  ${h.before ?? "(unset)"} → ${h.after}`);
    }
    lines.push("");
  }

  if (report.rollbacks.length > 0) {
    lines.push(hr);
    lines.push("  ROLLBACK METADATA");
    lines.push(hr);
    for (const rb of report.rollbacks) {
      lines.push(`  ${rb.promotionId}`);
      lines.push(`    target:  ${rb.rollbackAction.targetFile}`);
      lines.push(`    key:     ${rb.rollbackAction.key}`);
      lines.push(`    restore: ${rb.rollbackAction.restoreValue ?? "(unset)"}`);
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}
