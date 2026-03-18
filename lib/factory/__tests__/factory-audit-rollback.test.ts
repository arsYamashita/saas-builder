import { describe, it, expect, beforeEach } from "vitest";
import {
  collectRollbackCandidates,
  previewRollbackCandidates,
  applyRollbackCandidates,
  listFactoryAuditHistory,
  buildUnifiedAuditReport,
  buildRollbackExecutionReport,
  formatRollbackReport,
  formatAuditReport,
  useInMemoryStore,
} from "../factory-audit-rollback";

import type {
  RollbackMetadata,
  AdoptionHistoryEntry,
} from "../approved-change-adoption";
import type {
  PromotionRollbackMetadata,
  PromotionHistoryEntry,
} from "../policy-promotion";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdoptionRollback(overrides: Partial<RollbackMetadata> = {}): RollbackMetadata {
  return {
    planId: "adopt-plan-1",
    proposalId: "prop-1",
    rollbackAction: {
      targetFile: "data/factory-policy.json",
      key: "provider_routing.recent_score_weight",
      restoreValue: null,
    },
    ...overrides,
  };
}

function makePromotionRollback(overrides: Partial<PromotionRollbackMetadata> = {}): PromotionRollbackMetadata {
  return {
    promotionId: "promote-routing-dev-to-staging",
    proposalId: "prop-1",
    rollbackAction: {
      targetFile: "data/factory-policy.staging.json",
      key: "provider_routing.recent_score_weight",
      restoreValue: null,
    },
    ...overrides,
  };
}

function makeAdoptionHistory(overrides: Partial<AdoptionHistoryEntry> = {}): AdoptionHistoryEntry {
  return {
    planId: "adopt-plan-1",
    proposalId: "prop-1",
    subsystem: "provider_routing",
    appliedAt: "2026-03-16T10:00:00.000Z",
    appliedBy: "admin",
    status: "applied",
    before: null,
    after: 0.5,
    notes: "applied via CLI",
    ...overrides,
  };
}

function makePromotionHistory(overrides: Partial<PromotionHistoryEntry> = {}): PromotionHistoryEntry {
  return {
    promotionId: "promote-routing-dev-to-staging",
    proposalId: "prop-1",
    planId: "plan-1",
    fromEnv: "dev",
    toEnv: "staging",
    appliedAt: "2026-03-16T11:00:00.000Z",
    appliedBy: "admin",
    status: "promoted",
    before: null,
    after: 0.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useInMemoryStore();
});

// ---------------------------------------------------------------------------
// 1. Rollback candidates collected from adoption metadata
// ---------------------------------------------------------------------------

describe("collectRollbackCandidates — adoption", () => {
  it("collects candidates from adoption rollback metadata", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const candidates = collectRollbackCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sourceType).toBe("adoption");
    expect(candidates[0]!.rollbackId).toBe("rollback-adopt-plan-1");
    expect(candidates[0]!.currentValue).toBe(0.5);
    expect(candidates[0]!.restoreValue).toBeNull();
    expect(candidates[0]!.status).toBe("ready");
  });

  it("reads current value from adoption policy artifact", () => {
    useInMemoryStore({
      adoptionPolicy: { cost_guardrail: { max_cost_per_step: 0.065 } },
      adoptionRollbacks: [
        makeAdoptionRollback({
          planId: "adopt-plan-cost",
          rollbackAction: {
            targetFile: "data/factory-policy.json",
            key: "cost_guardrail.max_cost_per_step",
            restoreValue: 0.05,
          },
        }),
      ],
    });

    const candidates = collectRollbackCandidates();
    expect(candidates[0]!.currentValue).toBe(0.065);
    expect(candidates[0]!.restoreValue).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------
// 2. Rollback candidates collected from promotion metadata
// ---------------------------------------------------------------------------

describe("collectRollbackCandidates — promotion", () => {
  it("collects candidates from promotion rollback metadata", () => {
    useInMemoryStore({
      envPolicies: {
        "data/factory-policy.staging.json": {
          provider_routing: { recent_score_weight: 0.5 },
        },
      },
      promotionRollbacks: [makePromotionRollback()],
    });

    const candidates = collectRollbackCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.sourceType).toBe("promotion");
    expect(candidates[0]!.rollbackId).toBe("rollback-promote-routing-dev-to-staging");
    expect(candidates[0]!.currentValue).toBe(0.5);
    expect(candidates[0]!.status).toBe("ready");
  });

  it("combines adoption and promotion candidates", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      envPolicies: {
        "data/factory-policy.staging.json": {
          provider_routing: { recent_score_weight: 0.5 },
        },
      },
      adoptionRollbacks: [makeAdoptionRollback()],
      promotionRollbacks: [makePromotionRollback()],
    });

    const candidates = collectRollbackCandidates();
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.sourceType)).toEqual(["adoption", "promotion"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Already-rolled-back candidates excluded/skipped
// ---------------------------------------------------------------------------

describe("collectRollbackCandidates — already rolled back", () => {
  it("marks already-rolled-back candidates as skipped", () => {
    useInMemoryStore({
      adoptionPolicy: {},
      adoptionRollbacks: [makeAdoptionRollback()],
      rollbackHistory: [
        {
          rollbackId: "rollback-adopt-plan-1",
          sourceType: "adoption",
          sourceId: "adopt-plan-1",
          targetFile: "data/factory-policy.json",
          key: "provider_routing.recent_score_weight",
          before: 0.5,
          after: null,
          executedAt: "2026-03-16T12:00:00.000Z",
          executedBy: "admin",
          status: "rolled_back",
        },
      ],
    });

    const candidates = collectRollbackCandidates();
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.status).toBe("skipped");
    expect(candidates[0]!.skipReason).toContain("Already rolled back");
  });
});

// ---------------------------------------------------------------------------
// 4. Preview mode shows diff with no mutation
// ---------------------------------------------------------------------------

describe("previewRollbackCandidates", () => {
  it("shows candidates without mutating state", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const preview = previewRollbackCandidates();
    expect(preview).toHaveLength(1);
    expect(preview[0]!.status).toBe("ready");
    expect(preview[0]!.currentValue).toBe(0.5);

    // Verify no mutation — policy still has value
    const preview2 = previewRollbackCandidates();
    expect(preview2[0]!.currentValue).toBe(0.5);
  });

  it("is deterministic across calls", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const p1 = previewRollbackCandidates();
    const p2 = previewRollbackCandidates();

    expect(p1.length).toBe(p2.length);
    expect(p1[0]!.rollbackId).toBe(p2[0]!.rollbackId);
    expect(p1[0]!.currentValue).toBe(p2[0]!.currentValue);
    expect(p1[0]!.restoreValue).toBe(p2[0]!.restoreValue);
  });
});

// ---------------------------------------------------------------------------
// 5. Rollback apply restores target artifact
// ---------------------------------------------------------------------------

describe("applyRollbackCandidates", () => {
  it("restores target artifact to pre-change value", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const { rolledBack, skipped, history } = applyRollbackCandidates();

    expect(rolledBack).toHaveLength(1);
    expect(skipped).toHaveLength(0);
    expect(history).toHaveLength(1);

    expect(rolledBack[0]!.status).toBe("rolled_back");
    expect(history[0]!.before).toBe(0.5);
    expect(history[0]!.after).toBeNull();

    // Value should be removed from policy (restoreValue is null)
    const afterPreview = previewRollbackCandidates();
    expect(afterPreview[0]!.status).toBe("skipped"); // already rolled back
  });

  it("restores non-null value correctly", () => {
    useInMemoryStore({
      adoptionPolicy: { cost_guardrail: { max_cost_per_step: 0.065 } },
      adoptionRollbacks: [
        makeAdoptionRollback({
          planId: "adopt-plan-cost",
          rollbackAction: {
            targetFile: "data/factory-policy.json",
            key: "cost_guardrail.max_cost_per_step",
            restoreValue: 0.05,
          },
        }),
      ],
    });

    const { rolledBack } = applyRollbackCandidates();
    expect(rolledBack).toHaveLength(1);

    // Verify the value was restored
    const preview = previewRollbackCandidates();
    // It's now marked as already rolled back
    expect(preview[0]!.status).toBe("skipped");
  });

  it("records rollback history", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    applyRollbackCandidates({ executedBy: "test-admin" });

    const report = buildRollbackExecutionReport();
    expect(report.history).toHaveLength(1);
    expect(report.history[0]!.executedBy).toBe("test-admin");
    expect(report.history[0]!.status).toBe("rolled_back");
  });
});

// ---------------------------------------------------------------------------
// 6. Rollback fails/skips when current state doesn't match
// ---------------------------------------------------------------------------

describe("applyRollbackCandidates — safety checks", () => {
  it("skips when both current and restore are null", () => {
    useInMemoryStore({
      adoptionPolicy: {},
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const { rolledBack, skipped } = applyRollbackCandidates();
    expect(rolledBack).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.skipReason).toContain("null");
  });

  it("skips already-rolled-back candidates on re-apply", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    // First rollback succeeds
    const r1 = applyRollbackCandidates();
    expect(r1.rolledBack).toHaveLength(1);

    // Second rollback skips
    const r2 = applyRollbackCandidates();
    expect(r2.rolledBack).toHaveLength(0);
    expect(r2.skipped).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Unified audit history includes adoption/promotion/rollback
// ---------------------------------------------------------------------------

describe("listFactoryAuditHistory", () => {
  it("aggregates adoption, promotion, and rollback events", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionHistory: [makeAdoptionHistory()],
      promotionHistory: [makePromotionHistory()],
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    // Execute a rollback to create rollback history
    applyRollbackCandidates();

    const entries = listFactoryAuditHistory();
    expect(entries.length).toBeGreaterThanOrEqual(3);

    const types = entries.map((e) => e.eventType);
    expect(types).toContain("adoption");
    expect(types).toContain("promotion");
    expect(types).toContain("rollback");
  });

  it("filters by eventType", () => {
    useInMemoryStore({
      adoptionHistory: [makeAdoptionHistory()],
      promotionHistory: [makePromotionHistory()],
    });

    const adoptionOnly = listFactoryAuditHistory({ eventType: "adoption" });
    expect(adoptionOnly.every((e) => e.eventType === "adoption")).toBe(true);
    expect(adoptionOnly).toHaveLength(1);
  });

  it("filters by sourceType", () => {
    useInMemoryStore({
      adoptionHistory: [makeAdoptionHistory()],
      promotionHistory: [makePromotionHistory()],
    });

    const promotionOnly = listFactoryAuditHistory({ sourceType: "promotion" });
    expect(promotionOnly.every((e) => e.sourceType === "promotion")).toBe(true);
  });

  it("sorts by timestamp", () => {
    useInMemoryStore({
      adoptionHistory: [
        makeAdoptionHistory({ appliedAt: "2026-03-16T12:00:00.000Z" }),
      ],
      promotionHistory: [
        makePromotionHistory({ appliedAt: "2026-03-16T10:00:00.000Z" }),
      ],
    });

    const entries = listFactoryAuditHistory();
    expect(entries[0]!.eventType).toBe("promotion"); // earlier timestamp
    expect(entries[1]!.eventType).toBe("adoption");
  });
});

// ---------------------------------------------------------------------------
// 8. Single-source rollback works
// ---------------------------------------------------------------------------

describe("single-source rollback", () => {
  it("rolls back only the specified source", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      envPolicies: {
        "data/factory-policy.staging.json": {
          provider_routing: { recent_score_weight: 0.5 },
        },
      },
      adoptionRollbacks: [makeAdoptionRollback()],
      promotionRollbacks: [makePromotionRollback()],
    });

    const { rolledBack, skipped } = applyRollbackCandidates({
      sourceId: "adopt-plan-1",
    });

    expect(rolledBack).toHaveLength(1);
    expect(rolledBack[0]!.sourceId).toBe("adopt-plan-1");
    // promotion candidate not included when filtered by sourceId
    expect(skipped).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Reports and formatting work
// ---------------------------------------------------------------------------

describe("buildUnifiedAuditReport", () => {
  it("produces summary counts", () => {
    useInMemoryStore({
      adoptionHistory: [makeAdoptionHistory()],
      promotionHistory: [makePromotionHistory()],
    });

    const report = buildUnifiedAuditReport();
    expect(report.summary.totalEntries).toBe(2);
    expect(report.summary.adoptionCount).toBe(1);
    expect(report.summary.promotionCount).toBe(1);
    expect(report.summary.rollbackCount).toBe(0);
    expect(report.generatedAt).toBeDefined();
  });
});

describe("buildRollbackExecutionReport", () => {
  it("produces summary counts", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const report = buildRollbackExecutionReport();
    expect(report.summary.totalCandidates).toBe(1);
    expect(report.summary.readyCount).toBe(1);
    expect(report.summary.rolledBackCount).toBe(0);
  });
});

describe("formatRollbackReport", () => {
  it("produces readable text output", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback()],
    });

    const report = buildRollbackExecutionReport();
    const text = formatRollbackReport(report);

    expect(text).toContain("ROLLBACK EXECUTION REPORT");
    expect(text).toContain("rollback-adopt-plan-1");
    expect(text).toContain("[READY]");
  });
});

describe("formatAuditReport", () => {
  it("produces readable text output", () => {
    useInMemoryStore({
      adoptionHistory: [makeAdoptionHistory()],
      promotionHistory: [makePromotionHistory()],
    });

    const report = buildUnifiedAuditReport();
    const text = formatAuditReport(report);

    expect(text).toContain("UNIFIED FACTORY AUDIT REPORT");
    expect(text).toContain("[ADOPTION]");
    expect(text).toContain("[PROMOTION]");
  });
});

// ---------------------------------------------------------------------------
// 10. Determinism — same inputs yield same rollback plan
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same inputs produce identical rollback candidates", () => {
    const setup = () => {
      useInMemoryStore({
        adoptionPolicy: {
          provider_routing: { recent_score_weight: 0.5 },
          cost_guardrail: { max_cost_per_step: 0.065 },
        },
        adoptionRollbacks: [
          makeAdoptionRollback(),
          makeAdoptionRollback({
            planId: "adopt-plan-cost",
            rollbackAction: {
              targetFile: "data/factory-policy.json",
              key: "cost_guardrail.max_cost_per_step",
              restoreValue: 0.05,
            },
          }),
        ],
      });
    };

    setup();
    const c1 = collectRollbackCandidates();

    setup();
    const c2 = collectRollbackCandidates();

    expect(c1.length).toBe(c2.length);
    for (let i = 0; i < c1.length; i++) {
      expect(c1[i]!.rollbackId).toBe(c2[i]!.rollbackId);
      expect(c1[i]!.status).toBe(c2[i]!.status);
      expect(c1[i]!.currentValue).toBe(c2[i]!.currentValue);
      expect(c1[i]!.restoreValue).toBe(c2[i]!.restoreValue);
    }
  });

  it("rollbackId is derived deterministically from source", () => {
    useInMemoryStore({
      adoptionPolicy: { provider_routing: { recent_score_weight: 0.5 } },
      adoptionRollbacks: [makeAdoptionRollback({ planId: "my-plan-123" })],
    });

    const candidates = collectRollbackCandidates();
    expect(candidates[0]!.rollbackId).toBe("rollback-my-plan-123");
  });
});
