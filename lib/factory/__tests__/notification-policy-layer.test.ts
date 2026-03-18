import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  classifyNotificationSeverity,
  resolveNotificationAudience,
  evaluateNotificationPolicy,
  evaluateAllNotificationPolicies,
  listNotificationDecisions,
  getNotificationDecisionByEventId,
  buildNotificationPolicyReport,
  formatNotificationDecision,
  formatNotificationPolicyReport,
  useInMemoryStore,
  clearInMemoryStore,
  resetCounters,
  type NotificationSeverity,
} from "../notification-policy-layer";
import {
  emitFactoryEvent,
  buildFactoryEventPayload,
  useInMemoryStore as useHooksStore,
  clearInMemoryStore as clearHooksStore,
  resetCounters as resetHooksCounters,
  type FactoryEvent,
  type FactoryEventType,
} from "../external-automation-hooks";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  eventType: FactoryEventType,
  payload: Record<string, unknown> = {},
): FactoryEvent {
  return buildFactoryEventPayload(eventType, payload);
}

// ---------------------------------------------------------------------------

describe("Notification Policy Layer", () => {
  beforeEach(() => {
    useInMemoryStore();
    useHooksStore();
    resetCounters();
    resetHooksCounters();
  });

  afterEach(() => {
    clearInMemoryStore();
    clearHooksStore();
  });

  // ── 1. Severity classification is deterministic ─────────────

  describe("severity classification", () => {
    it("runtime.job.failed is high", () => {
      const event = makeEvent("runtime.job.failed", { jobId: "j1" });
      expect(classifyNotificationSeverity(event)).toBe("high");
    });

    it("scenario.execution.blocked is high", () => {
      const event = makeEvent("scenario.execution.blocked", { scenarioId: "s1" });
      expect(classifyNotificationSeverity(event)).toBe("high");
    });

    it("governance.alert defaults to warning", () => {
      const event = makeEvent("governance.alert", { msg: "test" });
      expect(classifyNotificationSeverity(event)).toBe("warning");
    });

    it("governance.alert with level=critical is critical", () => {
      const event = makeEvent("governance.alert", { level: "critical" });
      expect(classifyNotificationSeverity(event)).toBe("critical");
    });

    it("governance.alert with level=high is high", () => {
      const event = makeEvent("governance.alert", { level: "high" });
      expect(classifyNotificationSeverity(event)).toBe("high");
    });

    it("template.release.promoted is info", () => {
      const event = makeEvent("template.release.promoted", {});
      expect(classifyNotificationSeverity(event)).toBe("info");
    });

    it("scenario.execution.completed is info", () => {
      const event = makeEvent("scenario.execution.completed", {});
      expect(classifyNotificationSeverity(event)).toBe("info");
    });

    it("marketplace.template.published is info", () => {
      const event = makeEvent("marketplace.template.published", {});
      expect(classifyNotificationSeverity(event)).toBe("info");
    });

    it("template.release.blocked is warning", () => {
      const event = makeEvent("template.release.blocked", {});
      expect(classifyNotificationSeverity(event)).toBe("warning");
    });

    it("scenario.review.ready is info by default", () => {
      const event = makeEvent("scenario.review.ready", {});
      expect(classifyNotificationSeverity(event)).toBe("info");
    });

    it("scenario.review.ready with high priority is warning", () => {
      const event = makeEvent("scenario.review.ready", { priority: 0.9 });
      expect(classifyNotificationSeverity(event)).toBe("warning");
    });

    it("runtime.job.failed with many failures is critical", () => {
      const event = makeEvent("runtime.job.failed", { failedJobs: 5 });
      expect(classifyNotificationSeverity(event)).toBe("critical");
    });

    it("same event always produces same severity", () => {
      const event = makeEvent("runtime.job.failed", { jobId: "j1" });
      const s1 = classifyNotificationSeverity(event);
      const s2 = classifyNotificationSeverity(event);
      expect(s1).toBe(s2);
    });
  });

  // ── 2. Audience routing is deterministic ────────────────────

  describe("audience routing", () => {
    it("blocked scenario notifies owner and admin", () => {
      const event = makeEvent("scenario.execution.blocked", {});
      const audience = resolveNotificationAudience(event, "high");
      expect(audience).toContain("admin");
      expect(audience).toContain("owner");
    });

    it("review.ready notifies reviewer and admin", () => {
      const event = makeEvent("scenario.review.ready", {});
      const audience = resolveNotificationAudience(event, "info");
      expect(audience).toContain("reviewer");
      expect(audience).toContain("admin");
    });

    it("critical events also include operator", () => {
      const event = makeEvent("governance.alert", { level: "critical" });
      const audience = resolveNotificationAudience(event, "critical");
      expect(audience).toContain("operator");
    });

    it("info events do not include viewer", () => {
      const event = makeEvent("template.release.promoted", {});
      const audience = resolveNotificationAudience(event, "info");
      expect(audience).not.toContain("viewer");
    });

    it("same event always produces same audience", () => {
      const event = makeEvent("runtime.job.failed", {});
      const a1 = resolveNotificationAudience(event, "high");
      const a2 = resolveNotificationAudience(event, "high");
      expect(a1).toEqual(a2);
    });
  });

  // ── 3. Blocked scenario events produce notify/high decisions ─

  describe("blocked scenario notifications", () => {
    it("scenario.execution.blocked produces notify decision", () => {
      const event = makeEvent("scenario.execution.blocked", { scenarioId: "s1" });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.decision).toBe("notify");
      expect(decision.severity).toBe("high");
    });

    it("decision includes explanatory reasons", () => {
      const event = makeEvent("scenario.execution.blocked", { scenarioId: "s1" });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.reasons.some((r) => r.includes("blocked"))).toBe(true);
    });

    it("channel hint is ops for blocked scenarios", () => {
      const event = makeEvent("scenario.execution.blocked", {});
      const decision = evaluateNotificationPolicy(event);
      expect(decision.channelHint).toBe("ops");
    });
  });

  // ── 4. Runtime failures produce high/critical decisions ─────

  describe("runtime failure notifications", () => {
    it("runtime.job.failed produces notify/high", () => {
      const event = makeEvent("runtime.job.failed", { jobId: "j1" });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.decision).toBe("notify");
      expect(decision.severity).toBe("high");
    });

    it("multiple runtime failures escalate to critical", () => {
      const event = makeEvent("runtime.job.failed", { failedJobs: 5 });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.severity).toBe("critical");
      expect(decision.decision).toBe("notify");
    });

    it("runtime failures notify admin and owner", () => {
      const event = makeEvent("runtime.job.failed", {});
      const decision = evaluateNotificationPolicy(event);
      expect(decision.audience).toContain("admin");
      expect(decision.audience).toContain("owner");
    });
  });

  // ── 5. Low-value events can be suppressed ───────────────────

  describe("suppression", () => {
    it("duplicate events are suppressed", () => {
      const event = makeEvent("governance.alert", { msg: "test" });
      const d1 = evaluateNotificationPolicy(event);
      expect(d1.decision).toBe("notify");

      // Same event again → suppressed
      const d2 = evaluateNotificationPolicy(event);
      expect(d2.decision).toBe("suppress");
      expect(d2.reasons[0]).toContain("Duplicate");
    });

    it("low-priority completed scenarios can be suppressed", () => {
      const event = makeEvent("scenario.execution.completed", { priority: 0.1 });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.decision).toBe("suppress");
    });

    it("high-priority completed scenarios are queued (not suppressed)", () => {
      const event = makeEvent("scenario.execution.completed", { priority: 0.5 });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.decision).not.toBe("suppress");
    });

    it("suppressed decisions include explanation", () => {
      const event = makeEvent("scenario.execution.completed", { priority: 0.1 });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.reasons.length).toBeGreaterThan(0);
    });
  });

  // ── 6. Decisions include reasons ────────────────────────────

  describe("decision reasons", () => {
    it("notify decisions include event type reason", () => {
      const event = makeEvent("runtime.job.failed", { jobId: "j1" });
      const decision = evaluateNotificationPolicy(event);
      expect(decision.reasons.some((r) => r.includes("runtime.job.failed"))).toBe(true);
    });

    it("notify decisions include severity reason", () => {
      const event = makeEvent("scenario.execution.blocked", {});
      const decision = evaluateNotificationPolicy(event);
      expect(decision.reasons.some((r) => r.includes("high"))).toBe(true);
    });

    it("high severity decisions mention operational intervention", () => {
      const event = makeEvent("runtime.job.failed", {});
      const decision = evaluateNotificationPolicy(event);
      expect(decision.reasons.some((r) => r.includes("intervention"))).toBe(true);
    });
  });

  // ── 7. Notification queue/report is deterministic ───────────

  describe("report", () => {
    it("report has correct structure", () => {
      const event = makeEvent("runtime.job.failed", { jobId: "j1" });
      evaluateNotificationPolicy(event);

      const report = buildNotificationPolicyReport();
      expect(report.decisions).toHaveLength(1);
      expect(report.summary.totalDecisions).toBe(1);
      expect(report.summary.notifyCount).toBe(1);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report partitions correctly", () => {
      evaluateNotificationPolicy(makeEvent("runtime.job.failed", { jobId: "j1" }));
      evaluateNotificationPolicy(makeEvent("scenario.execution.completed", { priority: 0.5 }));
      evaluateNotificationPolicy(makeEvent("scenario.execution.completed", { priority: 0.1 }));

      const report = buildNotificationPolicyReport();
      expect(report.notifyItems.length).toBeGreaterThan(0);
      expect(report.notifyItems.length + report.queuedItems.length + report.suppressedItems.length)
        .toBe(report.summary.totalDecisions);
    });

    it("bySeverity counts are correct", () => {
      evaluateNotificationPolicy(makeEvent("runtime.job.failed", {}));
      evaluateNotificationPolicy(makeEvent("governance.alert", { level: "critical" }));
      evaluateNotificationPolicy(makeEvent("template.release.promoted", { priority: 0.5 }));

      const report = buildNotificationPolicyReport();
      expect(report.summary.bySeverity.high).toBeGreaterThanOrEqual(1);
      expect(report.summary.bySeverity.critical).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 8. Query functions ──────────────────────────────────────

  describe("query", () => {
    it("listNotificationDecisions filters by severity", () => {
      evaluateNotificationPolicy(makeEvent("runtime.job.failed", {}));
      evaluateNotificationPolicy(makeEvent("template.release.promoted", { priority: 0.5 }));

      const high = listNotificationDecisions({ severity: "high" });
      expect(high.length).toBeGreaterThan(0);
      for (const d of high) {
        expect(d.severity).toBe("high");
      }
    });

    it("listNotificationDecisions filters by decision", () => {
      evaluateNotificationPolicy(makeEvent("runtime.job.failed", {}));
      evaluateNotificationPolicy(makeEvent("scenario.execution.completed", { priority: 0.1 }));

      const notify = listNotificationDecisions({ decision: "notify" });
      expect(notify.length).toBeGreaterThan(0);
      for (const d of notify) {
        expect(d.decision).toBe("notify");
      }
    });

    it("listNotificationDecisions filters by eventType", () => {
      evaluateNotificationPolicy(makeEvent("runtime.job.failed", {}));
      evaluateNotificationPolicy(makeEvent("governance.alert", {}));

      const alerts = listNotificationDecisions({ eventType: "governance.alert" });
      expect(alerts).toHaveLength(1);
    });

    it("getNotificationDecisionByEventId returns correct decision", () => {
      const event = makeEvent("runtime.job.failed", {});
      evaluateNotificationPolicy(event);

      const found = getNotificationDecisionByEventId(event.eventId);
      expect(found).not.toBeNull();
      expect(found?.eventId).toBe(event.eventId);
    });

    it("listNotificationDecisions supports limit", () => {
      for (let i = 0; i < 5; i++) {
        evaluateNotificationPolicy(makeEvent("governance.alert", { idx: i }));
      }
      const limited = listNotificationDecisions({ limit: 3 });
      expect(limited).toHaveLength(3);
    });
  });

  // ── 9. evaluateAllNotificationPolicies works ────────────────

  describe("batch evaluation", () => {
    it("evaluates all events from hooks store", () => {
      emitFactoryEvent("runtime.job.failed", { jobId: "j1" });
      emitFactoryEvent("governance.alert", { msg: "test" });
      emitFactoryEvent("scenario.review.ready", { scenarioId: "s1" });

      const decisions = evaluateAllNotificationPolicies();
      expect(decisions).toHaveLength(3);
    });
  });

  // ── 10. Same inputs yield same notification decisions ───────

  describe("determinism", () => {
    it("same event produces same severity across evaluations", () => {
      const event1 = makeEvent("scenario.execution.blocked", { scenarioId: "s1" });
      const event2 = makeEvent("scenario.execution.blocked", { scenarioId: "s1" });

      const d1 = evaluateNotificationPolicy(event1);
      // Use a fresh event (different ID to avoid duplicate suppression)
      const d2 = evaluateNotificationPolicy(event2);

      expect(d1.severity).toBe(d2.severity);
      expect(d1.decision).toBe(d2.decision);
      expect(d1.channelHint).toBe(d2.channelHint);
    });

    it("audience mapping is consistent for same event type", () => {
      const e1 = makeEvent("runtime.job.failed", {});
      const e2 = makeEvent("runtime.job.failed", {});
      const a1 = resolveNotificationAudience(e1, "high");
      const a2 = resolveNotificationAudience(e2, "high");
      expect(a1).toEqual(a2);
    });
  });

  // ── 11. Formatting ──────────────────────────────────────────

  describe("formatting", () => {
    it("formatNotificationDecision produces readable output", () => {
      const event = makeEvent("runtime.job.failed", { jobId: "j1" });
      const decision = evaluateNotificationPolicy(event);
      const text = formatNotificationDecision(decision);
      expect(text).toContain("[HIGH]");
      expect(text).toContain("runtime.job.failed");
      expect(text).toContain("NOTIFY");
    });

    it("formatNotificationPolicyReport produces full report", () => {
      evaluateNotificationPolicy(makeEvent("runtime.job.failed", {}));
      evaluateNotificationPolicy(makeEvent("governance.alert", {}));

      const report = buildNotificationPolicyReport();
      const text = formatNotificationPolicyReport(report);
      expect(text).toContain("Notification Policy Report");
      expect(text).toContain("Notify");
    });
  });
});
