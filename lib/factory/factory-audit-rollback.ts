/**
 * Factory Audit / Rollback Execution v1
 *
 * Provides:
 *   1. Unified audit history across adoption, promotion, and rollback events
 *   2. Rollback candidate collection from adoption + promotion metadata
 *   3. Dry-run rollback preview
 *   4. Controlled rollback execution with safety checks
 *   5. Rollback history recording
 *
 * No auto-rollback. No DB migrations. Explicit action only.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import {
  listAdoptionHistory,
  buildRollbackMetadata as buildAdoptionRollbackMetadata,
  type AdoptionHistoryEntry,
  type RollbackMetadata,
} from "./approved-change-adoption";

import {
  listPromotionHistory,
  buildPromotionRollbackMetadata,
  type PromotionHistoryEntry,
  type PromotionRollbackMetadata,
} from "./policy-promotion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditEventType = "adoption" | "promotion" | "rollback";
export type AuditSourceType = "adoption" | "promotion";
export type RollbackCandidateStatus = "ready" | "rolled_back" | "skipped" | "failed";

export interface AuditEntry {
  id: string;
  eventType: AuditEventType;
  sourceType: AuditSourceType;
  sourceId: string;
  environment: string;
  targetFile: string;
  key: string;
  before: number | string | null;
  after: number | string | null;
  executedAt: string;
  executedBy: string;
  status: string;
}

export interface RollbackCandidate {
  rollbackId: string;
  sourceType: AuditSourceType;
  sourceId: string;
  targetFile: string;
  key: string;
  currentValue: number | string | null;
  restoreValue: number | string | null;
  status: RollbackCandidateStatus;
  skipReason?: string;
}

export interface RollbackHistoryEntry {
  rollbackId: string;
  sourceType: AuditSourceType;
  sourceId: string;
  targetFile: string;
  key: string;
  before: number | string | null;
  after: number | string | null;
  executedAt: string;
  executedBy: string;
  status: "rolled_back" | "failed";
}

export interface RollbackExecutionReport {
  candidates: RollbackCandidate[];
  history: RollbackHistoryEntry[];
  summary: {
    totalCandidates: number;
    readyCount: number;
    rolledBackCount: number;
    skippedCount: number;
    failedCount: number;
  };
  generatedAt: string;
}

export interface UnifiedAuditReport {
  entries: AuditEntry[];
  summary: {
    totalEntries: number;
    adoptionCount: number;
    promotionCount: number;
    rollbackCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Policy data shape
// ---------------------------------------------------------------------------

type PolicyData = Record<string, Record<string, number | string | null>>;

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const ROLLBACK_HISTORY_PATH = join(DATA_DIR, "rollback-history.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (for testing)
// ---------------------------------------------------------------------------

interface MemoryState {
  /** Adoption engine's policy artifact (data/factory-policy.json) */
  adoptionPolicy: PolicyData;
  /** Per-environment policy artifacts */
  envPolicies: Record<string, PolicyData>;
  /** Rollback history */
  rollbackHistory: RollbackHistoryEntry[];
  /** Adoption history override (if set, used instead of listAdoptionHistory) */
  adoptionHistory: AdoptionHistoryEntry[] | null;
  /** Promotion history override */
  promotionHistory: PromotionHistoryEntry[] | null;
  /** Adoption rollback metadata override */
  adoptionRollbacks: RollbackMetadata[] | null;
  /** Promotion rollback metadata override */
  promotionRollbacks: PromotionRollbackMetadata[] | null;
}

let memoryState: MemoryState | null = null;

export function useInMemoryStore(
  initial?: Partial<MemoryState>,
): void {
  memoryState = {
    adoptionPolicy: initial?.adoptionPolicy ?? {},
    envPolicies: initial?.envPolicies ?? {},
    rollbackHistory: initial?.rollbackHistory ?? [],
    adoptionHistory: initial?.adoptionHistory ?? null,
    promotionHistory: initial?.promotionHistory ?? null,
    adoptionRollbacks: initial?.adoptionRollbacks ?? null,
    promotionRollbacks: initial?.promotionRollbacks ?? null,
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

// ---------------------------------------------------------------------------
// Policy read/write
// ---------------------------------------------------------------------------

function readPolicyFile(targetFile: string): PolicyData {
  if (memoryState !== null) {
    if (targetFile === "data/factory-policy.json") {
      return memoryState.adoptionPolicy;
    }
    return memoryState.envPolicies[targetFile] ?? {};
  }
  try {
    const absPath = join(process.cwd(), targetFile);
    const raw = readFileSync(absPath, "utf-8");
    return JSON.parse(raw) as PolicyData;
  } catch {
    return {};
  }
}

function writePolicyFile(targetFile: string, policy: PolicyData): void {
  if (memoryState !== null) {
    if (targetFile === "data/factory-policy.json") {
      memoryState.adoptionPolicy = policy;
    } else {
      memoryState.envPolicies[targetFile] = policy;
    }
    return;
  }
  ensureDataDir();
  const absPath = join(process.cwd(), targetFile);
  writeFileSync(absPath, JSON.stringify(policy, null, 2), "utf-8");
}

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
  if (value === null) {
    delete policy[subsystem]![actionKey];
    if (Object.keys(policy[subsystem]!).length === 0) {
      delete policy[subsystem];
    }
  } else {
    policy[subsystem]![actionKey] = value;
  }
}

// ---------------------------------------------------------------------------
// Rollback history storage
// ---------------------------------------------------------------------------

function readRollbackHistory(): RollbackHistoryEntry[] {
  if (memoryState !== null) return memoryState.rollbackHistory;
  try {
    const raw = readFileSync(ROLLBACK_HISTORY_PATH, "utf-8");
    return JSON.parse(raw) as RollbackHistoryEntry[];
  } catch {
    return [];
  }
}

function writeRollbackHistory(entries: RollbackHistoryEntry[]): void {
  if (memoryState !== null) {
    memoryState.rollbackHistory = entries;
    return;
  }
  ensureDataDir();
  writeFileSync(
    ROLLBACK_HISTORY_PATH,
    JSON.stringify(entries, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// Data source helpers (support in-memory overrides for testing)
// ---------------------------------------------------------------------------

function getAdoptionHistory(): AdoptionHistoryEntry[] {
  if (memoryState?.adoptionHistory !== null && memoryState !== null) {
    return memoryState.adoptionHistory;
  }
  return listAdoptionHistory();
}

function getPromotionHistory(): PromotionHistoryEntry[] {
  if (memoryState?.promotionHistory !== null && memoryState !== null) {
    return memoryState.promotionHistory;
  }
  return listPromotionHistory();
}

function getAdoptionRollbacks(): RollbackMetadata[] {
  if (memoryState?.adoptionRollbacks !== null && memoryState !== null) {
    return memoryState.adoptionRollbacks;
  }
  return buildAdoptionRollbackMetadata();
}

function getPromotionRollbacks(): PromotionRollbackMetadata[] {
  if (memoryState?.promotionRollbacks !== null && memoryState !== null) {
    return memoryState.promotionRollbacks;
  }
  return buildPromotionRollbackMetadata();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect rollback candidates from adoption and promotion metadata.
 * Validates against current artifact state and excludes already-rolled-back.
 */
export function collectRollbackCandidates(): RollbackCandidate[] {
  const candidates: RollbackCandidate[] = [];
  const rolledBackIds = new Set(
    readRollbackHistory()
      .filter((h) => h.status === "rolled_back")
      .map((h) => h.rollbackId),
  );

  // From adoption rollback metadata
  const adoptionRollbacks = getAdoptionRollbacks();
  for (const rb of adoptionRollbacks) {
    const rollbackId = `rollback-${rb.planId}`;

    if (rolledBackIds.has(rollbackId)) {
      candidates.push({
        rollbackId,
        sourceType: "adoption",
        sourceId: rb.planId,
        targetFile: rb.rollbackAction.targetFile,
        key: rb.rollbackAction.key,
        currentValue: null,
        restoreValue: rb.rollbackAction.restoreValue,
        status: "skipped",
        skipReason: "Already rolled back",
      });
      continue;
    }

    const policy = readPolicyFile(rb.rollbackAction.targetFile);
    const currentValue = getPolicyValue(policy, rb.rollbackAction.key);

    candidates.push({
      rollbackId,
      sourceType: "adoption",
      sourceId: rb.planId,
      targetFile: rb.rollbackAction.targetFile,
      key: rb.rollbackAction.key,
      currentValue,
      restoreValue: rb.rollbackAction.restoreValue,
      status: "ready",
    });
  }

  // From promotion rollback metadata
  const promotionRollbacks = getPromotionRollbacks();
  for (const rb of promotionRollbacks) {
    const rollbackId = `rollback-${rb.promotionId}`;

    if (rolledBackIds.has(rollbackId)) {
      candidates.push({
        rollbackId,
        sourceType: "promotion",
        sourceId: rb.promotionId,
        targetFile: rb.rollbackAction.targetFile,
        key: rb.rollbackAction.key,
        currentValue: null,
        restoreValue: rb.rollbackAction.restoreValue,
        status: "skipped",
        skipReason: "Already rolled back",
      });
      continue;
    }

    const policy = readPolicyFile(rb.rollbackAction.targetFile);
    const currentValue = getPolicyValue(policy, rb.rollbackAction.key);

    candidates.push({
      rollbackId,
      sourceType: "promotion",
      sourceId: rb.promotionId,
      targetFile: rb.rollbackAction.targetFile,
      key: rb.rollbackAction.key,
      currentValue,
      restoreValue: rb.rollbackAction.restoreValue,
      status: "ready",
    });
  }

  return candidates;
}

/**
 * Preview rollback candidates without executing any changes (dry-run).
 * Guarantees no mutation.
 */
export function previewRollbackCandidates(): RollbackCandidate[] {
  return collectRollbackCandidates();
}

/**
 * Execute rollback for eligible ready candidates.
 * Optionally filter to a single source by sourceId.
 */
export function applyRollbackCandidates(
  options: {
    sourceId?: string;
    executedBy?: string;
  } = {},
): {
  rolledBack: RollbackCandidate[];
  skipped: RollbackCandidate[];
  history: RollbackHistoryEntry[];
} {
  const executedBy = options.executedBy ?? "user";
  let candidates = collectRollbackCandidates();

  if (options.sourceId) {
    candidates = candidates.filter((c) => c.sourceId === options.sourceId);
  }

  const historyStore = readRollbackHistory();
  const rolledBack: RollbackCandidate[] = [];
  const skipped: RollbackCandidate[] = [];
  const newHistory: RollbackHistoryEntry[] = [];

  // Group candidates by target file for batch policy writes
  const policyCache = new Map<string, PolicyData>();

  for (const candidate of candidates) {
    if (candidate.status !== "ready") {
      skipped.push(candidate);
      continue;
    }

    // Safety checks
    if (!policyCache.has(candidate.targetFile)) {
      policyCache.set(
        candidate.targetFile,
        readPolicyFile(candidate.targetFile),
      );
    }
    const policy = policyCache.get(candidate.targetFile)!;
    const currentValue = getPolicyValue(policy, candidate.key);

    // Check: current value should be the one we'd be rolling back from
    // (if restoreValue is null and currentValue is already null, skip)
    if (
      currentValue === null &&
      candidate.restoreValue === null
    ) {
      candidate.status = "skipped";
      candidate.skipReason =
        "Key does not exist and restore value is also null";
      skipped.push(candidate);
      continue;
    }

    // Apply rollback
    setPolicyValue(policy, candidate.key, candidate.restoreValue);
    candidate.status = "rolled_back";
    candidate.currentValue = currentValue;
    rolledBack.push(candidate);

    const entry: RollbackHistoryEntry = {
      rollbackId: candidate.rollbackId,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      targetFile: candidate.targetFile,
      key: candidate.key,
      before: currentValue,
      after: candidate.restoreValue,
      executedAt: new Date().toISOString(),
      executedBy,
      status: "rolled_back",
    };
    newHistory.push(entry);
    historyStore.push(entry);
  }

  // Write all modified policies
  Array.from(policyCache.entries()).forEach(([targetFile, policy]) => {
    writePolicyFile(targetFile, policy);
  });
  writeRollbackHistory(historyStore);

  return { rolledBack, skipped, history: newHistory };
}

/**
 * Build unified audit history from adoption, promotion, and rollback events.
 */
export function listFactoryAuditHistory(
  filters?: {
    eventType?: AuditEventType;
    sourceType?: AuditSourceType;
    environment?: string;
  },
): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let counter = 0;

  // Adoption events
  const adoptionHistory = getAdoptionHistory();
  for (const h of adoptionHistory) {
    entries.push({
      id: `audit-adoption-${++counter}`,
      eventType: "adoption",
      sourceType: "adoption",
      sourceId: h.planId,
      environment: "dev",
      targetFile: "data/factory-policy.json",
      key: `${h.subsystem}.${h.proposalId}`,
      before: h.before,
      after: h.after,
      executedAt: h.appliedAt,
      executedBy: h.appliedBy,
      status: h.status,
    });
  }

  // Promotion events
  const promotionHistory = getPromotionHistory();
  for (const h of promotionHistory) {
    entries.push({
      id: `audit-promotion-${++counter}`,
      eventType: "promotion",
      sourceType: "promotion",
      sourceId: h.promotionId,
      environment: h.toEnv,
      targetFile: `data/factory-policy.${h.toEnv}.json`,
      key: `${h.proposalId}`,
      before: h.before,
      after: h.after,
      executedAt: h.appliedAt,
      executedBy: h.appliedBy,
      status: h.status,
    });
  }

  // Rollback events
  const rollbackHistory = readRollbackHistory();
  for (const h of rollbackHistory) {
    // Derive environment from targetFile
    const envMatch = h.targetFile.match(/factory-policy\.(\w+)\.json/);
    const environment = envMatch ? envMatch[1]! : "dev";

    entries.push({
      id: `audit-rollback-${++counter}`,
      eventType: "rollback",
      sourceType: h.sourceType,
      sourceId: h.sourceId,
      environment,
      targetFile: h.targetFile,
      key: h.key,
      before: h.before,
      after: h.after,
      executedAt: h.executedAt,
      executedBy: h.executedBy,
      status: h.status,
    });
  }

  // Sort by timestamp
  entries.sort((a, b) => a.executedAt.localeCompare(b.executedAt));

  // Apply filters
  let filtered = entries;
  if (filters?.eventType) {
    filtered = filtered.filter((e) => e.eventType === filters.eventType);
  }
  if (filters?.sourceType) {
    filtered = filtered.filter((e) => e.sourceType === filters.sourceType);
  }
  if (filters?.environment) {
    filtered = filtered.filter((e) => e.environment === filters.environment);
  }

  return filtered;
}

/**
 * Build a unified audit report.
 */
export function buildUnifiedAuditReport(
  filters?: {
    eventType?: AuditEventType;
    sourceType?: AuditSourceType;
    environment?: string;
  },
): UnifiedAuditReport {
  const entries = listFactoryAuditHistory(filters);

  return {
    entries,
    summary: {
      totalEntries: entries.length,
      adoptionCount: entries.filter((e) => e.eventType === "adoption").length,
      promotionCount: entries.filter((e) => e.eventType === "promotion").length,
      rollbackCount: entries.filter((e) => e.eventType === "rollback").length,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Build a rollback execution report.
 */
export function buildRollbackExecutionReport(): RollbackExecutionReport {
  const candidates = collectRollbackCandidates();
  const history = readRollbackHistory();

  return {
    candidates,
    history,
    summary: {
      totalCandidates: candidates.length,
      readyCount: candidates.filter((c) => c.status === "ready").length,
      rolledBackCount: candidates.filter((c) => c.status === "rolled_back")
        .length,
      skippedCount: candidates.filter((c) => c.status === "skipped").length,
      failedCount: candidates.filter((c) => c.status === "failed").length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting (console output)
// ---------------------------------------------------------------------------

function candidateStatusBadge(status: RollbackCandidateStatus): string {
  const badges: Record<RollbackCandidateStatus, string> = {
    ready: "[READY]",
    rolled_back: "[ROLLED_BACK]",
    skipped: "[SKIPPED]",
    failed: "[FAILED]",
  };
  return badges[status];
}

export function formatRollbackReport(report: RollbackExecutionReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  ROLLBACK EXECUTION REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalCandidates}  |  ` +
    `Ready: ${report.summary.readyCount}  |  ` +
    `Rolled Back: ${report.summary.rolledBackCount}  |  ` +
    `Skipped: ${report.summary.skippedCount}  |  ` +
    `Failed: ${report.summary.failedCount}`,
  );
  lines.push("");

  if (report.candidates.length === 0) {
    lines.push("  ロールバック対象はありません。");
  } else {
    for (const c of report.candidates) {
      lines.push(`  ${candidateStatusBadge(c.status)} ${c.rollbackId}`);
      lines.push(`    source:  ${c.sourceType} / ${c.sourceId}`);
      lines.push(`    target:  ${c.targetFile}`);
      lines.push(
        `    diff:    ${c.key}: ${c.currentValue ?? "(unset)"} → ${c.restoreValue ?? "(unset)"}`,
      );
      if (c.skipReason) {
        lines.push(`    reason:  ${c.skipReason}`);
      }
      lines.push("");
    }
  }

  if (report.history.length > 0) {
    lines.push(hr);
    lines.push("  ROLLBACK HISTORY");
    lines.push(hr);
    for (const h of report.history) {
      lines.push(
        `  ${h.executedAt}  ${h.rollbackId}  ${h.status.toUpperCase()}  (${h.executedBy})`,
      );
      lines.push(
        `    ${h.key}: ${h.before ?? "(unset)"} → ${h.after ?? "(unset)"}`,
      );
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}

export function formatAuditReport(report: UnifiedAuditReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  UNIFIED FACTORY AUDIT REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalEntries}  |  ` +
    `Adoption: ${report.summary.adoptionCount}  |  ` +
    `Promotion: ${report.summary.promotionCount}  |  ` +
    `Rollback: ${report.summary.rollbackCount}`,
  );
  lines.push("");

  if (report.entries.length === 0) {
    lines.push("  監査エントリはありません。");
  } else {
    for (const e of report.entries) {
      lines.push(`  [${e.eventType.toUpperCase()}] ${e.id}`);
      lines.push(`    source:  ${e.sourceType} / ${e.sourceId}`);
      lines.push(`    env:     ${e.environment}`);
      lines.push(`    target:  ${e.targetFile}`);
      lines.push(
        `    diff:    ${e.key}: ${e.before ?? "(unset)"} → ${e.after ?? "(unset)"}`,
      );
      lines.push(`    status:  ${e.status}`);
      lines.push(`    at:      ${e.executedAt}  by: ${e.executedBy}`);
      lines.push("");
    }
  }

  lines.push(hr);
  return lines.join("\n");
}
