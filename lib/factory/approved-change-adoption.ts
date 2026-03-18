/**
 * Approved Change Adoption Engine v1
 *
 * Converts approved proposals from Human Approval Workflow into
 * deterministic adoption plans, supports dry-run preview, controlled
 * application to a local config artifact, and rollback metadata.
 *
 * Target artifact: data/factory-policy.json
 * Adoption history: data/adoption-history.json
 *
 * No DB migrations. No auto-apply. Explicit action only.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import {
  getApprovedChanges,
  type ApprovalProposal,
  type ApprovalSubsystem,
} from "./human-approval-workflow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdoptionSubsystem =
  | "provider_routing"
  | "provider_learning"
  | "cost_guardrail"
  | "control_plane"
  | "governance"
  | "regression";

export type AdoptionChangeType =
  | "config_patch"
  | "threshold_update"
  | "policy_override";

export type AdoptionPlanStatus =
  | "ready"
  | "applied"
  | "skipped"
  | "failed"
  | "rolled_back";

export interface AdoptionDiff {
  key: string;
  before: number | string | null;
  after: number | string | null;
}

export interface AdoptionPlan {
  planId: string;
  proposalId: string;
  subsystem: AdoptionSubsystem;
  targetFile: string;
  changeType: AdoptionChangeType;
  currentValue: number | string | null;
  proposedValue: number | string | null;
  dryRunDiff: AdoptionDiff;
  status: AdoptionPlanStatus;
  skipReason?: string;
}

export interface AdoptionHistoryEntry {
  planId: string;
  proposalId: string;
  subsystem: AdoptionSubsystem;
  appliedAt: string;
  appliedBy: string;
  status: "applied" | "failed" | "rolled_back";
  before: number | string | null;
  after: number | string | null;
  notes: string;
}

export interface RollbackAction {
  targetFile: string;
  key: string;
  restoreValue: number | string | null;
}

export interface RollbackMetadata {
  planId: string;
  proposalId: string;
  rollbackAction: RollbackAction;
}

export interface AdoptionReport {
  plans: AdoptionPlan[];
  history: AdoptionHistoryEntry[];
  rollbacks: RollbackMetadata[];
  summary: {
    totalPlans: number;
    readyCount: number;
    appliedCount: number;
    skippedCount: number;
    failedCount: number;
    rolledBackCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TARGET_FILE = "data/factory-policy.json";

const ADOPTABLE_SUBSYSTEMS = new Set<AdoptionSubsystem>([
  "provider_routing",
  "provider_learning",
  "cost_guardrail",
  "control_plane",
  "governance",
  "regression",
]);

/** Maps subsystem to the change type used for its config patches. */
const SUBSYSTEM_CHANGE_TYPE: Record<AdoptionSubsystem, AdoptionChangeType> = {
  provider_routing: "config_patch",
  provider_learning: "threshold_update",
  cost_guardrail: "threshold_update",
  control_plane: "policy_override",
  governance: "threshold_update",
  regression: "config_patch",
};

// ---------------------------------------------------------------------------
// Storage — policy artifact
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const POLICY_PATH = join(DATA_DIR, TARGET_FILE.replace("data/", ""));
const ADOPTION_HISTORY_PATH = join(DATA_DIR, "adoption-history.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (for testing)
// ---------------------------------------------------------------------------

interface MemoryState {
  policy: Record<string, Record<string, number | string | null>>;
  history: AdoptionHistoryEntry[];
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(
  initial?: Partial<MemoryState>,
): void {
  memoryState = {
    policy: initial?.policy ?? {},
    history: initial?.history ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// Policy read/write
// ---------------------------------------------------------------------------

function readPolicy(): Record<string, Record<string, number | string | null>> {
  if (memoryState !== null) return memoryState.policy;
  try {
    const raw = readFileSync(POLICY_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, Record<string, number | string | null>>;
  } catch {
    return {};
  }
}

function writePolicy(
  policy: Record<string, Record<string, number | string | null>>,
): void {
  if (memoryState !== null) {
    memoryState.policy = policy;
    return;
  }
  ensureDataDir();
  writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2), "utf-8");
}

function readAdoptionHistoryStore(): AdoptionHistoryEntry[] {
  if (memoryState !== null) return memoryState.history;
  try {
    const raw = readFileSync(ADOPTION_HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as AdoptionHistoryEntry[];
  } catch {
    return [];
  }
}

function writeAdoptionHistoryStore(entries: AdoptionHistoryEntry[]): void {
  if (memoryState !== null) {
    memoryState.history = entries;
    return;
  }
  ensureDataDir();
  writeFileSync(
    ADOPTION_HISTORY_PATH,
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAdoptableSubsystem(sub: string): sub is AdoptionSubsystem {
  return ADOPTABLE_SUBSYSTEMS.has(sub as AdoptionSubsystem);
}

function buildConfigKey(subsystem: AdoptionSubsystem, actionKey: string): string {
  return `${subsystem}.${actionKey}`;
}

function getCurrentPolicyValue(
  subsystem: AdoptionSubsystem,
  actionKey: string,
): number | string | null {
  const policy = readPolicy();
  const section = policy[subsystem];
  if (!section) return null;
  return section[actionKey] ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect only approved proposals from the Human Approval Workflow.
 * Rejected and deferred proposals are excluded.
 */
export function collectApprovedProposals(): ApprovalProposal[] {
  return getApprovedChanges();
}

/**
 * Translate approved proposals into deterministic adoption plans.
 * Unsupported subsystems are marked as skipped.
 */
export function buildAdoptionPlans(
  approvedProposals?: ApprovalProposal[],
): AdoptionPlan[] {
  const proposals = approvedProposals ?? collectApprovedProposals();
  const plans: AdoptionPlan[] = [];

  for (const proposal of proposals) {
    const planId = `adopt-${proposal.id}`;

    if (!isAdoptableSubsystem(proposal.subsystem)) {
      plans.push({
        planId,
        proposalId: proposal.id,
        subsystem: proposal.subsystem as AdoptionSubsystem,
        targetFile: TARGET_FILE,
        changeType: "config_patch",
        currentValue: proposal.suggestedAction.current,
        proposedValue: proposal.suggestedAction.proposed,
        dryRunDiff: {
          key: `${proposal.subsystem}.${proposal.suggestedAction.key}`,
          before: proposal.suggestedAction.current,
          after: proposal.suggestedAction.proposed,
        },
        status: "skipped",
        skipReason: `Subsystem "${proposal.subsystem}" is not supported for adoption`,
      });
      continue;
    }

    const subsystem = proposal.subsystem;
    const actionKey = proposal.suggestedAction.key;
    const configKey = buildConfigKey(subsystem, actionKey);

    // Resolve current value: use policy file value if set, otherwise proposal's current
    const policyValue = getCurrentPolicyValue(subsystem, actionKey);
    const currentValue = policyValue ?? proposal.suggestedAction.current;

    // Check if already applied (value already matches proposed)
    const alreadyApplied =
      policyValue !== null &&
      String(policyValue) === String(proposal.suggestedAction.proposed);

    plans.push({
      planId,
      proposalId: proposal.id,
      subsystem,
      targetFile: TARGET_FILE,
      changeType: SUBSYSTEM_CHANGE_TYPE[subsystem],
      currentValue,
      proposedValue: proposal.suggestedAction.proposed,
      dryRunDiff: {
        key: configKey,
        before: currentValue,
        after: proposal.suggestedAction.proposed,
      },
      status: alreadyApplied ? "skipped" : "ready",
      ...(alreadyApplied
        ? { skipReason: "Value already matches proposed value" }
        : {}),
    });
  }

  return plans;
}

/**
 * Preview adoption plans without applying any changes (dry-run).
 * Returns the same plans as buildAdoptionPlans but guarantees no mutation.
 */
export function previewAdoptionPlans(
  approvedProposals?: ApprovalProposal[],
): AdoptionPlan[] {
  return buildAdoptionPlans(approvedProposals);
}

/**
 * Apply ready adoption plans to the target config artifact.
 * Only plans with status "ready" are applied.
 * Optionally filter to a single proposal by id.
 */
export function applyAdoptionPlans(
  options: {
    proposalId?: string;
    appliedBy?: string;
    notes?: string;
  } = {},
): {
  applied: AdoptionPlan[];
  skipped: AdoptionPlan[];
  history: AdoptionHistoryEntry[];
} {
  const appliedBy = options.appliedBy ?? "user";
  const notes = options.notes ?? "";

  let plans = buildAdoptionPlans();

  // Filter to specific proposal if requested
  if (options.proposalId) {
    plans = plans.filter((p) => p.proposalId === options.proposalId);
  }

  const policy = readPolicy();
  const historyStore = readAdoptionHistoryStore();
  const applied: AdoptionPlan[] = [];
  const skipped: AdoptionPlan[] = [];
  const newHistory: AdoptionHistoryEntry[] = [];

  for (const plan of plans) {
    if (plan.status !== "ready") {
      skipped.push(plan);
      continue;
    }

    // Apply to policy
    if (!policy[plan.subsystem]) {
      policy[plan.subsystem] = {};
    }
    const actionKey = plan.dryRunDiff.key.replace(`${plan.subsystem}.`, "");
    policy[plan.subsystem]![actionKey] = plan.proposedValue;

    plan.status = "applied";
    applied.push(plan);

    const entry: AdoptionHistoryEntry = {
      planId: plan.planId,
      proposalId: plan.proposalId,
      subsystem: plan.subsystem,
      appliedAt: new Date().toISOString(),
      appliedBy,
      status: "applied",
      before: plan.currentValue,
      after: plan.proposedValue,
      notes,
    };
    newHistory.push(entry);
    historyStore.push(entry);
  }

  writePolicy(policy);
  writeAdoptionHistoryStore(historyStore);

  return { applied, skipped, history: newHistory };
}

/**
 * Return adoption history entries.
 */
export function listAdoptionHistory(): AdoptionHistoryEntry[] {
  return readAdoptionHistoryStore();
}

/**
 * Generate rollback metadata for applied plans.
 * Returns the information needed to undo each applied change.
 */
export function buildRollbackMetadata(
  plans?: AdoptionPlan[],
): RollbackMetadata[] {
  const history = readAdoptionHistoryStore();
  const appliedEntries = plans
    ? plans.filter((p) => p.status === "applied")
    : history
        .filter((h) => h.status === "applied")
        .map((h) => ({
          planId: h.planId,
          proposalId: h.proposalId,
          subsystem: h.subsystem,
          dryRunDiff: {
            key: `${h.subsystem}.${h.planId.replace("adopt-", "").replace(`${h.subsystem}-`, "")}`,
            before: h.before,
            after: h.after,
          },
          currentValue: h.before,
          status: "applied" as const,
        }));

  const rollbacks: RollbackMetadata[] = [];

  // For plans, use plan data directly
  if (plans) {
    for (const plan of plans) {
      if (plan.status !== "applied") continue;
      rollbacks.push({
        planId: plan.planId,
        proposalId: plan.proposalId,
        rollbackAction: {
          targetFile: TARGET_FILE,
          key: plan.dryRunDiff.key,
          restoreValue: plan.currentValue,
        },
      });
    }
  } else {
    // From history
    for (const entry of history) {
      if (entry.status !== "applied") continue;
      rollbacks.push({
        planId: entry.planId,
        proposalId: entry.proposalId,
        rollbackAction: {
          targetFile: TARGET_FILE,
          key: `${entry.subsystem}.${extractActionKey(entry.planId, entry.proposalId)}`,
          restoreValue: entry.before,
        },
      });
    }
  }

  return rollbacks;
}

function extractActionKey(planId: string, proposalId: string): string {
  // planId = "adopt-<proposalId>", proposalId contains subsystem context
  // Fall back to proposalId as the key hint
  return proposalId;
}

/**
 * Build a complete adoption report.
 */
export function buildAdoptionReport(): AdoptionReport {
  const plans = buildAdoptionPlans();
  const history = listAdoptionHistory();
  const rollbacks = buildRollbackMetadata(
    plans.filter((p) => p.status === "applied"),
  );

  const summary = {
    totalPlans: plans.length,
    readyCount: plans.filter((p) => p.status === "ready").length,
    appliedCount: plans.filter((p) => p.status === "applied").length,
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

function planStatusBadge(status: AdoptionPlanStatus): string {
  const badges: Record<AdoptionPlanStatus, string> = {
    ready: "[READY]",
    applied: "[APPLIED]",
    skipped: "[SKIPPED]",
    failed: "[FAILED]",
    rolled_back: "[ROLLED_BACK]",
  };
  return badges[status];
}

export function formatAdoptionReport(report: AdoptionReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  APPROVED CHANGE ADOPTION REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalPlans}  |  ` +
    `Ready: ${report.summary.readyCount}  |  ` +
    `Applied: ${report.summary.appliedCount}  |  ` +
    `Skipped: ${report.summary.skippedCount}  |  ` +
    `Failed: ${report.summary.failedCount}`,
  );
  lines.push("");

  if (report.plans.length === 0) {
    lines.push("  適用可能なプランはありません。");
  } else {
    for (const plan of report.plans) {
      lines.push(`  ${planStatusBadge(plan.status)} ${plan.planId}`);
      lines.push(`    proposal:  ${plan.proposalId}`);
      lines.push(`    subsystem: ${plan.subsystem}`);
      lines.push(`    target:    ${plan.targetFile}`);
      lines.push(`    type:      ${plan.changeType}`);
      lines.push(
        `    diff:      ${plan.dryRunDiff.key}: ${plan.dryRunDiff.before} → ${plan.dryRunDiff.after}`,
      );
      if (plan.skipReason) {
        lines.push(`    reason:    ${plan.skipReason}`);
      }
      lines.push("");
    }
  }

  if (report.history.length > 0) {
    lines.push(hr);
    lines.push("  ADOPTION HISTORY");
    lines.push(hr);
    for (const h of report.history) {
      lines.push(
        `  ${h.appliedAt}  ${h.planId}  ${h.status.toUpperCase()}  (${h.appliedBy})`,
      );
      lines.push(`    ${h.before} → ${h.after}`);
      if (h.notes) lines.push(`    notes: ${h.notes}`);
    }
    lines.push("");
  }

  if (report.rollbacks.length > 0) {
    lines.push(hr);
    lines.push("  ROLLBACK METADATA");
    lines.push(hr);
    for (const rb of report.rollbacks) {
      lines.push(`  ${rb.planId}`);
      lines.push(`    target:  ${rb.rollbackAction.targetFile}`);
      lines.push(`    key:     ${rb.rollbackAction.key}`);
      lines.push(`    restore: ${rb.rollbackAction.restoreValue}`);
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}
