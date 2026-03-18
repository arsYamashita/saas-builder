/**
 * Notification Policy Layer v1
 *
 * Provides:
 *   1. Deterministic severity classification for Factory events
 *   2. Role-based audience routing
 *   3. Suppression rules for low-value/duplicate events
 *   4. Notification-ready decision queue (local artifact)
 *   5. Explainable decisions with reasons
 *
 * Local-first. No external delivery SDKs.
 * Does NOT send real notifications to third parties.
 */

import {
  type FactoryEvent,
  type FactoryEventType,
  listFactoryEvents,
} from "./external-automation-hooks";
import { type FactoryRole } from "./team-role-approval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationSeverity = "info" | "warning" | "high" | "critical";

export type NotificationDecisionType = "notify" | "suppress" | "queue";

export type NotificationChannelHint = "ops" | "review" | "release" | "general";

export interface NotificationDecision {
  notificationId: string;
  eventId: string;
  eventType: FactoryEventType;
  severity: NotificationSeverity;
  audience: FactoryRole[];
  decision: NotificationDecisionType;
  channelHint: NotificationChannelHint;
  reasons: string[];
  evaluatedAt: string;
}

export interface SuppressionRule {
  ruleId: string;
  eventType: FactoryEventType;
  condition: "always" | "duplicate" | "low_priority";
  description: string;
}

export interface NotificationPolicyReport {
  decisions: NotificationDecision[];
  notifyItems: NotificationDecision[];
  queuedItems: NotificationDecision[];
  suppressedItems: NotificationDecision[];
  summary: {
    totalDecisions: number;
    notifyCount: number;
    queuedCount: number;
    suppressedCount: number;
    bySeverity: Record<NotificationSeverity, number>;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface NotificationMemoryState {
  decisions: NotificationDecision[];
  suppressionRules: SuppressionRule[];
  seenEventIds: Set<string>;
}

let memoryState: NotificationMemoryState | null = null;

export function useInMemoryStore(initial?: {
  decisions?: NotificationDecision[];
  suppressionRules?: SuppressionRule[];
}): void {
  memoryState = {
    decisions: initial?.decisions ?? [],
    suppressionRules: initial?.suppressionRules ?? [...DEFAULT_SUPPRESSION_RULES],
    seenEventIds: new Set(
      (initial?.decisions ?? []).map((d) => d.eventId),
    ),
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getDecisions(): NotificationDecision[] {
  return memoryState?.decisions ?? [];
}

function getSuppressionRules(): SuppressionRule[] {
  return memoryState?.suppressionRules ?? DEFAULT_SUPPRESSION_RULES;
}

function storeDecision(decision: NotificationDecision): void {
  if (memoryState) {
    memoryState.decisions.push(decision);
    memoryState.seenEventIds.add(decision.eventId);
  }
}

function hasSeenEvent(eventId: string): boolean {
  return memoryState?.seenEventIds.has(eventId) ?? false;
}

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let notificationCounter = 0;

export function resetCounters(): void {
  notificationCounter = 0;
}

function nextNotificationId(): string {
  notificationCounter++;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ntf-${date}-${String(notificationCounter).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Severity classification
// ---------------------------------------------------------------------------

const BASE_SEVERITY: Record<FactoryEventType, NotificationSeverity> = {
  "scenario.review.ready": "info",
  "scenario.execution.approved": "info",
  "scenario.execution.blocked": "high",
  "scenario.execution.completed": "info",
  "runtime.job.failed": "high",
  "template.release.promoted": "info",
  "template.release.blocked": "warning",
  "marketplace.template.published": "info",
  "governance.alert": "warning",
};

export function classifyNotificationSeverity(
  event: FactoryEvent,
): NotificationSeverity {
  const base = BASE_SEVERITY[event.eventType] ?? "info";

  // Escalate governance.alert based on payload
  if (event.eventType === "governance.alert") {
    const level = event.payload.level as string | undefined;
    if (level === "critical") return "critical";
    if (level === "high") return "high";
    return "warning";
  }

  // Escalate runtime failures with multiple jobs
  if (event.eventType === "runtime.job.failed") {
    const failedCount = event.payload.failedJobs as number | undefined;
    if (failedCount !== undefined && failedCount > 3) return "critical";
    return "high";
  }

  // Escalate blocked scenarios
  if (event.eventType === "scenario.execution.blocked") {
    return "high";
  }

  // Escalate review.ready based on priority
  if (event.eventType === "scenario.review.ready") {
    const priority = event.payload.priority as number | undefined;
    if (priority !== undefined && priority > 0.8) return "warning";
    return "info";
  }

  return base;
}

// ---------------------------------------------------------------------------
// Audience routing
// ---------------------------------------------------------------------------

const AUDIENCE_MAP: Record<FactoryEventType, FactoryRole[]> = {
  "scenario.review.ready": ["reviewer", "admin", "owner"],
  "scenario.execution.approved": ["admin", "owner"],
  "scenario.execution.blocked": ["admin", "owner"],
  "scenario.execution.completed": ["admin", "owner", "operator"],
  "runtime.job.failed": ["admin", "owner"],
  "template.release.promoted": ["admin", "owner"],
  "template.release.blocked": ["admin", "owner"],
  "marketplace.template.published": ["admin", "owner"],
  "governance.alert": ["admin", "owner"],
};

export function resolveNotificationAudience(
  event: FactoryEvent,
  severity: NotificationSeverity,
): FactoryRole[] {
  const base = AUDIENCE_MAP[event.eventType] ?? ["admin", "owner"];

  // Critical events also notify operator
  if (severity === "critical" && !base.includes("operator")) {
    return [...base, "operator"];
  }

  return base;
}

// ---------------------------------------------------------------------------
// Channel hint
// ---------------------------------------------------------------------------

const CHANNEL_MAP: Record<FactoryEventType, NotificationChannelHint> = {
  "scenario.review.ready": "review",
  "scenario.execution.approved": "review",
  "scenario.execution.blocked": "ops",
  "scenario.execution.completed": "ops",
  "runtime.job.failed": "ops",
  "template.release.promoted": "release",
  "template.release.blocked": "release",
  "marketplace.template.published": "release",
  "governance.alert": "ops",
};

function resolveChannelHint(eventType: FactoryEventType): NotificationChannelHint {
  return CHANNEL_MAP[eventType] ?? "general";
}

// ---------------------------------------------------------------------------
// Suppression rules
// ---------------------------------------------------------------------------

const DEFAULT_SUPPRESSION_RULES: SuppressionRule[] = [
  {
    ruleId: "suppress-completed-info",
    eventType: "scenario.execution.completed",
    condition: "low_priority",
    description: "Suppress completed scenario notifications when low priority",
  },
  {
    ruleId: "suppress-release-promoted-info",
    eventType: "template.release.promoted",
    condition: "low_priority",
    description: "Suppress routine release promotion notifications",
  },
];

function shouldSuppress(
  event: FactoryEvent,
  severity: NotificationSeverity,
  rules: SuppressionRule[],
): { suppressed: boolean; reason: string } {
  // Duplicate suppression
  if (hasSeenEvent(event.eventId)) {
    return { suppressed: true, reason: "Duplicate event already processed" };
  }

  // Rule-based suppression
  for (const rule of rules) {
    if (rule.eventType !== event.eventType) continue;

    if (rule.condition === "always") {
      return { suppressed: true, reason: rule.description };
    }

    if (rule.condition === "low_priority" && severity === "info") {
      const priority = event.payload.priority as number | undefined;
      if (priority === undefined || priority < 0.3) {
        return { suppressed: true, reason: rule.description };
      }
    }
  }

  return { suppressed: false, reason: "" };
}

// ---------------------------------------------------------------------------
// Policy evaluation
// ---------------------------------------------------------------------------

export function evaluateNotificationPolicy(
  event: FactoryEvent,
): NotificationDecision {
  const severity = classifyNotificationSeverity(event);
  const audience = resolveNotificationAudience(event, severity);
  const channelHint = resolveChannelHint(event.eventType);
  const reasons: string[] = [];

  // Check suppression
  const suppression = shouldSuppress(event, severity, getSuppressionRules());
  if (suppression.suppressed) {
    const decision: NotificationDecision = {
      notificationId: nextNotificationId(),
      eventId: event.eventId,
      eventType: event.eventType,
      severity,
      audience,
      decision: "suppress",
      channelHint,
      reasons: [suppression.reason],
      evaluatedAt: new Date().toISOString(),
    };
    storeDecision(decision);
    return decision;
  }

  // Build reasons
  reasons.push(`Event type: ${event.eventType}`);
  reasons.push(`Severity: ${severity}`);

  if (severity === "critical" || severity === "high") {
    reasons.push("Operational intervention may be required");
  }

  if (event.eventType === "scenario.execution.blocked") {
    reasons.push("Scenario execution was blocked");
  } else if (event.eventType === "runtime.job.failed") {
    reasons.push("Runtime job failure detected");
  } else if (event.eventType === "scenario.review.ready") {
    reasons.push("Review item is ready for decision");
  } else if (event.eventType === "template.release.blocked") {
    reasons.push("Template release was blocked");
  } else if (event.eventType === "governance.alert") {
    reasons.push("Governance alert raised");
  }

  // Determine notify vs queue
  let decisionType: NotificationDecisionType;
  if (severity === "critical" || severity === "high") {
    decisionType = "notify";
  } else if (severity === "warning") {
    decisionType = "notify";
  } else {
    decisionType = "queue";
  }

  const decision: NotificationDecision = {
    notificationId: nextNotificationId(),
    eventId: event.eventId,
    eventType: event.eventType,
    severity,
    audience,
    decision: decisionType,
    channelHint,
    reasons,
    evaluatedAt: new Date().toISOString(),
  };

  storeDecision(decision);
  return decision;
}

/**
 * Evaluate policies for all current events from the automation hooks store.
 */
export function evaluateAllNotificationPolicies(): NotificationDecision[] {
  const events = listFactoryEvents();
  return events.map((e) => evaluateNotificationPolicy(e));
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export function listNotificationDecisions(filters?: {
  severity?: NotificationSeverity;
  decision?: NotificationDecisionType;
  eventType?: FactoryEventType;
  limit?: number;
}): NotificationDecision[] {
  let decisions = getDecisions();

  if (filters?.severity) {
    decisions = decisions.filter((d) => d.severity === filters.severity);
  }
  if (filters?.decision) {
    decisions = decisions.filter((d) => d.decision === filters.decision);
  }
  if (filters?.eventType) {
    decisions = decisions.filter((d) => d.eventType === filters.eventType);
  }

  decisions = [...decisions].sort(
    (a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt),
  );

  if (filters?.limit && filters.limit > 0) {
    decisions = decisions.slice(0, filters.limit);
  }

  return decisions;
}

export function getNotificationDecisionByEventId(
  eventId: string,
): NotificationDecision | null {
  return getDecisions().find((d) => d.eventId === eventId) ?? null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildNotificationPolicyReport(): NotificationPolicyReport {
  const decisions = getDecisions();

  const notifyItems = decisions.filter((d) => d.decision === "notify");
  const queuedItems = decisions.filter((d) => d.decision === "queue");
  const suppressedItems = decisions.filter((d) => d.decision === "suppress");

  const bySeverity: Record<NotificationSeverity, number> = {
    info: 0,
    warning: 0,
    high: 0,
    critical: 0,
  };
  for (const d of decisions) {
    bySeverity[d.severity]++;
  }

  return {
    decisions,
    notifyItems,
    queuedItems,
    suppressedItems,
    summary: {
      totalDecisions: decisions.length,
      notifyCount: notifyItems.length,
      queuedCount: queuedItems.length,
      suppressedCount: suppressedItems.length,
      bySeverity,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SEVERITY_ICONS: Record<NotificationSeverity, string> = {
  info: "[INFO]",
  warning: "[WARN]",
  high: "[HIGH]",
  critical: "[CRIT]",
};

export function formatNotificationDecision(d: NotificationDecision): string {
  const lines: string[] = [];
  lines.push(`${SEVERITY_ICONS[d.severity]} ${d.eventType} — ${d.decision.toUpperCase()}`);
  lines.push(`  ID: ${d.notificationId} | Event: ${d.eventId}`);
  lines.push(`  Audience: ${d.audience.join(", ")} | Channel: ${d.channelHint}`);
  for (const r of d.reasons.slice(0, 3)) {
    lines.push(`  - ${r}`);
  }
  return lines.join("\n");
}

export function formatNotificationPolicyReport(report: NotificationPolicyReport): string {
  const lines: string[] = [];

  lines.push("=== Notification Policy Report ===");
  lines.push(
    `Total: ${report.summary.totalDecisions} | ` +
    `Notify: ${report.summary.notifyCount} | ` +
    `Queued: ${report.summary.queuedCount} | ` +
    `Suppressed: ${report.summary.suppressedCount}`,
  );
  lines.push(
    `Info: ${report.summary.bySeverity.info} | ` +
    `Warning: ${report.summary.bySeverity.warning} | ` +
    `High: ${report.summary.bySeverity.high} | ` +
    `Critical: ${report.summary.bySeverity.critical}`,
  );
  lines.push("");

  if (report.notifyItems.length > 0) {
    lines.push("── Notify ──");
    for (const d of report.notifyItems) {
      lines.push(formatNotificationDecision(d));
      lines.push("");
    }
  }

  if (report.queuedItems.length > 0) {
    lines.push("── Queued ──");
    for (const d of report.queuedItems) {
      lines.push(formatNotificationDecision(d));
      lines.push("");
    }
  }

  if (report.suppressedItems.length > 0) {
    lines.push("── Suppressed ──");
    for (const d of report.suppressedItems) {
      lines.push(formatNotificationDecision(d));
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
