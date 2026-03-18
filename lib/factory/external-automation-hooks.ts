/**
 * External Automation Hooks v1
 *
 * Provides:
 *   1. Deterministic outbound event payload generation
 *   2. Local event log / delivery queue (in-memory artifact)
 *   3. Inbound trigger validation with role + governance checks
 *   4. Inbound trigger execution via existing local modules
 *   5. Full audit trail for events and triggers
 *
 * Local-first. No external SaaS SDK dependencies.
 * Does NOT auto-execute on event emission.
 * Does NOT bypass governance or approval.
 */

import {
  canPerformFactoryAction,
  resolveActorRole,
  type FactoryActor,
  type FactoryRole,
} from "./team-role-approval";
import {
  checkExecutionGovernance,
  type GovernanceInputs,
} from "./scenario-execution-governance";
import {
  findScenarioById,
  previewScenarioExecution,
  applyScenarioExecution,
  listAvailableScenarios,
  type BridgeInputs,
} from "./scenario-execution-bridge";
import {
  executeRuntimeRun,
  type RuntimeJobGroup,
  ALL_GROUPS,
} from "./factory-runtime-execution";
import {
  executeExport,
  type ExportTarget,
  type ExportFormat,
  type ExportInputs,
} from "./external-export-layer";

// ---------------------------------------------------------------------------
// Types — Outbound Events
// ---------------------------------------------------------------------------

export type FactoryEventType =
  | "scenario.review.ready"
  | "scenario.execution.approved"
  | "scenario.execution.blocked"
  | "scenario.execution.completed"
  | "runtime.job.failed"
  | "template.release.promoted"
  | "template.release.blocked"
  | "marketplace.template.published"
  | "governance.alert";

export interface FactoryEvent {
  eventId: string;
  eventType: FactoryEventType;
  source: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Types — Inbound Triggers
// ---------------------------------------------------------------------------

export type TriggerType =
  | "runtime.run_group"
  | "scenario.preview"
  | "scenario.execute"
  | "export.generate";

export type TriggerStatus = "accepted" | "rejected" | "blocked" | "completed";

export interface TriggerRequest {
  triggerId: string;
  triggerType: TriggerType;
  requestedAt: string;
  requestedBy: FactoryActor;
  parameters: Record<string, unknown>;
  status: TriggerStatus;
  reasons: string[];
  resultPayload?: Record<string, unknown>;
  emittedEventIds: string[];
}

// ---------------------------------------------------------------------------
// Types — Report
// ---------------------------------------------------------------------------

export interface AutomationHooksReport {
  recentEvents: FactoryEvent[];
  recentTriggers: TriggerRequest[];
  summary: {
    totalEvents: number;
    totalTriggers: number;
    acceptedTriggers: number;
    rejectedTriggers: number;
    blockedTriggers: number;
    completedTriggers: number;
    eventTypeCounts: Record<string, number>;
  };
  generatedAt: string;
}

export interface AutomationHooksInputs {
  governanceInputs: Partial<GovernanceInputs>;
  bridgeInputs: Partial<BridgeInputs>;
  exportInputs: Partial<ExportInputs>;
}

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

interface HooksMemoryState {
  events: FactoryEvent[];
  triggers: TriggerRequest[];
}

let memoryState: HooksMemoryState | null = null;

export function useInMemoryStore(initial?: Partial<HooksMemoryState>): void {
  memoryState = {
    events: initial?.events ?? [],
    triggers: initial?.triggers ?? [],
  };
}

export function clearInMemoryStore(): void {
  memoryState = null;
}

function getEvents(): FactoryEvent[] {
  return memoryState?.events ?? [];
}

function getTriggers(): TriggerRequest[] {
  return memoryState?.triggers ?? [];
}

function storeEvent(event: FactoryEvent): void {
  if (memoryState) {
    memoryState.events.push(event);
  }
}

function storeTrigger(trigger: TriggerRequest): void {
  if (memoryState) {
    memoryState.triggers.push(trigger);
  }
}

// ---------------------------------------------------------------------------
// Event ID generator
// ---------------------------------------------------------------------------

let eventCounter = 0;
let triggerCounter = 0;

export function resetCounters(): void {
  eventCounter = 0;
  triggerCounter = 0;
}

function nextEventId(): string {
  eventCounter++;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `evt-${date}-${String(eventCounter).padStart(3, "0")}`;
}

function nextTriggerId(): string {
  triggerCounter++;
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `trg-${date}-${String(triggerCounter).padStart(3, "0")}`;
}

// ---------------------------------------------------------------------------
// Outbound event builders
// ---------------------------------------------------------------------------

export const SUPPORTED_EVENT_TYPES: FactoryEventType[] = [
  "scenario.review.ready",
  "scenario.execution.approved",
  "scenario.execution.blocked",
  "scenario.execution.completed",
  "runtime.job.failed",
  "template.release.promoted",
  "template.release.blocked",
  "marketplace.template.published",
  "governance.alert",
];

const EVENT_SOURCES: Record<FactoryEventType, string> = {
  "scenario.review.ready": "strategic-change-review-board",
  "scenario.execution.approved": "scenario-execution-governance",
  "scenario.execution.blocked": "scenario-execution-governance",
  "scenario.execution.completed": "scenario-execution-bridge",
  "runtime.job.failed": "factory-runtime-execution",
  "template.release.promoted": "template-release-management",
  "template.release.blocked": "template-release-management",
  "marketplace.template.published": "template-marketplace",
  "governance.alert": "scenario-execution-governance",
};

export function buildFactoryEventPayload(
  eventType: FactoryEventType,
  payload: Record<string, unknown>,
): FactoryEvent {
  return {
    eventId: nextEventId(),
    eventType,
    source: EVENT_SOURCES[eventType],
    occurredAt: new Date().toISOString(),
    payload,
  };
}

export function emitFactoryEvent(
  eventType: FactoryEventType,
  payload: Record<string, unknown>,
): FactoryEvent {
  const event = buildFactoryEventPayload(eventType, payload);
  storeEvent(event);
  return event;
}

// ---------------------------------------------------------------------------
// Event listing / filtering
// ---------------------------------------------------------------------------

export function listFactoryEvents(filters?: {
  eventType?: FactoryEventType;
  source?: string;
  limit?: number;
}): FactoryEvent[] {
  let events = getEvents();

  if (filters?.eventType) {
    events = events.filter((e) => e.eventType === filters.eventType);
  }
  if (filters?.source) {
    events = events.filter((e) => e.source === filters.source);
  }

  // Most recent first
  events = [...events].sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt),
  );

  if (filters?.limit && filters.limit > 0) {
    events = events.slice(0, filters.limit);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Trigger listing
// ---------------------------------------------------------------------------

export function listTriggerRequests(filters?: {
  triggerType?: TriggerType;
  status?: TriggerStatus;
  limit?: number;
}): TriggerRequest[] {
  let triggers = getTriggers();

  if (filters?.triggerType) {
    triggers = triggers.filter((t) => t.triggerType === filters.triggerType);
  }
  if (filters?.status) {
    triggers = triggers.filter((t) => t.status === filters.status);
  }

  triggers = [...triggers].sort(
    (a, b) => b.requestedAt.localeCompare(a.requestedAt),
  );

  if (filters?.limit && filters.limit > 0) {
    triggers = triggers.slice(0, filters.limit);
  }

  return triggers;
}

// ---------------------------------------------------------------------------
// Inbound trigger validation
// ---------------------------------------------------------------------------

export const SUPPORTED_TRIGGER_TYPES: TriggerType[] = [
  "runtime.run_group",
  "scenario.preview",
  "scenario.execute",
  "export.generate",
];

interface TriggerValidation {
  valid: boolean;
  reasons: string[];
}

function validateTriggerType(triggerType: string): TriggerValidation {
  if (!SUPPORTED_TRIGGER_TYPES.includes(triggerType as TriggerType)) {
    return { valid: false, reasons: [`Unsupported trigger type: ${triggerType}`] };
  }
  return { valid: true, reasons: [] };
}

function validateTriggerPermissions(
  triggerType: TriggerType,
  actor: FactoryActor,
): TriggerValidation {
  const reasons: string[] = [];

  switch (triggerType) {
    case "export.generate":
      // viewer can export
      if (!canPerformFactoryAction(actor, "dashboard.view")) {
        reasons.push(`Role ${actor.role} cannot access exports`);
      }
      break;
    case "scenario.preview":
      // reviewer+ can preview
      if (!canPerformFactoryAction(actor, "change.preview")) {
        reasons.push(`Role ${actor.role} cannot preview scenarios`);
      }
      break;
    case "runtime.run_group":
      // operator+ can run groups
      if (!canPerformFactoryAction(actor, "orchestration.run")) {
        reasons.push(`Role ${actor.role} cannot run runtime groups`);
      }
      break;
    case "scenario.execute":
      // admin/owner only (will also check governance)
      if (!canPerformFactoryAction(actor, "orchestration.run")) {
        reasons.push(`Role ${actor.role} cannot execute scenarios`);
      }
      break;
  }

  return { valid: reasons.length === 0, reasons };
}

function validateTriggerParameters(
  triggerType: TriggerType,
  params: Record<string, unknown>,
): TriggerValidation {
  const reasons: string[] = [];

  switch (triggerType) {
    case "runtime.run_group": {
      const group = params.group as string | undefined;
      if (!group) {
        reasons.push("Parameter 'group' is required");
      } else if (!ALL_GROUPS.includes(group as RuntimeJobGroup)) {
        reasons.push(`Unknown runtime group: ${group}. Valid: ${ALL_GROUPS.join(", ")}`);
      }
      break;
    }
    case "scenario.preview":
    case "scenario.execute": {
      const scenarioId = params.scenarioId as string | undefined;
      if (!scenarioId) {
        reasons.push("Parameter 'scenarioId' is required");
      }
      break;
    }
    case "export.generate": {
      const target = params.target as string | undefined;
      const validTargets: ExportTarget[] = ["marketplace", "releases", "ranking", "recommendations", "portfolio", "scenarios", "kpis"];
      if (!target) {
        reasons.push("Parameter 'target' is required");
      } else if (!validTargets.includes(target as ExportTarget)) {
        reasons.push(`Unknown export target: ${target}. Valid: ${validTargets.join(", ")}`);
      }
      break;
    }
  }

  return { valid: reasons.length === 0, reasons };
}

export function validateInboundTrigger(
  triggerType: string,
  actor: FactoryActor,
  parameters: Record<string, unknown>,
  overrides?: Partial<AutomationHooksInputs>,
): TriggerValidation {
  // 1. Check trigger type
  const typeCheck = validateTriggerType(triggerType);
  if (!typeCheck.valid) return typeCheck;

  const tt = triggerType as TriggerType;

  // 2. Check permissions
  const permCheck = validateTriggerPermissions(tt, actor);
  if (!permCheck.valid) return permCheck;

  // 3. Check parameters
  const paramCheck = validateTriggerParameters(tt, parameters);
  if (!paramCheck.valid) return paramCheck;

  // 4. Check governance for scenario.execute
  if (tt === "scenario.execute") {
    const scenarioId = parameters.scenarioId as string;
    const govCheck = checkExecutionGovernance(
      scenarioId,
      actor,
      overrides?.governanceInputs,
    );
    if (!govCheck.allowed) {
      return { valid: false, reasons: [govCheck.reason] };
    }
  }

  return { valid: true, reasons: [] };
}

// ---------------------------------------------------------------------------
// Inbound trigger execution
// ---------------------------------------------------------------------------

export function executeInboundTrigger(
  triggerType: TriggerType,
  actor: FactoryActor,
  parameters: Record<string, unknown>,
  overrides?: Partial<AutomationHooksInputs>,
): TriggerRequest {
  const triggerId = nextTriggerId();
  const requestedAt = new Date().toISOString();

  // Validate
  const validation = validateInboundTrigger(triggerType, actor, parameters, overrides);

  if (!validation.valid) {
    const status: TriggerStatus = triggerType === "scenario.execute"
      ? "blocked"
      : "rejected";

    const trigger: TriggerRequest = {
      triggerId,
      triggerType,
      requestedAt,
      requestedBy: actor,
      parameters,
      status,
      reasons: validation.reasons,
      emittedEventIds: [],
    };

    storeTrigger(trigger);
    return trigger;
  }

  // Execute
  const emittedEventIds: string[] = [];
  let resultPayload: Record<string, unknown> | undefined;
  let status: TriggerStatus = "accepted";

  try {
    switch (triggerType) {
      case "runtime.run_group": {
        const group = parameters.group as RuntimeJobGroup;
        const result = executeRuntimeRun({ group, actor });
        resultPayload = {
          runId: result.runId,
          group: result.group,
          status: result.status,
          totalJobs: result.totalJobs,
          completedJobs: result.completedJobs,
          failedJobs: result.failedJobs,
        };

        // Emit events for failed jobs
        for (const job of result.jobs) {
          if (job.status === "failed") {
            const evt = emitFactoryEvent("runtime.job.failed", {
              runId: result.runId,
              jobId: job.jobId,
              error: job.error,
              group,
            });
            emittedEventIds.push(evt.eventId);
          }
        }

        status = "completed";
        break;
      }

      case "scenario.preview": {
        const scenarioId = parameters.scenarioId as string;
        const scenario = findScenarioById(scenarioId, overrides?.bridgeInputs);
        if (!scenario) {
          const trigger: TriggerRequest = {
            triggerId,
            triggerType,
            requestedAt,
            requestedBy: actor,
            parameters,
            status: "rejected",
            reasons: [`Scenario not found: ${scenarioId}`],
            emittedEventIds: [],
          };
          storeTrigger(trigger);
          return trigger;
        }
        const preview = previewScenarioExecution(scenario, actor, overrides?.bridgeInputs);
        resultPayload = {
          executionId: preview.executionId,
          scenarioId: preview.scenarioId,
          mode: preview.mode,
          status: preview.status,
          totalJobs: preview.summary.totalJobs,
        };
        status = "completed";
        break;
      }

      case "scenario.execute": {
        const scenarioId = parameters.scenarioId as string;
        const scenario = findScenarioById(scenarioId, overrides?.bridgeInputs);
        if (!scenario) {
          const trigger: TriggerRequest = {
            triggerId,
            triggerType,
            requestedAt,
            requestedBy: actor,
            parameters,
            status: "rejected",
            reasons: [`Scenario not found: ${scenarioId}`],
            emittedEventIds: [],
          };
          storeTrigger(trigger);
          return trigger;
        }
        const result = applyScenarioExecution(scenario, actor, overrides?.bridgeInputs);
        resultPayload = {
          executionId: result.executionId,
          scenarioId: result.scenarioId,
          status: result.status,
          summary: result.summary,
        };

        // Emit completion event
        const compEvt = emitFactoryEvent("scenario.execution.completed", {
          scenarioId: result.scenarioId,
          status: result.status,
          summary: result.summary,
        });
        emittedEventIds.push(compEvt.eventId);

        status = "completed";
        break;
      }

      case "export.generate": {
        const target = parameters.target as ExportTarget;
        const format = (parameters.format as ExportFormat) ?? "json";
        const result = executeExport({ target, format }, overrides?.exportInputs);
        resultPayload = {
          target,
          format,
          recordCount: result.json?.recordCount ?? 0,
          hasCsv: !!result.csv,
        };
        status = "completed";
        break;
      }
    }
  } catch (err) {
    status = "rejected";
    resultPayload = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const trigger: TriggerRequest = {
    triggerId,
    triggerType,
    requestedAt,
    requestedBy: actor,
    parameters,
    status,
    reasons: status === "completed" ? ["Trigger executed successfully"] : validation.reasons,
    resultPayload,
    emittedEventIds,
  };

  storeTrigger(trigger);
  return trigger;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildAutomationHooksReport(): AutomationHooksReport {
  const events = getEvents();
  const triggers = getTriggers();

  const eventTypeCounts: Record<string, number> = {};
  for (const e of events) {
    eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] ?? 0) + 1;
  }

  return {
    recentEvents: [...events].sort(
      (a, b) => b.occurredAt.localeCompare(a.occurredAt),
    ),
    recentTriggers: [...triggers].sort(
      (a, b) => b.requestedAt.localeCompare(a.requestedAt),
    ),
    summary: {
      totalEvents: events.length,
      totalTriggers: triggers.length,
      acceptedTriggers: triggers.filter((t) => t.status === "accepted").length,
      rejectedTriggers: triggers.filter((t) => t.status === "rejected").length,
      blockedTriggers: triggers.filter((t) => t.status === "blocked").length,
      completedTriggers: triggers.filter((t) => t.status === "completed").length,
      eventTypeCounts,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatFactoryEvent(event: FactoryEvent): string {
  const lines: string[] = [];
  lines.push(`[${event.eventType}] ${event.eventId}`);
  lines.push(`  Source: ${event.source}`);
  lines.push(`  At: ${event.occurredAt}`);
  const keys = Object.keys(event.payload).slice(0, 4);
  for (const k of keys) {
    const v = event.payload[k];
    const display = typeof v === "object" ? JSON.stringify(v) : String(v);
    lines.push(`  ${k}: ${display}`);
  }
  return lines.join("\n");
}

export function formatTriggerRequest(trigger: TriggerRequest): string {
  const lines: string[] = [];
  lines.push(`[${trigger.triggerType}] ${trigger.triggerId} — ${trigger.status.toUpperCase()}`);
  lines.push(`  By: ${trigger.requestedBy.actorId} (${trigger.requestedBy.role})`);
  lines.push(`  At: ${trigger.requestedAt}`);
  if (trigger.reasons.length > 0) {
    lines.push(`  Reason: ${trigger.reasons[0]}`);
  }
  if (trigger.emittedEventIds.length > 0) {
    lines.push(`  Events: ${trigger.emittedEventIds.join(", ")}`);
  }
  return lines.join("\n");
}

export function formatAutomationHooksReport(report: AutomationHooksReport): string {
  const lines: string[] = [];

  lines.push("=== External Automation Hooks Report ===");
  lines.push(`Events: ${report.summary.totalEvents} | Triggers: ${report.summary.totalTriggers}`);
  lines.push(`Completed: ${report.summary.completedTriggers} | Rejected: ${report.summary.rejectedTriggers} | Blocked: ${report.summary.blockedTriggers}`);
  lines.push("");

  if (report.recentEvents.length > 0) {
    lines.push("── Recent Events ──");
    for (const e of report.recentEvents.slice(0, 10)) {
      lines.push(formatFactoryEvent(e));
      lines.push("");
    }
  }

  if (report.recentTriggers.length > 0) {
    lines.push("── Recent Triggers ──");
    for (const t of report.recentTriggers.slice(0, 10)) {
      lines.push(formatTriggerRequest(t));
      lines.push("");
    }
  }

  lines.push(`Generated: ${report.generatedAt}`);
  return lines.join("\n");
}
