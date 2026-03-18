import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  emitFactoryEvent,
  buildFactoryEventPayload,
  listFactoryEvents,
  listTriggerRequests,
  validateInboundTrigger,
  executeInboundTrigger,
  buildAutomationHooksReport,
  formatFactoryEvent,
  formatTriggerRequest,
  formatAutomationHooksReport,
  useInMemoryStore,
  clearInMemoryStore,
  resetCounters,
  SUPPORTED_EVENT_TYPES,
  SUPPORTED_TRIGGER_TYPES,
  type FactoryEventType,
  type TriggerType,
} from "../external-automation-hooks";
import { resolveActorRole, type FactoryActor } from "../team-role-approval";
import {
  useInMemoryStore as useGovernanceStore,
  clearInMemoryStore as clearGovernanceStore,
  recordScenarioExecutionDecision,
} from "../scenario-execution-governance";
import {
  useInMemoryStore as useBridgeStore,
  clearInMemoryStore as clearBridgeStore,
  listAvailableScenarios,
} from "../scenario-execution-bridge";
import {
  useInMemoryStore as useRuntimeStore,
  clearInMemoryStore as clearRuntimeStore,
} from "../factory-runtime-execution";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function admin(): FactoryActor {
  return resolveActorRole("admin-1", "admin");
}

function reviewer(): FactoryActor {
  return resolveActorRole("reviewer-1", "reviewer");
}

function viewer(): FactoryActor {
  return resolveActorRole("viewer-1", "viewer");
}

function operator(): FactoryActor {
  return resolveActorRole("operator-1", "operator");
}

// ---------------------------------------------------------------------------

describe("External Automation Hooks", () => {
  beforeEach(() => {
    useInMemoryStore();
    useGovernanceStore();
    useBridgeStore();
    useRuntimeStore();
    resetCounters();
  });

  afterEach(() => {
    clearInMemoryStore();
    clearGovernanceStore();
    clearBridgeStore();
    clearRuntimeStore();
  });

  // ── 1. Outbound events generated deterministically ──────────

  describe("outbound event generation", () => {
    it("generates deterministic event IDs", () => {
      const e1 = emitFactoryEvent("scenario.review.ready", { scenarioId: "s1" });
      const e2 = emitFactoryEvent("scenario.review.ready", { scenarioId: "s2" });
      expect(e1.eventId).toMatch(/^evt-\d{8}-001$/);
      expect(e2.eventId).toMatch(/^evt-\d{8}-002$/);
    });

    it("event payloads preserve provided data", () => {
      const payload = { scenarioId: "expand_reservation_3", status: "ready" };
      const event = emitFactoryEvent("scenario.review.ready", payload);
      expect(event.payload.scenarioId).toBe("expand_reservation_3");
      expect(event.payload.status).toBe("ready");
      expect(event.eventType).toBe("scenario.review.ready");
    });

    it("buildFactoryEventPayload does not store event", () => {
      buildFactoryEventPayload("governance.alert", { msg: "test" });
      const events = listFactoryEvents();
      expect(events).toHaveLength(0);
    });

    it("emitFactoryEvent stores event in log", () => {
      emitFactoryEvent("runtime.job.failed", { jobId: "j1" });
      const events = listFactoryEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("runtime.job.failed");
    });
  });

  // ── 2. Supported event types emit correct payloads ──────────

  describe("supported event types", () => {
    it("all 9 event types are supported", () => {
      expect(SUPPORTED_EVENT_TYPES).toHaveLength(9);
    });

    it("each event type maps to a known source", () => {
      for (const eventType of SUPPORTED_EVENT_TYPES) {
        const event = buildFactoryEventPayload(eventType, { test: true });
        expect(event.source).toBeTruthy();
        expect(event.eventType).toBe(eventType);
        expect(event.occurredAt).toBeTruthy();
      }
    });

    it("scenario events map to governance/bridge sources", () => {
      const approved = buildFactoryEventPayload("scenario.execution.approved", {});
      expect(approved.source).toBe("scenario-execution-governance");

      const completed = buildFactoryEventPayload("scenario.execution.completed", {});
      expect(completed.source).toBe("scenario-execution-bridge");
    });
  });

  // ── 3. Inbound trigger validation works ─────────────────────

  describe("inbound trigger validation", () => {
    it("rejects unsupported trigger type", () => {
      const result = validateInboundTrigger("invalid.type", admin(), {});
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("Unsupported");
    });

    it("validates required parameters for runtime.run_group", () => {
      const result = validateInboundTrigger("runtime.run_group", admin(), {});
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("group");
    });

    it("validates required parameters for scenario.preview", () => {
      const result = validateInboundTrigger("scenario.preview", reviewer(), {});
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("scenarioId");
    });

    it("validates export.generate target parameter", () => {
      const result = validateInboundTrigger("export.generate", viewer(), {
        target: "invalid_target",
      });
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("Unknown export target");
    });

    it("accepts valid export.generate trigger", () => {
      const result = validateInboundTrigger("export.generate", viewer(), {
        target: "kpis",
      });
      expect(result.valid).toBe(true);
    });

    it("all 4 trigger types are supported", () => {
      expect(SUPPORTED_TRIGGER_TYPES).toHaveLength(4);
    });
  });

  // ── 4. Unauthorized triggers are rejected ───────────────────

  describe("unauthorized triggers", () => {
    it("viewer cannot trigger runtime.run_group", () => {
      const result = validateInboundTrigger("runtime.run_group", viewer(), {
        group: "nightly",
      });
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("cannot run runtime groups");
    });

    it("viewer can trigger scenario.preview (has change.preview permission)", () => {
      // Viewers have change.preview in the permission matrix
      const result = validateInboundTrigger("scenario.preview", viewer(), {
        scenarioId: "s1",
      });
      expect(result.valid).toBe(true);
    });

    it("viewer cannot trigger scenario.execute", () => {
      const result = validateInboundTrigger("scenario.execute", viewer(), {
        scenarioId: "s1",
      });
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("cannot execute");
    });

    it("reviewer cannot trigger scenario.execute", () => {
      const result = validateInboundTrigger("scenario.execute", reviewer(), {
        scenarioId: "s1",
      });
      expect(result.valid).toBe(false);
      expect(result.reasons[0]).toContain("cannot execute");
    });
  });

  // ── 5. scenario.execute respects governance gate ────────────

  describe("scenario.execute governance gate", () => {
    it("blocks execution when governance blocks scenario", () => {
      const trigger = executeInboundTrigger(
        "scenario.execute",
        admin(),
        { scenarioId: "nonexistent_scenario" },
      );
      // Either blocked or rejected due to governance
      expect(["blocked", "rejected"]).toContain(trigger.status);
    });

    it("rejected triggers do not emit events", () => {
      const trigger = executeInboundTrigger(
        "scenario.execute",
        viewer(),
        { scenarioId: "s1" },
      );
      expect(trigger.status).not.toBe("completed");
      expect(trigger.emittedEventIds).toHaveLength(0);
    });
  });

  // ── 6. runtime.run_group respects role authorization ────────

  describe("runtime.run_group authorization", () => {
    it("admin can run group", () => {
      const trigger = executeInboundTrigger(
        "runtime.run_group",
        admin(),
        { group: "health_check" },
      );
      expect(trigger.status).toBe("completed");
      expect(trigger.resultPayload).toBeDefined();
      expect(trigger.resultPayload?.group).toBe("health_check");
    });

    it("operator can run group", () => {
      const trigger = executeInboundTrigger(
        "runtime.run_group",
        operator(),
        { group: "health_check" },
      );
      expect(trigger.status).toBe("completed");
    });

    it("viewer cannot run group", () => {
      const trigger = executeInboundTrigger(
        "runtime.run_group",
        viewer(),
        { group: "nightly" },
      );
      expect(trigger.status).toBe("rejected");
      expect(trigger.reasons[0]).toContain("cannot run");
    });

    it("rejects invalid group name", () => {
      const trigger = executeInboundTrigger(
        "runtime.run_group",
        admin(),
        { group: "invalid_group" },
      );
      expect(trigger.status).toBe("rejected");
      expect(trigger.reasons[0]).toContain("Unknown runtime group");
    });
  });

  // ── 7. export.generate works as read-only trigger ───────────

  describe("export.generate", () => {
    it("viewer can export kpis as json", () => {
      const trigger = executeInboundTrigger(
        "export.generate",
        viewer(),
        { target: "kpis", format: "json" },
      );
      expect(trigger.status).toBe("completed");
      expect(trigger.resultPayload?.target).toBe("kpis");
      expect(trigger.resultPayload?.format).toBe("json");
    });

    it("viewer can export marketplace as csv", () => {
      const trigger = executeInboundTrigger(
        "export.generate",
        viewer(),
        { target: "marketplace", format: "csv" },
      );
      expect(trigger.status).toBe("completed");
    });

    it("defaults to json format", () => {
      const trigger = executeInboundTrigger(
        "export.generate",
        viewer(),
        { target: "ranking" },
      );
      expect(trigger.status).toBe("completed");
      expect(trigger.resultPayload?.format).toBe("json");
    });
  });

  // ── 8. Event/trigger history is recorded correctly ──────────

  describe("history recording", () => {
    it("events are stored and retrievable", () => {
      emitFactoryEvent("governance.alert", { msg: "a1" });
      emitFactoryEvent("runtime.job.failed", { jobId: "j1" });
      emitFactoryEvent("governance.alert", { msg: "a2" });

      const all = listFactoryEvents();
      expect(all).toHaveLength(3);

      const alerts = listFactoryEvents({ eventType: "governance.alert" });
      expect(alerts).toHaveLength(2);
    });

    it("triggers are stored and retrievable", () => {
      executeInboundTrigger("export.generate", viewer(), { target: "kpis" });
      executeInboundTrigger("runtime.run_group", viewer(), { group: "nightly" }); // rejected

      const all = listTriggerRequests();
      expect(all).toHaveLength(2);

      const rejected = listTriggerRequests({ status: "rejected" });
      expect(rejected).toHaveLength(1);

      const completed = listTriggerRequests({ status: "completed" });
      expect(completed).toHaveLength(1);
    });

    it("trigger records include actor info", () => {
      const trigger = executeInboundTrigger(
        "export.generate",
        viewer(),
        { target: "kpis" },
      );
      expect(trigger.requestedBy.actorId).toBe("viewer-1");
      expect(trigger.requestedBy.role).toBe("viewer");
    });

    it("event filtering supports limit", () => {
      for (let i = 0; i < 5; i++) {
        emitFactoryEvent("governance.alert", { idx: i });
      }
      const limited = listFactoryEvents({ limit: 3 });
      expect(limited).toHaveLength(3);
    });
  });

  // ── 9. Report structure ─────────────────────────────────────

  describe("report", () => {
    it("report has correct structure", () => {
      emitFactoryEvent("governance.alert", { msg: "test" });
      executeInboundTrigger("export.generate", viewer(), { target: "kpis" });

      const report = buildAutomationHooksReport();
      expect(report.recentEvents).toHaveLength(1);
      expect(report.recentTriggers).toHaveLength(1);
      expect(report.summary.totalEvents).toBe(1);
      expect(report.summary.totalTriggers).toBe(1);
      expect(report.summary.completedTriggers).toBe(1);
      expect(report.generatedAt).toBeTruthy();
    });

    it("eventTypeCounts are correct", () => {
      emitFactoryEvent("governance.alert", { a: 1 });
      emitFactoryEvent("governance.alert", { a: 2 });
      emitFactoryEvent("runtime.job.failed", { j: 1 });

      const report = buildAutomationHooksReport();
      expect(report.summary.eventTypeCounts["governance.alert"]).toBe(2);
      expect(report.summary.eventTypeCounts["runtime.job.failed"]).toBe(1);
    });

    it("report summary counts accepted/rejected/blocked", () => {
      executeInboundTrigger("export.generate", viewer(), { target: "kpis" }); // completed
      executeInboundTrigger("runtime.run_group", viewer(), { group: "nightly" }); // rejected
      executeInboundTrigger("runtime.run_group", admin(), { group: "health_check" }); // completed

      const report = buildAutomationHooksReport();
      expect(report.summary.completedTriggers).toBe(2);
      expect(report.summary.rejectedTriggers).toBe(1);
    });
  });

  // ── 10. Formatting ──────────────────────────────────────────

  describe("formatting", () => {
    it("formatFactoryEvent produces readable output", () => {
      const event = emitFactoryEvent("scenario.execution.completed", {
        scenarioId: "s1",
        status: "completed",
      });
      const text = formatFactoryEvent(event);
      expect(text).toContain("scenario.execution.completed");
      expect(text).toContain(event.eventId);
      expect(text).toContain("scenarioId: s1");
    });

    it("formatTriggerRequest produces readable output", () => {
      const trigger = executeInboundTrigger(
        "export.generate",
        viewer(),
        { target: "kpis" },
      );
      const text = formatTriggerRequest(trigger);
      expect(text).toContain("export.generate");
      expect(text).toContain("COMPLETED");
      expect(text).toContain("viewer-1");
    });

    it("formatAutomationHooksReport produces full report", () => {
      emitFactoryEvent("governance.alert", { msg: "test" });
      executeInboundTrigger("export.generate", viewer(), { target: "kpis" });

      const report = buildAutomationHooksReport();
      const text = formatAutomationHooksReport(report);
      expect(text).toContain("External Automation Hooks Report");
      expect(text).toContain("Recent Events");
      expect(text).toContain("Recent Triggers");
    });
  });

  // ── 11. Same inputs yield same outputs ──────────────────────

  describe("determinism", () => {
    it("same trigger type and params produce consistent validation", () => {
      const v1 = validateInboundTrigger("export.generate", viewer(), { target: "kpis" });
      const v2 = validateInboundTrigger("export.generate", viewer(), { target: "kpis" });
      expect(v1.valid).toBe(v2.valid);
      expect(v1.reasons).toEqual(v2.reasons);
    });

    it("same invalid trigger consistently rejects", () => {
      const v1 = validateInboundTrigger("runtime.run_group", viewer(), { group: "nightly" });
      const v2 = validateInboundTrigger("runtime.run_group", viewer(), { group: "nightly" });
      expect(v1.valid).toBe(false);
      expect(v2.valid).toBe(false);
      expect(v1.reasons).toEqual(v2.reasons);
    });

    it("event source mapping is deterministic across all types", () => {
      const sources1 = SUPPORTED_EVENT_TYPES.map(
        (t) => buildFactoryEventPayload(t, {}).source,
      );
      resetCounters();
      const sources2 = SUPPORTED_EVENT_TYPES.map(
        (t) => buildFactoryEventPayload(t, {}).source,
      );
      expect(sources1).toEqual(sources2);
    });
  });

  // ── 12. scenario.preview works for reviewer ─────────────────

  describe("scenario.preview", () => {
    it("reviewer can trigger scenario preview", () => {
      // Get an actual scenario ID from the bridge
      const scenarios = listAvailableScenarios();
      if (scenarios.length === 0) return; // skip if no scenarios

      const trigger = executeInboundTrigger(
        "scenario.preview",
        reviewer(),
        { scenarioId: scenarios[0].scenarioId },
      );
      expect(trigger.status).toBe("completed");
      expect(trigger.resultPayload?.mode).toBe("dry_run");
    });

    it("viewer can trigger scenario preview (has change.preview)", () => {
      const scenarios = listAvailableScenarios();
      if (scenarios.length === 0) return;

      const trigger = executeInboundTrigger(
        "scenario.preview",
        viewer(),
        { scenarioId: scenarios[0].scenarioId },
      );
      expect(trigger.status).toBe("completed");
      expect(trigger.resultPayload?.mode).toBe("dry_run");
    });
  });

  // ── 13. Runtime trigger emits events on failure ─────────────

  describe("runtime trigger events", () => {
    it("runtime.run_group creates trigger result with job info", () => {
      const trigger = executeInboundTrigger(
        "runtime.run_group",
        admin(),
        { group: "health_check" },
      );
      expect(trigger.status).toBe("completed");
      expect(trigger.resultPayload?.totalJobs).toBeGreaterThan(0);
    });
  });
});
