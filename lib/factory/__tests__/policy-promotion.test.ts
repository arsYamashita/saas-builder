import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveEnvironmentPolicyFile,
  collectPromotableChanges,
  buildPromotionPlans,
  previewPromotionPlans,
  applyPromotionPlans,
  listPromotionHistory,
  buildPromotionRollbackMetadata,
  buildPromotionReport,
  formatPromotionReport,
  useInMemoryStore,
} from "../policy-promotion";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDevPolicy(
  entries: Record<string, Record<string, number | string | null>> = {},
): void {
  useInMemoryStore({
    envPolicies: {
      dev: entries,
      staging: {},
      prod: {},
    },
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useInMemoryStore();
});

// ---------------------------------------------------------------------------
// 1. Separate environment policy files resolve correctly
// ---------------------------------------------------------------------------

describe("resolveEnvironmentPolicyFile", () => {
  it("resolves dev policy file", () => {
    expect(resolveEnvironmentPolicyFile("dev")).toBe(
      "data/factory-policy.dev.json",
    );
  });

  it("resolves staging policy file", () => {
    expect(resolveEnvironmentPolicyFile("staging")).toBe(
      "data/factory-policy.staging.json",
    );
  });

  it("resolves prod policy file", () => {
    expect(resolveEnvironmentPolicyFile("prod")).toBe(
      "data/factory-policy.prod.json",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Only applied source changes are promotable
// ---------------------------------------------------------------------------

describe("collectPromotableChanges", () => {
  it("collects changes from source environment", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
      cost_guardrail: { max_cost_per_step: 0.065 },
    });

    const changes = collectPromotableChanges("dev");
    expect(changes).toHaveLength(2);
    expect(changes[0]!.key).toBe("provider_routing.recent_score_weight");
    expect(changes[0]!.value).toBe(0.5);
  });

  it("returns empty when no changes exist", () => {
    expect(collectPromotableChanges("dev")).toHaveLength(0);
  });

  it("does not include staging changes when querying dev", () => {
    useInMemoryStore({
      envPolicies: {
        dev: {},
        staging: { governance: { at_risk_degraded_count: 3 } },
        prod: {},
      },
    });
    expect(collectPromotableChanges("dev")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Already-equal target values are skipped
// ---------------------------------------------------------------------------

describe("buildPromotionPlans — already equal", () => {
  it("skips when target already has same value", () => {
    useInMemoryStore({
      envPolicies: {
        dev: { provider_routing: { recent_score_weight: 0.5 } },
        staging: { provider_routing: { recent_score_weight: 0.5 } },
        prod: {},
      },
    });

    const plans = buildPromotionPlans("dev", "staging");
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("skipped");
    expect(plans[0]!.skipReason).toContain("already has the same value");
  });
});

// ---------------------------------------------------------------------------
// 4. Non-adjacent promotion paths are rejected
// ---------------------------------------------------------------------------

describe("buildPromotionPlans — invalid paths", () => {
  it("rejects dev → prod (skip staging)", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    const plans = buildPromotionPlans("dev", "prod");
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("skipped");
    expect(plans[0]!.skipReason).toContain("not allowed");
  });

  it("rejects staging → dev (wrong direction)", () => {
    const plans = buildPromotionPlans("staging", "dev");
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("skipped");
    expect(plans[0]!.skipReason).toContain("not allowed");
  });

  it("rejects prod → staging", () => {
    const plans = buildPromotionPlans("prod", "staging");
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// 5. Dry-run preview shows deterministic diff with no mutation
// ---------------------------------------------------------------------------

describe("previewPromotionPlans", () => {
  it("shows before/after diff without mutation", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    const plans = previewPromotionPlans("dev", "staging");
    expect(plans).toHaveLength(1);
    expect(plans[0]!.status).toBe("ready");
    expect(plans[0]!.currentValue).toBeNull(); // staging has no value yet
    expect(plans[0]!.promotedValue).toBe(0.5);

    // Verify no history created
    expect(listPromotionHistory()).toHaveLength(0);
  });

  it("does not mutate target environment", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    previewPromotionPlans("dev", "staging");

    // Staging should still be empty
    expect(collectPromotableChanges("staging")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Apply promotion updates only target env artifact
// ---------------------------------------------------------------------------

describe("applyPromotionPlans", () => {
  it("promotes ready plans to target environment", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
      cost_guardrail: { max_cost_per_step: 0.065 },
    });

    const { promoted, skipped, history } = applyPromotionPlans(
      "dev",
      "staging",
    );

    expect(promoted).toHaveLength(2);
    expect(skipped).toHaveLength(0);
    expect(history).toHaveLength(2);

    // Verify target was updated
    const stagingChanges = collectPromotableChanges("staging");
    expect(stagingChanges).toHaveLength(2);
    expect(
      stagingChanges.find((c) => c.key === "provider_routing.recent_score_weight")
        ?.value,
    ).toBe(0.5);
  });

  it("does not mutate source environment", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    applyPromotionPlans("dev", "staging");

    // Dev should still have original value
    const devChanges = collectPromotableChanges("dev");
    expect(devChanges).toHaveLength(1);
    expect(devChanges[0]!.value).toBe(0.5);
  });

  it("skips already-applied plans on re-promotion", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    applyPromotionPlans("dev", "staging");

    // Second promotion should skip
    const { promoted, skipped } = applyPromotionPlans("dev", "staging");
    expect(promoted).toHaveLength(0);
    expect(skipped).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. Promotion history is recorded correctly
// ---------------------------------------------------------------------------

describe("listPromotionHistory", () => {
  it("records promotion entries", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    applyPromotionPlans("dev", "staging", { appliedBy: "admin" });

    const history = listPromotionHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.fromEnv).toBe("dev");
    expect(history[0]!.toEnv).toBe("staging");
    expect(history[0]!.status).toBe("promoted");
    expect(history[0]!.appliedBy).toBe("admin");
    expect(history[0]!.before).toBeNull();
    expect(history[0]!.after).toBe(0.5);
  });

  it("accumulates history across promotions", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    applyPromotionPlans("dev", "staging");
    applyPromotionPlans("staging", "prod");

    expect(listPromotionHistory()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 8. Rollback metadata is generated correctly
// ---------------------------------------------------------------------------

describe("buildPromotionRollbackMetadata", () => {
  it("generates rollback for promoted plans", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    const { promoted } = applyPromotionPlans("dev", "staging");
    const rollbacks = buildPromotionRollbackMetadata(promoted);

    expect(rollbacks).toHaveLength(1);
    expect(rollbacks[0]!.rollbackAction.targetFile).toBe(
      "data/factory-policy.staging.json",
    );
    expect(rollbacks[0]!.rollbackAction.key).toBe(
      "provider_routing.recent_score_weight",
    );
    expect(rollbacks[0]!.rollbackAction.restoreValue).toBeNull();
  });

  it("excludes skipped plans from rollback", () => {
    useInMemoryStore({
      envPolicies: {
        dev: { provider_routing: { recent_score_weight: 0.5 } },
        staging: { provider_routing: { recent_score_weight: 0.5 } },
        prod: {},
      },
    });

    const plans = buildPromotionPlans("dev", "staging");
    const rollbacks = buildPromotionRollbackMetadata(plans);
    expect(rollbacks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Single-proposal promotion works
// ---------------------------------------------------------------------------

describe("single-proposal promotion", () => {
  it("promotes only the specified proposal", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
      cost_guardrail: { max_cost_per_step: 0.065 },
    });

    const { promoted } = applyPromotionPlans("dev", "staging", {
      proposalId: "provider-routing-recent-score-weight",
    });

    expect(promoted).toHaveLength(1);
    expect(promoted[0]!.key).toBe("provider_routing.recent_score_weight");

    // cost_guardrail should NOT be in staging
    const staging = collectPromotableChanges("staging");
    expect(staging).toHaveLength(1);
    expect(staging[0]!.key).toBe("provider_routing.recent_score_weight");
  });
});

// ---------------------------------------------------------------------------
// 10. CLI format support
// ---------------------------------------------------------------------------

describe("formatPromotionReport", () => {
  it("produces readable text output", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    const report = buildPromotionReport("dev", "staging");
    const text = formatPromotionReport(report);

    expect(text).toContain("POLICY PROMOTION REPORT");
    expect(text).toContain("provider_routing.recent_score_weight");
    expect(text).toContain("dev");
    expect(text).toContain("staging");
  });

  it("JSON output is valid JSON", () => {
    const report = buildPromotionReport("dev", "staging");
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    expect(parsed.summary).toBeDefined();
    expect(parsed.plans).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 11. Same inputs yield same promotion plan output (determinism)
// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("same source produces identical plans", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
      cost_guardrail: { max_cost_per_step: 0.065 },
    });

    const p1 = buildPromotionPlans("dev", "staging");
    const p2 = buildPromotionPlans("dev", "staging");

    expect(p1.length).toBe(p2.length);
    for (let i = 0; i < p1.length; i++) {
      expect(p1[i]!.promotionId).toBe(p2[i]!.promotionId);
      expect(p1[i]!.status).toBe(p2[i]!.status);
      expect(p1[i]!.promotedValue).toBe(p2[i]!.promotedValue);
    }
  });

  it("promotionId is derived deterministically", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    const plans = buildPromotionPlans("dev", "staging");
    expect(plans[0]!.promotionId).toBe(
      "promote-provider-routing-recent-score-weight-dev-to-staging",
    );
  });
});

// ---------------------------------------------------------------------------
// Full chain: dev → staging → prod
// ---------------------------------------------------------------------------

describe("full promotion chain", () => {
  it("supports dev → staging → prod path", () => {
    setupDevPolicy({
      provider_routing: { recent_score_weight: 0.5 },
    });

    // dev → staging
    const r1 = applyPromotionPlans("dev", "staging");
    expect(r1.promoted).toHaveLength(1);

    // staging → prod
    const r2 = applyPromotionPlans("staging", "prod");
    expect(r2.promoted).toHaveLength(1);

    // Verify prod has the value
    const prod = collectPromotableChanges("prod");
    expect(prod).toHaveLength(1);
    expect(prod[0]!.value).toBe(0.5);

    // History should have 2 entries
    expect(listPromotionHistory()).toHaveLength(2);
  });
});
