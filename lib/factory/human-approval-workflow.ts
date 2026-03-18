/**
 * Human Approval Workflow v1
 *
 * Collects improvement proposals from Self-Improving Factory and
 * Policy Simulation Sandbox, presents them for human review, records
 * approve / reject / defer decisions, and exposes approved proposals.
 *
 * Storage: JSON file at data/approval-history.json (no DB migration).
 * Read-only with respect to factory behavior — approved changes are
 * NOT automatically applied.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import type {
  ImprovementProposal,
  ImprovementSubsystem,
} from "./self-improving-factory";
import type { SimulationReport } from "./policy-simulation-sandbox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApprovalSubsystem =
  | "provider_routing"
  | "provider_learning"
  | "cost_guardrail"
  | "control_plane"
  | "governance"
  | "autopilot"
  | "template_evolution";

export type ApprovalDecision = "approved" | "rejected" | "deferred";

export interface ApprovalProposal {
  id: string;
  subsystem: ApprovalSubsystem;
  title: string;
  confidence: number;
  recommendation?: string;
  suggestedAction: {
    type: string;
    key: string;
    current: number | string | null;
    proposed: number | string | null;
  };
  source: "self_improving" | "simulation";
  reasons: string[];
}

export interface ApprovalRecord {
  proposalId: string;
  decision: ApprovalDecision;
  reviewer: string;
  timestamp: string;
  notes: string;
}

export interface ApprovalHistoryStore {
  proposals: ApprovalProposal[];
  decisions: ApprovalRecord[];
}

export interface ApprovalReport {
  pending: ApprovalProposal[];
  approved: ApprovalProposal[];
  rejected: ApprovalProposal[];
  deferred: ApprovalProposal[];
  decisions: ApprovalRecord[];
  summary: {
    totalProposals: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    deferredCount: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Storage (JSON file)
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "data");
const STORE_PATH = join(DATA_DIR, "approval-history.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readStore(): ApprovalHistoryStore {
  try {
    const raw = readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as ApprovalHistoryStore;
  } catch {
    return { proposals: [], decisions: [] };
  }
}

function writeStore(store: ApprovalHistoryStore): void {
  ensureDataDir();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// In-memory store (for testing without file I/O)
// ---------------------------------------------------------------------------

let memoryStore: ApprovalHistoryStore | null = null;

export function useInMemoryStore(initial?: ApprovalHistoryStore): void {
  memoryStore = initial ?? { proposals: [], decisions: [] };
}

export function clearInMemoryStore(): void {
  memoryStore = null;
}

function getStore(): ApprovalHistoryStore {
  if (memoryStore !== null) return memoryStore;
  return readStore();
}

function persistStore(store: ApprovalHistoryStore): void {
  if (memoryStore !== null) {
    memoryStore = store;
    return;
  }
  writeStore(store);
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function mapSubsystem(sub: ImprovementSubsystem): ApprovalSubsystem {
  if (sub === "evolution_engine") return "template_evolution";
  return sub as ApprovalSubsystem;
}

export function fromImprovementProposal(
  p: ImprovementProposal,
): ApprovalProposal {
  return {
    id: p.id,
    subsystem: mapSubsystem(p.subsystem),
    title: p.title,
    confidence: p.confidence,
    suggestedAction: {
      type: p.suggestedAction.type,
      key: p.suggestedAction.target,
      current: p.suggestedAction.currentValue,
      proposed: p.suggestedAction.suggestedValue,
    },
    source: "self_improving",
    reasons: p.reasons,
  };
}

export function fromSimulationReport(r: SimulationReport): ApprovalProposal {
  return {
    id: `sim-${r.subsystem}-${r.policyKey}`,
    subsystem: r.subsystem as ApprovalSubsystem,
    title: `Simulate ${r.policyKey} change (${r.currentValue} → ${r.proposedValue})`,
    confidence: r.confidence,
    recommendation: r.recommendation,
    suggestedAction: {
      type: "tune_weight",
      key: r.policyKey,
      current: r.currentValue,
      proposed: r.proposedValue,
    },
    source: "simulation",
    reasons: r.reasons,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect proposals from both Self-Improving Factory and Simulation Sandbox
 * and merge them into the store. Deduplicates by proposal id.
 */
export function collectPendingProposals(
  improvementProposals: ImprovementProposal[],
  simulationReports: SimulationReport[] = [],
): ApprovalProposal[] {
  const store = getStore();
  const existing = new Set(store.proposals.map((p) => p.id));

  const fromImprovement = improvementProposals.map(fromImprovementProposal);
  const fromSimulation = simulationReports.map(fromSimulationReport);
  const incoming = [...fromImprovement, ...fromSimulation];

  for (const proposal of incoming) {
    if (!existing.has(proposal.id)) {
      store.proposals.push(proposal);
      existing.add(proposal.id);
    }
  }

  persistStore(store);
  return store.proposals;
}

/**
 * Submit an approval decision for a proposal.
 * Returns the decision record, or null if proposal not found.
 */
export function submitApprovalDecision(
  proposalId: string,
  decision: ApprovalDecision,
  reviewer: string = "user",
  notes: string = "",
): ApprovalRecord | null {
  const store = getStore();
  const proposal = store.proposals.find((p) => p.id === proposalId);
  if (!proposal) return null;

  const record: ApprovalRecord = {
    proposalId,
    decision,
    reviewer,
    timestamp: new Date().toISOString(),
    notes,
  };

  store.decisions.push(record);
  persistStore(store);
  return record;
}

/**
 * Return all decision records, optionally filtered by proposal id.
 */
export function listApprovalHistory(
  proposalId?: string,
): ApprovalRecord[] {
  const store = getStore();
  if (proposalId) {
    return store.decisions.filter((d) => d.proposalId === proposalId);
  }
  return store.decisions;
}

/**
 * Return proposals whose latest decision is "approved".
 * Proposals with no decision are NOT included.
 */
export function getApprovedChanges(): ApprovalProposal[] {
  const store = getStore();
  const latestDecision = new Map<string, ApprovalDecision>();

  for (const d of store.decisions) {
    latestDecision.set(d.proposalId, d.decision);
  }

  return store.proposals.filter(
    (p) => latestDecision.get(p.id) === "approved",
  );
}

/**
 * Get the latest decision status for each proposal.
 */
export function getProposalStatuses(): Map<string, ApprovalDecision> {
  const store = getStore();
  const statuses = new Map<string, ApprovalDecision>();
  for (const d of store.decisions) {
    statuses.set(d.proposalId, d.decision);
  }
  return statuses;
}

/**
 * Get proposals that have no decision yet, or whose latest decision is "deferred".
 */
export function getPendingProposals(): ApprovalProposal[] {
  const store = getStore();
  const statuses = getProposalStatuses();
  return store.proposals.filter((p) => {
    const status = statuses.get(p.id);
    return status === undefined || status === "deferred";
  });
}

/**
 * Build a complete approval report.
 */
export function buildApprovalReport(): ApprovalReport {
  const store = getStore();
  const statuses = getProposalStatuses();

  const pending: ApprovalProposal[] = [];
  const approved: ApprovalProposal[] = [];
  const rejected: ApprovalProposal[] = [];
  const deferred: ApprovalProposal[] = [];

  for (const p of store.proposals) {
    const status = statuses.get(p.id);
    switch (status) {
      case "approved":
        approved.push(p);
        break;
      case "rejected":
        rejected.push(p);
        break;
      case "deferred":
        deferred.push(p);
        break;
      default:
        pending.push(p);
        break;
    }
  }

  return {
    pending,
    approved,
    rejected,
    deferred,
    decisions: store.decisions,
    summary: {
      totalProposals: store.proposals.length,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      deferredCount: deferred.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting (console output)
// ---------------------------------------------------------------------------

function decisionBadge(decision: ApprovalDecision | undefined): string {
  switch (decision) {
    case "approved":
      return "[APPROVED]";
    case "rejected":
      return "[REJECTED]";
    case "deferred":
      return "[DEFERRED]";
    default:
      return "[PENDING]";
  }
}

export function formatApprovalReport(report: ApprovalReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push("  FACTORY PROPOSAL APPROVAL REPORT");
  lines.push(hr);
  lines.push(
    `  Total: ${report.summary.totalProposals}  |  ` +
    `Pending: ${report.summary.pendingCount}  |  ` +
    `Approved: ${report.summary.approvedCount}  |  ` +
    `Rejected: ${report.summary.rejectedCount}  |  ` +
    `Deferred: ${report.summary.deferredCount}`,
  );
  lines.push("");

  const allProposals = [
    ...report.pending.map((p) => ({ p, status: undefined as ApprovalDecision | undefined })),
    ...report.approved.map((p) => ({ p, status: "approved" as ApprovalDecision })),
    ...report.rejected.map((p) => ({ p, status: "rejected" as ApprovalDecision })),
    ...report.deferred.map((p) => ({ p, status: "deferred" as ApprovalDecision })),
  ];

  if (allProposals.length === 0) {
    lines.push("  提案はありません。");
  } else {
    for (const { p, status } of allProposals) {
      lines.push(`  ${decisionBadge(status)} ${p.id}`);
      lines.push(`    subsystem:   ${p.subsystem}`);
      lines.push(`    title:       ${p.title}`);
      lines.push(`    confidence:  ${p.confidence}`);
      if (p.recommendation) {
        lines.push(`    recommendation: ${p.recommendation}`);
      }
      lines.push(
        `    action:      ${p.suggestedAction.key}: ${p.suggestedAction.current} → ${p.suggestedAction.proposed}`,
      );
      lines.push(`    source:      ${p.source}`);
      if (p.reasons.length > 0) {
        lines.push(`    reasons:`);
        for (const r of p.reasons) {
          lines.push(`      - ${r}`);
        }
      }
      lines.push("");
    }
  }

  if (report.decisions.length > 0) {
    lines.push(hr);
    lines.push("  DECISION HISTORY");
    lines.push(hr);
    for (const d of report.decisions) {
      lines.push(
        `  ${d.timestamp}  ${d.proposalId}  ${d.decision.toUpperCase()}  (${d.reviewer})`,
      );
      if (d.notes) {
        lines.push(`    notes: ${d.notes}`);
      }
    }
  }

  lines.push(hr);
  return lines.join("\n");
}
