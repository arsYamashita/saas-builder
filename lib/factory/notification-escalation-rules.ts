/**
 * Notification Escalation Rules v2
 *
 * Provides:
 *   1. Repetition detection for recurring events within windows
 *   2. Overdue/escalated review workflow notifications
 *   3. Audience escalation (admin → owner) based on severity/repetition
 *   4. Suppression window + renotify rules
 *   5. Explainable escalation decisions with reasons
 *
 * Sits ON TOP of Notification Policy Layer v1.
 * Does NOT bypass base notification decisions.
 * Does NOT send external notifications.
 */

import {
  evaluateAllNotificationPolicies,
  listNotificationDecisions,
  type NotificationDecision,
  type NotificationSeverity,
} from "./notification-policy-layer";
import {
  listFactoryEvents,
  type FactoryEvent,
  type FactoryEventType,
} from "./external-automation-hooks";
import {
  evaluateAllWorkflowOps,
  listWorkflowOpsRecords,
  type WorkflowOpsRecord,
  type WorkflowV3Inputs,
} from "./strategic-review-workflow-v3";
import type { FactoryRole } from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationLevel = 0 | 1 | 2;

export type EscalationDecisionType = "notify" | "suppress" | "renotify";

export interface NotificationEscalation {
  escalationId: string;
  baseNotificationId: string;
  eventType: FactoryEventType;
  escalationLevel: EscalationLevel;
  baseSeverity: NotificationSeverity;
  severity: NotificationSeverity;
  audience: FactoryRole[];
  decision: EscalationDecisionType;
  channelHint: string;
  reasons: string[];
  evaluatedAt: string;
}

export interface RepetitionPattern {
  eventType: FactoryEventType;
  occurrenceCount: number;
  firstOccurrence: string;
  lastOccurrence: string;
  artifactKey: string;
}

export interface EscalationReport {
  escalations: NotificationEscalation[];
  criticalAlerts: NotificationEscalation[];
  overdueReviewAlerts: NotificationEscalation[];
  repeatedFailureAlerts: NotificationEscalation[];
  summary: {
    totalEscalations: number;
    level0Count: number;
    level1Count: number;
    level2Count: number;
    notifyCount: number;
    suppressCount: number;
    renotifyCount: number;
    bySeverity: Record<NotificationSeverity, number>;
  };
  generatedAt: string;
}

export interface EscalationInputs {
  workflowV3Inputs: Partial<WorkflowV3Inputs>;
  now: string;
  escalationWindowMs: number;
  suppressionWindowMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ESCALATION_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_SUPPRESSION_WINDOW_MS = 30 * 60 * 1000;     // 30 minutes

/** Events eligible for repetition-based escalation. */
const REPEATABLE_EVENT_TYPES: FactoryEventType[] = [
  "runtime.job.failed",
  "scenario.execution.blocked",
  "governance.alert",
  "template.release.blocked",
];

/** Severity escalation ladder. */
const SEVERITY_LADDER: NotificationSeverity[] = ["info", "warning", "high", "critical"];

/** Channel escalation map. */
const ESCALATED_CHANNEL_MAP: Record<string, string> = {
  ops: "ops_urgent",
  review: "review_urgent",
  release: "release_urgent",
  general: "ops_urgent",
};

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface EscalationMemoryState {
  escalations: NotificationEscalation[];
}

let memoryState: EscalationMemoryState | null = null;
let escalationCounter = 0;

export function useInMemoryStore(initial?: Partial<EscalationMemoryState>): void {
  memoryState = {
    escalations: initial?.escalations ?? [],
  };
  escalationCounter = memoryState.escalations.length;
}

export function clearInMemoryStore(): void {
  memoryState = null;
  escalationCounter = 0;
}

export function resetCounters(): void {
  escalationCounter = 0;
}

function getEscalations(): NotificationEscalation[] {
  return memoryState?.escalations ?? [];
}

function storeEscalation(esc: NotificationEscalation): void {
  if (!memoryState) return;
  const idx = memoryState.escalations.findIndex(
    (e) => e.escalationId === esc.escalationId,
  );
  if (idx >= 0) {
    memoryState.escalations[idx] = esc;
  } else {
    memoryState.escalations.push(esc);
  }
}

function nextEscalationId(): string {
  escalationCounter++;
  return `esc-${String(escalationCounter).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Repetition detection
// ---------------------------------------------------------------------------

/**
 * Detect repeated notification patterns from event history.
 */
export function detectRepeatedNotificationPatterns(
  overrides?: Partial<EscalationInputs>,
): RepetitionPattern[] {
  const windowMs = overrides?.escalationWindowMs ?? DEFAULT_ESCALATION_WINDOW_MS;
  const nowMs = overrides?.now ? new Date(overrides.now).getTime() : Date.now();
  const windowStart = nowMs - windowMs;

  const events = listFactoryEvents();
  const patterns: RepetitionPattern[] = [];

  // Group events by type + artifact key within window
  const groups = new Map<string, FactoryEvent[]>();

  for (const event of events) {
    if (!REPEATABLE_EVENT_TYPES.includes(event.eventType)) continue;

    const eventMs = new Date(event.occurredAt).getTime();
    if (eventMs < windowStart) continue;

    const artifactKey = extractArtifactKey(event);
    const groupKey = `${event.eventType}::${artifactKey}`;

    const group = groups.get(groupKey) ?? [];
    group.push(event);
    groups.set(groupKey, group);
  }

  for (const [groupKey, groupEvents] of Array.from(groups.entries())) {
    if (groupEvents.length < 2) continue;

    const sorted = groupEvents.sort(
      (a: FactoryEvent, b: FactoryEvent) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
    );
    const [eventType, artifactKey] = groupKey.split("::");

    patterns.push({
      eventType: eventType as FactoryEventType,
      occurrenceCount: sorted.length,
      firstOccurrence: sorted[0].occurredAt,
      lastOccurrence: sorted[sorted.length - 1].occurredAt,
      artifactKey,
    });
  }

  return patterns;
}

function extractArtifactKey(event: FactoryEvent): string {
  const p = event.payload;
  if (p.scenarioId) return String(p.scenarioId);
  if (p.jobId) return String(p.jobId);
  if (p.templateId) return String(p.templateId);
  if (p.templateKey) return String(p.templateKey);
  return event.eventType;
}

// ---------------------------------------------------------------------------
// Severity escalation
// ---------------------------------------------------------------------------

/**
 * Resolve escalated severity based on base severity and escalation level.
 */
export function resolveEscalatedSeverity(
  baseSeverity: NotificationSeverity,
  escalationLevel: EscalationLevel,
): NotificationSeverity {
  const baseIdx = SEVERITY_LADDER.indexOf(baseSeverity);
  const escalatedIdx = Math.min(baseIdx + escalationLevel, SEVERITY_LADDER.length - 1);
  return SEVERITY_LADDER[escalatedIdx];
}

// ---------------------------------------------------------------------------
// Audience escalation
// ---------------------------------------------------------------------------

/**
 * Resolve escalated audience based on base audience, severity, and escalation level.
 */
export function resolveEscalatedAudience(
  baseAudience: FactoryRole[],
  escalatedSeverity: NotificationSeverity,
  escalationLevel: EscalationLevel,
): FactoryRole[] {
  const audience = Array.from(new Set(baseAudience));

  // Level 1: add admin if not present
  if (escalationLevel >= 1 && !audience.includes("admin")) {
    audience.push("admin");
  }

  // Level 2 or critical: add owner if not present
  if ((escalationLevel >= 2 || escalatedSeverity === "critical") && !audience.includes("owner")) {
    audience.push("owner");
  }

  return audience;
}

// ---------------------------------------------------------------------------
// Suppression window / renotify
// ---------------------------------------------------------------------------

function shouldRenotify(
  baseDecision: NotificationDecision,
  escalationLevel: EscalationLevel,
  escalatedSeverity: NotificationSeverity,
  overrides?: Partial<EscalationInputs>,
): { renotify: boolean; reason: string } {
  // Already notified → no renotify needed
  if (baseDecision.decision === "notify") {
    return { renotify: false, reason: "Base decision already notify" };
  }

  // Repeated high-severity events bypass suppression
  if (escalationLevel >= 1 && (escalatedSeverity === "high" || escalatedSeverity === "critical")) {
    return { renotify: true, reason: "Repeated high-severity event bypasses suppression" };
  }

  // Check suppression window
  const suppressionWindowMs = overrides?.suppressionWindowMs ?? DEFAULT_SUPPRESSION_WINDOW_MS;
  const nowMs = overrides?.now ? new Date(overrides.now).getTime() : Date.now();
  const evaluatedMs = new Date(baseDecision.evaluatedAt).getTime();
  const elapsed = nowMs - evaluatedMs;

  if (elapsed > suppressionWindowMs) {
    return { renotify: true, reason: `Suppression window expired (${Math.round(elapsed / 60000)}min elapsed)` };
  }

  return { renotify: false, reason: "Within suppression window" };
}

// ---------------------------------------------------------------------------
// Core escalation evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate escalation for all current notification decisions.
 */
export function evaluateNotificationEscalation(
  overrides?: Partial<EscalationInputs>,
): NotificationEscalation[] {
  // Ensure base notification decisions exist
  evaluateAllNotificationPolicies();

  const baseDecisions = listNotificationDecisions();
  const patterns = detectRepeatedNotificationPatterns(overrides);

  const results: NotificationEscalation[] = [];

  for (const decision of baseDecisions) {
    // Find matching repetition pattern
    const pattern = patterns.find((p) => p.eventType === decision.eventType);
    const occurrences = pattern?.occurrenceCount ?? 1;

    // Determine escalation level
    let escalationLevel: EscalationLevel = 0;
    const reasons: string[] = [];

    if (occurrences >= 3) {
      escalationLevel = 2;
      reasons.push(`${occurrences} occurrences of ${decision.eventType} within escalation window`);
      reasons.push("Failure count exceeded threshold (level 2)");
    } else if (occurrences >= 2) {
      escalationLevel = 1;
      reasons.push(`${occurrences} occurrences of ${decision.eventType} within escalation window`);
      reasons.push("Repeated event detected (level 1)");
    }

    // Resolve escalated severity and audience
    const escalatedSeverity = resolveEscalatedSeverity(decision.severity, escalationLevel);
    const escalatedAudience = resolveEscalatedAudience(
      decision.audience,
      escalatedSeverity,
      escalationLevel,
    );

    if (escalatedSeverity !== decision.severity) {
      reasons.push(`Escalated from ${decision.severity} to ${escalatedSeverity}`);
    }
    if (escalatedAudience.length > decision.audience.length) {
      const added = escalatedAudience.filter((a) => !decision.audience.includes(a));
      reasons.push(`Audience escalated: added ${added.join(", ")}`);
    }

    // Determine decision
    let escDecision: EscalationDecisionType = "suppress";

    if (decision.decision === "notify") {
      escDecision = escalationLevel > 0 ? "notify" : "suppress";
    } else {
      // Suppressed or queued base decision → check renotify
      const renotify = shouldRenotify(decision, escalationLevel, escalatedSeverity, overrides);
      if (renotify.renotify) {
        escDecision = "renotify";
        reasons.push(renotify.reason);
      }
    }

    // Only store escalations that are level > 0 or renotify
    if (escalationLevel > 0 || escDecision === "renotify") {
      if (reasons.length === 0) {
        reasons.push("No escalation criteria met");
      }

      const channelHint = escalationLevel >= 2
        ? (ESCALATED_CHANNEL_MAP[decision.channelHint] ?? "ops_urgent")
        : decision.channelHint;

      const escalation: NotificationEscalation = {
        escalationId: nextEscalationId(),
        baseNotificationId: decision.notificationId,
        eventType: decision.eventType,
        escalationLevel,
        baseSeverity: decision.severity,
        severity: escalatedSeverity,
        audience: escalatedAudience,
        decision: escDecision,
        channelHint,
        reasons,
        evaluatedAt: overrides?.now ?? new Date().toISOString(),
      };

      storeEscalation(escalation);
      results.push(escalation);
    }
  }

  // Add overdue review workflow escalations
  const reviewEscalations = evaluateOverdueReviewEscalations(overrides);
  results.push(...reviewEscalations);

  return results;
}

// ---------------------------------------------------------------------------
// Overdue review escalation
// ---------------------------------------------------------------------------

function evaluateOverdueReviewEscalations(
  overrides?: Partial<EscalationInputs>,
): NotificationEscalation[] {
  const results: NotificationEscalation[] = [];

  try {
    evaluateAllWorkflowOps(overrides?.now, overrides?.workflowV3Inputs);
  } catch {
    // Workflow store may not be initialized
    return results;
  }

  const opsRecords = listWorkflowOpsRecords();

  for (const record of opsRecords) {
    if (record.slaStatus === "on_track" && record.escalationStatus === "none") {
      continue;
    }

    const reasons: string[] = [];
    let escalationLevel: EscalationLevel = 0;
    let severity: NotificationSeverity = "info";

    // SLA-based escalation
    if (record.slaStatus === "due_soon") {
      escalationLevel = 1;
      severity = "warning";
      reasons.push(`Review ${record.reviewId} is due soon`);
    } else if (record.slaStatus === "overdue") {
      escalationLevel = 2;
      severity = "high";
      reasons.push(`Review ${record.reviewId} is overdue`);
    }

    // Workflow escalation status
    if (record.escalationStatus === "escalated") {
      escalationLevel = 2;
      severity = "critical";
      reasons.push(`Review ${record.reviewId} escalation status: escalated`);
    }
    if (record.escalationStatus === "notify_owner") {
      if (escalationLevel < 2) escalationLevel = 2;
      if (SEVERITY_LADDER.indexOf(severity) < SEVERITY_LADDER.indexOf("high")) severity = "high";
      reasons.push(`Review ${record.reviewId} escalation: notify_owner`);
    }
    if (record.escalationStatus === "notify_admin") {
      if (escalationLevel < 1) escalationLevel = 1;
      if (severity === "info") severity = "warning";
      reasons.push(`Review ${record.reviewId} escalation: notify_admin`);
    }

    // Re-review required amplifies
    if (record.rereviewRequired) {
      if (escalationLevel < 1) escalationLevel = 1;
      reasons.push(`Review ${record.reviewId} requires re-review`);
    }

    if (reasons.length === 0) continue;

    const audience = resolveOverdueReviewAudience(record, severity);

    const escalation: NotificationEscalation = {
      escalationId: nextEscalationId(),
      baseNotificationId: `review-${record.reviewId}`,
      eventType: "governance.alert",
      escalationLevel,
      baseSeverity: "info",
      severity,
      audience,
      decision: "notify",
      channelHint: severity === "critical" ? "ops_urgent" : "review",
      reasons,
      evaluatedAt: overrides?.now ?? new Date().toISOString(),
    };

    storeEscalation(escalation);
    results.push(escalation);
  }

  return results;
}

function resolveOverdueReviewAudience(
  record: WorkflowOpsRecord,
  severity: NotificationSeverity,
): FactoryRole[] {
  const audience: FactoryRole[] = ["admin"];

  if (record.escalationStatus === "notify_owner" ||
      record.escalationStatus === "escalated" ||
      severity === "critical") {
    audience.push("owner");
  }

  if (record.assignee) {
    if (!audience.includes(record.assignee.role)) {
      audience.push(record.assignee.role);
    }
  }

  return audience;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function listNotificationEscalations(filters?: {
  severity?: NotificationSeverity;
  level?: EscalationLevel;
  eventType?: FactoryEventType;
  decision?: EscalationDecisionType;
  limit?: number;
}): NotificationEscalation[] {
  let results = [...getEscalations()];

  if (filters?.severity) {
    results = results.filter((e) => e.severity === filters.severity);
  }
  if (filters?.level !== undefined) {
    results = results.filter((e) => e.escalationLevel === filters.level);
  }
  if (filters?.eventType) {
    results = results.filter((e) => e.eventType === filters.eventType);
  }
  if (filters?.decision) {
    results = results.filter((e) => e.decision === filters.decision);
  }
  if (filters?.limit) {
    results = results.slice(0, filters.limit);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildNotificationEscalationReport(
  overrides?: Partial<EscalationInputs>,
): EscalationReport {
  // Ensure escalations are evaluated
  if (getEscalations().length === 0) {
    evaluateNotificationEscalation(overrides);
  }

  const escalations = getEscalations();
  const criticalAlerts = escalations.filter((e) => e.severity === "critical");
  const overdueReviewAlerts = escalations.filter(
    (e) => e.baseNotificationId.startsWith("review-"),
  );
  const repeatedFailureAlerts = escalations.filter(
    (e) => e.escalationLevel >= 1 && !e.baseNotificationId.startsWith("review-"),
  );

  const bySeverity: Record<NotificationSeverity, number> = {
    info: 0,
    warning: 0,
    high: 0,
    critical: 0,
  };
  for (const e of escalations) {
    bySeverity[e.severity]++;
  }

  return {
    escalations,
    criticalAlerts,
    overdueReviewAlerts,
    repeatedFailureAlerts,
    summary: {
      totalEscalations: escalations.length,
      level0Count: escalations.filter((e) => e.escalationLevel === 0).length,
      level1Count: escalations.filter((e) => e.escalationLevel === 1).length,
      level2Count: escalations.filter((e) => e.escalationLevel === 2).length,
      notifyCount: escalations.filter((e) => e.decision === "notify").length,
      suppressCount: escalations.filter((e) => e.decision === "suppress").length,
      renotifyCount: escalations.filter((e) => e.decision === "renotify").length,
      bySeverity,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatNotificationEscalation(e: NotificationEscalation): string {
  const levelTag = `[L${e.escalationLevel}]`;
  const sevTag = `[${e.severity.toUpperCase()}]`;
  const decTag = `[${e.decision.toUpperCase()}]`;

  const lines: string[] = [];
  lines.push(`${levelTag} ${sevTag} ${decTag} ${e.eventType}`);
  lines.push(`  Base: ${e.baseNotificationId} (${e.baseSeverity})`);
  lines.push(`  Audience: ${e.audience.join(", ")} | Channel: ${e.channelHint}`);
  for (const reason of e.reasons.slice(0, 5)) {
    lines.push(`  - ${reason}`);
  }
  return lines.join("\n");
}

export function formatNotificationEscalationReport(report: EscalationReport): string {
  const lines: string[] = [];

  lines.push("=== Notification Escalation Report ===");
  lines.push(
    `Total: ${report.summary.totalEscalations} | ` +
    `L0: ${report.summary.level0Count} | ` +
    `L1: ${report.summary.level1Count} | ` +
    `L2: ${report.summary.level2Count}`,
  );
  lines.push(
    `Notify: ${report.summary.notifyCount} | ` +
    `Suppress: ${report.summary.suppressCount} | ` +
    `Renotify: ${report.summary.renotifyCount}`,
  );
  lines.push(
    `Severity → info: ${report.summary.bySeverity.info} | ` +
    `warning: ${report.summary.bySeverity.warning} | ` +
    `high: ${report.summary.bySeverity.high} | ` +
    `critical: ${report.summary.bySeverity.critical}`,
  );
  lines.push("");

  const sections: Array<{ title: string; items: NotificationEscalation[] }> = [
    { title: "── Critical Alerts ──", items: report.criticalAlerts },
    { title: "── Overdue Review Alerts ──", items: report.overdueReviewAlerts },
    { title: "── Repeated Failure Alerts ──", items: report.repeatedFailureAlerts },
  ];

  for (const section of sections) {
    if (section.items.length > 0) {
      lines.push(section.title);
      for (const e of section.items) {
        lines.push(formatNotificationEscalation(e));
        lines.push("");
      }
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
