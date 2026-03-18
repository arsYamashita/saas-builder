import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  evaluateNotificationEscalation,
  detectRepeatedNotificationPatterns,
  resolveEscalatedAudience,
  resolveEscalatedSeverity,
  listNotificationEscalations,
  buildNotificationEscalationReport,
  formatNotificationEscalation,
  formatNotificationEscalationReport,
  useInMemoryStore,
  clearInMemoryStore,
} from "../notification-escalation-rules";
import {
  emitFactoryEvent,
  useInMemoryStore as useHooksStore,
  clearInMemoryStore as clearHooksStore,
  resetCounters as resetHooksCounters,
} from "../external-automation-hooks";
import {
  useInMemoryStore as useNotificationStore,
  clearInMemoryStore as clearNotificationStore,
  resetCounters as resetNotificationCounters,
} from "../notification-policy-layer";
import {
  useInMemoryStore as useWorkflowV3Store,
  clearInMemoryStore as clearWorkflowV3Store,
  updateReviewDueDate,
  evaluateAllWorkflowOps,
} from "../strategic-review-workflow-v3";
import {
  initializeAllReviewWorkflows,
  transitionReviewWorkflow,
  useInMemoryStore as useWorkflowStore,
  clearInMemoryStore as clearWorkflowStore,
} from "../strategic-review-workflow";
import {
  useInMemoryStore as useGovernanceStore,
  clearInMemoryStore as clearGovernanceStore,
} from "../scenario-execution-governance";
import {
  buildStrategicReviewBoard,
} from "../strategic-change-review-board";
import { resolveActorRole } from "../team-role-approval";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function admin() {
  return resolveActorRole("admin-1", "admin");
}

function emitRepeatedEvents(eventType: "runtime.job.failed" | "scenario.execution.blocked" | "governance.alert" | "template.release.blocked", count: number) {
  for (let i = 0; i < count; i++) {
    emitFactoryEvent(eventType, {
      scenarioId: "test-scenario",
      reason: `Test failure ${i + 1}`,
    });
  }
}

function setupAllStores() {
  useInMemoryStore();
  useHooksStore();
  useNotificationStore();
  useWorkflowV3Store();
  useWorkflowStore();
  useGovernanceStore();
}

function clearAllStores() {
  clearInMemoryStore();
  clearHooksStore();
  clearNotificationStore();
  clearWorkflowV3Store();
  clearWorkflowStore();
  clearGovernanceStore();
}

// ---------------------------------------------------------------------------

describe("Notification Escalation Rules v2", { timeout: 30000 }, () => {
  beforeEach(() => {
    setupAllStores();
    resetHooksCounters();
    resetNotificationCounters();
  });

  afterEach(() => {
    clearAllStores();
  });

  // ── 1. Repeated failures escalate deterministically ───────

  describe("repetition detection", () => {
    it("detects repeated events within window", () => {
      emitRepeatedEvents("runtime.job.failed", 3);

      const patterns = detectRepeatedNotificationPatterns();
      expect(patterns.length).toBeGreaterThan(0);

      const failPattern = patterns.find((p) => p.eventType === "runtime.job.failed");
      expect(failPattern).toBeTruthy();
      expect(failPattern!.occurrenceCount).toBe(3);
    });

    it("2 occurrences produce escalation level 1", () => {
      emitRepeatedEvents("runtime.job.failed", 2);

      const escalations = evaluateNotificationEscalation();
      const failEsc = escalations.find(
        (e) => e.eventType === "runtime.job.failed" && !e.baseNotificationId.startsWith("review-"),
      );

      expect(failEsc).toBeTruthy();
      expect(failEsc!.escalationLevel).toBe(1);
    });

    it("3+ occurrences produce escalation level 2", () => {
      emitRepeatedEvents("runtime.job.failed", 4);

      const escalations = evaluateNotificationEscalation();
      const failEsc = escalations.find(
        (e) => e.eventType === "runtime.job.failed" && !e.baseNotificationId.startsWith("review-"),
      );

      expect(failEsc).toBeTruthy();
      expect(failEsc!.escalationLevel).toBe(2);
    });

    it("single occurrence does not produce escalation", () => {
      emitFactoryEvent("runtime.job.failed", { scenarioId: "single", reason: "once" });

      const escalations = evaluateNotificationEscalation();
      const failEsc = escalations.find(
        (e) => e.eventType === "runtime.job.failed" && !e.baseNotificationId.startsWith("review-"),
      );

      // No escalation for single occurrence
      expect(failEsc).toBeUndefined();
    });
  });

  // ── 2. Overdue reviews escalate deterministically ─────────

  describe("overdue review escalation", () => {
    it("overdue reviews produce escalation", () => {
      const items = buildStrategicReviewBoard();
      initializeAllReviewWorkflows();

      if (items.length === 0) return;

      // Set overdue due date
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      updateReviewDueDate(items[0].reviewId, pastDate, admin());

      const escalations = evaluateNotificationEscalation();
      const reviewEsc = escalations.filter((e) => e.baseNotificationId.startsWith("review-"));

      expect(reviewEsc.length).toBeGreaterThan(0);

      const overdueEsc = reviewEsc.find((e) =>
        e.reasons.some((r) => r.includes("overdue")),
      );
      expect(overdueEsc).toBeTruthy();
      expect(overdueEsc!.escalationLevel).toBe(2);
    });

    it("due_soon reviews produce warning escalation", () => {
      const items = buildStrategicReviewBoard();
      initializeAllReviewWorkflows();

      if (items.length === 0) return;

      // Set due_soon due date (12 hours from now)
      const soonDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      updateReviewDueDate(items[0].reviewId, soonDate, admin());

      const escalations = evaluateNotificationEscalation();
      const reviewEsc = escalations.filter((e) => e.baseNotificationId.startsWith("review-"));

      const dueSoonEsc = reviewEsc.find((e) =>
        e.reasons.some((r) => r.includes("due soon")),
      );
      expect(dueSoonEsc).toBeTruthy();
      if (dueSoonEsc) {
        expect(dueSoonEsc.severity).toBe("warning");
        expect(dueSoonEsc.escalationLevel).toBe(1);
      }
    });

    it("escalated review items produce critical alerts", () => {
      const items = buildStrategicReviewBoard();
      initializeAllReviewWorkflows();

      if (items.length === 0) return;

      // Move to in_review, defer twice, move back, set overdue → escalated
      transitionReviewWorkflow(items[0].reviewId, "in_review", admin());
      transitionReviewWorkflow(items[0].reviewId, "deferred", admin());
      transitionReviewWorkflow(items[0].reviewId, "in_review", admin());
      transitionReviewWorkflow(items[0].reviewId, "deferred", admin());
      transitionReviewWorkflow(items[0].reviewId, "in_review", admin());

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      updateReviewDueDate(items[0].reviewId, pastDate, admin());

      const escalations = evaluateNotificationEscalation();
      const reviewEsc = escalations.filter((e) => e.baseNotificationId.startsWith("review-"));

      const escalatedEsc = reviewEsc.find((e) =>
        e.reasons.some((r) => r.includes("escalated")),
      );
      expect(escalatedEsc).toBeTruthy();
      if (escalatedEsc) {
        expect(escalatedEsc.severity).toBe("critical");
        expect(escalatedEsc.audience).toContain("owner");
      }
    });
  });

  // ── 3. Audience escalation works correctly ────────────────

  describe("audience escalation", () => {
    it("level 1 adds admin to audience", () => {
      const audience = resolveEscalatedAudience(["reviewer"], "high", 1);
      expect(audience).toContain("admin");
    });

    it("level 2 adds owner to audience", () => {
      const audience = resolveEscalatedAudience(["admin"], "high", 2);
      expect(audience).toContain("owner");
    });

    it("critical severity adds owner", () => {
      const audience = resolveEscalatedAudience(["admin"], "critical", 1);
      expect(audience).toContain("owner");
    });

    it("does not duplicate existing roles", () => {
      const audience = resolveEscalatedAudience(["admin", "owner"], "critical", 2);
      const adminCount = audience.filter((a) => a === "admin").length;
      const ownerCount = audience.filter((a) => a === "owner").length;
      expect(adminCount).toBe(1);
      expect(ownerCount).toBe(1);
    });

    it("level 0 does not modify audience", () => {
      const audience = resolveEscalatedAudience(["reviewer"], "info", 0);
      expect(audience).toEqual(["reviewer"]);
    });
  });

  // ── 4. Severity escalation works correctly ────────────────

  describe("severity escalation", () => {
    it("info + level 1 = warning", () => {
      expect(resolveEscalatedSeverity("info", 1)).toBe("warning");
    });

    it("info + level 2 = high", () => {
      expect(resolveEscalatedSeverity("info", 2)).toBe("high");
    });

    it("warning + level 1 = high", () => {
      expect(resolveEscalatedSeverity("warning", 1)).toBe("high");
    });

    it("warning + level 2 = critical", () => {
      expect(resolveEscalatedSeverity("warning", 2)).toBe("critical");
    });

    it("high + level 1 = critical", () => {
      expect(resolveEscalatedSeverity("high", 1)).toBe("critical");
    });

    it("critical + level 2 = critical (caps at max)", () => {
      expect(resolveEscalatedSeverity("critical", 2)).toBe("critical");
    });

    it("level 0 preserves base severity", () => {
      expect(resolveEscalatedSeverity("warning", 0)).toBe("warning");
    });
  });

  // ── 5. Suppression window behavior is deterministic ───────

  describe("suppression window", () => {
    it("suppressed events are not escalated at level 0", () => {
      // Emit single event (no repetition)
      emitFactoryEvent("scenario.review.ready", { scenarioId: "s1" });

      const escalations = evaluateNotificationEscalation();
      // Non-repeatable event type → no escalation
      const readyEsc = escalations.filter(
        (e) => e.eventType === "scenario.review.ready" && !e.baseNotificationId.startsWith("review-"),
      );
      expect(readyEsc.length).toBe(0);
    });

    it("repeated high-severity events bypass suppression", () => {
      emitRepeatedEvents("runtime.job.failed", 3);

      const escalations = evaluateNotificationEscalation();
      const failEsc = escalations.find(
        (e) => e.eventType === "runtime.job.failed" && !e.baseNotificationId.startsWith("review-"),
      );

      expect(failEsc).toBeTruthy();
      // Either notify or renotify, not suppress
      expect(failEsc!.decision).not.toBe("suppress");
    });
  });

  // ── 6. Repeated high-severity events bypass suppression ───

  describe("suppression bypass", () => {
    it("repeated governance alerts escalate", () => {
      emitRepeatedEvents("governance.alert", 3);

      const escalations = evaluateNotificationEscalation();
      const govEsc = escalations.find(
        (e) => e.eventType === "governance.alert" && !e.baseNotificationId.startsWith("review-"),
      );

      expect(govEsc).toBeTruthy();
      expect(govEsc!.escalationLevel).toBe(2);
    });

    it("repeated scenario.execution.blocked escalates", () => {
      emitRepeatedEvents("scenario.execution.blocked", 2);

      const escalations = evaluateNotificationEscalation();
      const blockedEsc = escalations.find(
        (e) => e.eventType === "scenario.execution.blocked" && !e.baseNotificationId.startsWith("review-"),
      );

      expect(blockedEsc).toBeTruthy();
      expect(blockedEsc!.escalationLevel).toBe(1);
    });
  });

  // ── 7. Reasons are present and explainable ────────────────

  describe("reasons", () => {
    it("repeated event escalations have reasons", () => {
      emitRepeatedEvents("runtime.job.failed", 3);

      const escalations = evaluateNotificationEscalation();
      const failEsc = escalations.find(
        (e) => e.eventType === "runtime.job.failed" && !e.baseNotificationId.startsWith("review-"),
      );

      expect(failEsc).toBeTruthy();
      expect(failEsc!.reasons.length).toBeGreaterThan(0);
      expect(failEsc!.reasons.some((r) => r.includes("occurrences"))).toBe(true);
    });

    it("overdue review escalations have reasons", () => {
      const items = buildStrategicReviewBoard();
      initializeAllReviewWorkflows();

      if (items.length === 0) return;

      const pastDate = new Date(Date.now() - 86400000).toISOString();
      updateReviewDueDate(items[0].reviewId, pastDate, admin());

      const escalations = evaluateNotificationEscalation();
      const reviewEsc = escalations.filter((e) => e.baseNotificationId.startsWith("review-"));

      for (const e of reviewEsc) {
        expect(e.reasons.length).toBeGreaterThan(0);
      }
    });

    it("severity escalation reasons mention base and target severity", () => {
      emitRepeatedEvents("runtime.job.failed", 3);

      const escalations = evaluateNotificationEscalation();
      const failEsc = escalations.find(
        (e) => e.eventType === "runtime.job.failed" && !e.baseNotificationId.startsWith("review-"),
      );

      if (failEsc && failEsc.baseSeverity !== failEsc.severity) {
        expect(failEsc.reasons.some((r) => r.includes("Escalated from"))).toBe(true);
      }
    });
  });

  // ── 8. Query and filtering ────────────────────────────────

  describe("query", () => {
    it("listNotificationEscalations filters by severity", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      evaluateNotificationEscalation();

      const all = listNotificationEscalations();
      const critical = listNotificationEscalations({ severity: "critical" });

      expect(all.length).toBeGreaterThanOrEqual(critical.length);
      for (const e of critical) {
        expect(e.severity).toBe("critical");
      }
    });

    it("listNotificationEscalations filters by level", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      evaluateNotificationEscalation();

      const level2 = listNotificationEscalations({ level: 2 });
      for (const e of level2) {
        expect(e.escalationLevel).toBe(2);
      }
    });

    it("listNotificationEscalations filters by eventType", () => {
      emitRepeatedEvents("runtime.job.failed", 2);
      emitRepeatedEvents("governance.alert", 2);
      evaluateNotificationEscalation();

      const runtimeOnly = listNotificationEscalations({ eventType: "runtime.job.failed" });
      for (const e of runtimeOnly) {
        expect(e.eventType).toBe("runtime.job.failed");
      }
    });

    it("listNotificationEscalations supports limit", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      emitRepeatedEvents("governance.alert", 3);
      evaluateNotificationEscalation();

      const limited = listNotificationEscalations({ limit: 1 });
      expect(limited.length).toBeLessThanOrEqual(1);
    });
  });

  // ── 9. Report ─────────────────────────────────────────────

  describe("report", () => {
    it("report has correct structure", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      const report = buildNotificationEscalationReport();

      expect(report.escalations.length).toBeGreaterThan(0);
      expect(report.summary.totalEscalations).toBe(report.escalations.length);
      expect(report.generatedAt).toBeTruthy();
    });

    it("report partitions escalations correctly", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      const report = buildNotificationEscalationReport();

      expect(
        report.summary.level0Count +
        report.summary.level1Count +
        report.summary.level2Count,
      ).toBe(report.summary.totalEscalations);
    });

    it("formatNotificationEscalation produces readable output", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      const escalations = evaluateNotificationEscalation();

      if (escalations.length === 0) return;
      const text = formatNotificationEscalation(escalations[0]);
      expect(text).toContain(escalations[0].eventType);
      expect(text).toContain("[L");
    });

    it("formatNotificationEscalationReport produces full report", () => {
      emitRepeatedEvents("runtime.job.failed", 3);
      const report = buildNotificationEscalationReport();
      const text = formatNotificationEscalationReport(report);
      expect(text).toContain("Notification Escalation Report");
      expect(text).toContain("Total:");
    });
  });

  // ── 10. Same inputs yield same escalation outputs ─────────

  describe("determinism", () => {
    it("same events produce same escalation levels", () => {
      emitRepeatedEvents("runtime.job.failed", 3);

      const e1 = evaluateNotificationEscalation();

      // Reset escalation store and notification store, re-evaluate
      clearInMemoryStore();
      clearNotificationStore();
      useInMemoryStore();
      useNotificationStore();
      resetNotificationCounters();

      const e2 = evaluateNotificationEscalation();

      // Compare non-review escalations
      const nonReview1 = e1.filter((e) => !e.baseNotificationId.startsWith("review-"));
      const nonReview2 = e2.filter((e) => !e.baseNotificationId.startsWith("review-"));

      expect(nonReview1.length).toBe(nonReview2.length);
      for (let i = 0; i < nonReview1.length; i++) {
        expect(nonReview1[i].escalationLevel).toBe(nonReview2[i].escalationLevel);
        expect(nonReview1[i].severity).toBe(nonReview2[i].severity);
        expect(nonReview1[i].eventType).toBe(nonReview2[i].eventType);
      }
    });

    it("same severity + level produce same escalated severity", () => {
      const s1 = resolveEscalatedSeverity("warning", 2);
      const s2 = resolveEscalatedSeverity("warning", 2);
      expect(s1).toBe(s2);
    });

    it("same audience + level produce same escalated audience", () => {
      const a1 = resolveEscalatedAudience(["reviewer"], "high", 1);
      const a2 = resolveEscalatedAudience(["reviewer"], "high", 1);
      expect(a1).toEqual(a2);
    });
  });
});
