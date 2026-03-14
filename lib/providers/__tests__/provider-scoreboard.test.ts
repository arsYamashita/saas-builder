import { describe, it, expect } from "vitest";
import {
  buildProviderScoreboard,
  type GenerationRunInput,
} from "../provider-scoreboard";

function makeRun(
  overrides: Partial<GenerationRunInput> & { template_key: string }
): GenerationRunInput {
  return {
    id: crypto.randomUUID(),
    status: "completed",
    steps_json: [],
    promoted_at: null,
    review_status: "pending",
    ...overrides,
  };
}

function makeStep(
  key: string,
  status: "completed" | "failed",
  meta: Record<string, unknown> = {}
) {
  return {
    key: key as any,
    label: key,
    status,
    meta: {
      taskKind: key,
      provider: "claude",
      model: "claude-3-sonnet",
      durationMs: 5000,
      ...meta,
    },
  };
}

describe("buildProviderScoreboard", () => {
  it("returns empty scoreboard for no runs", () => {
    const result = buildProviderScoreboard([]);
    expect(result.templates).toHaveLength(0);
    expect(result.globalMetrics).toHaveLength(0);
    expect(result.generatedAt).toBeTruthy();
  });

  it("calculates provider success rate correctly", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          makeStep("implementation", "completed"),
          makeStep("schema", "completed"),
          makeStep("api_design", "failed"),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const crm = result.templates.find((t) => t.templateKey === "simple_crm_saas")!;
    const claude = crm.stepMetrics.find((m) => m.provider === "claude" && m.taskKind === "implementation")!;
    expect(claude.successRate).toBe(100);
    expect(claude.totalSteps).toBe(1);

    const apiFailed = crm.stepMetrics.find((m) => m.taskKind === "api_design")!;
    expect(apiFailed.successRate).toBe(0);
    expect(apiFailed.failedSteps).toBe(1);
  });

  it("tracks fallback usage", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          makeStep("blueprint", "completed", {
            provider: "claude",
            fallbackUsed: true,
            fallbackFromProvider: "gemini",
          }),
          makeStep("blueprint", "completed", { provider: "gemini" }),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);

    // claude blueprint (fallback case)
    const claudeBp = result.globalMetrics.find(
      (m) => m.provider === "claude" && m.taskKind === "blueprint"
    )!;
    expect(claudeBp.fallbackCount).toBe(1);
    expect(claudeBp.fallbackRate).toBe(100);

    // gemini blueprint (normal case)
    const geminiBp = result.globalMetrics.find(
      (m) => m.provider === "gemini" && m.taskKind === "blueprint"
    )!;
    expect(geminiBp.fallbackCount).toBe(0);
    expect(geminiBp.fallbackRate).toBe(0);
  });

  it("tracks rerun rate", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "community_membership_saas",
        steps_json: [
          makeStep("schema", "completed", { rerunAt: "2024-01-15T00:00:00Z" }),
          makeStep("schema", "completed"),
          makeStep("schema", "completed"),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const cms = result.templates.find((t) => t.templateKey === "community_membership_saas")!;
    const schemaMet = cms.stepMetrics.find((m) => m.taskKind === "schema")!;
    expect(schemaMet.rerunCount).toBe(1);
    expect(schemaMet.rerunRate).toBe(33);
  });

  it("calculates promotion rate as promoted/approved", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        review_status: "approved",
        promoted_at: "2024-01-01T00:00:00Z",
        steps_json: [makeStep("schema", "completed")],
      }),
      makeRun({
        template_key: "simple_crm_saas",
        review_status: "approved",
        promoted_at: null,
        steps_json: [makeStep("schema", "completed")],
      }),
      makeRun({
        template_key: "simple_crm_saas",
        review_status: "pending",
        steps_json: [makeStep("schema", "completed")],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const crm = result.templates.find((t) => t.templateKey === "simple_crm_saas")!;
    expect(crm.promotionRate).toBe(50); // 1 promoted / 2 approved
  });

  it("calculates duration percentiles", () => {
    const steps = [1000, 2000, 3000, 4000, 10000].map((ms, i) =>
      makeStep("implementation", "completed", { durationMs: ms })
    );
    const runs: GenerationRunInput[] = [
      makeRun({ template_key: "simple_crm_saas", steps_json: steps }),
    ];
    const result = buildProviderScoreboard(runs);
    const impl = result.globalMetrics.find((m) => m.taskKind === "implementation")!;
    expect(impl.avgDurationMs).toBe(4000);
    expect(impl.p50DurationMs).toBe(3000);
    expect(impl.p95DurationMs).toBe(10000);
  });

  it("skips pending steps", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          { key: "schema" as any, label: "Schema", status: "pending" },
          makeStep("implementation", "completed"),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const crm = result.templates.find((t) => t.templateKey === "simple_crm_saas")!;
    expect(crm.stepMetrics).toHaveLength(1);
    expect(crm.stepMetrics[0].taskKind).toBe("implementation");
  });

  it("aggregates across multiple templates in globalMetrics", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [makeStep("schema", "completed", { durationMs: 2000 })],
      }),
      makeRun({
        template_key: "community_membership_saas",
        steps_json: [makeStep("schema", "completed", { durationMs: 4000 })],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    expect(result.templates).toHaveLength(2);
    const globalSchema = result.globalMetrics.find((m) => m.taskKind === "schema")!;
    expect(globalSchema.totalSteps).toBe(2);
    expect(globalSchema.avgDurationMs).toBe(3000);
  });

  it("handles steps with unknown provider gracefully", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          {
            key: "export_files" as any,
            label: "Export",
            status: "completed",
            meta: undefined,
          },
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const metric = result.globalMetrics.find((m) => m.provider === "unknown")!;
    expect(metric.totalSteps).toBe(1);
    expect(metric.completedSteps).toBe(1);
  });

  // ── v1.1 tests ───────────────────────────────────────────────

  it("accumulates token usage from step meta", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          makeStep("schema", "completed", {
            inputTokens: 1000,
            outputTokens: 2000,
            totalTokens: 3000,
          }),
          makeStep("schema", "completed", {
            inputTokens: 1500,
            outputTokens: 2500,
            totalTokens: 4000,
          }),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const schema = result.globalMetrics.find((m) => m.taskKind === "schema")!;
    expect(schema.totalInputTokens).toBe(2500);
    expect(schema.totalOutputTokens).toBe(4500);
    expect(schema.totalTokens).toBe(7000);
  });

  it("accumulates estimated cost from step meta", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          makeStep("schema", "completed", { estimatedCostUsd: 0.05 }),
          makeStep("api_design", "completed", { estimatedCostUsd: 0.03 }),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const crm = result.templates.find((t) => t.templateKey === "simple_crm_saas")!;
    expect(crm.totalCostUsd).toBeCloseTo(0.08, 4);
    expect(crm.avgCostPerRun).toBeCloseTo(0.08, 4);

    const schema = crm.stepMetrics.find((m) => m.taskKind === "schema")!;
    expect(schema.totalCostUsd).toBeCloseTo(0.05, 4);
    expect(schema.avgCostPerStep).toBeCloseTo(0.05, 4);
  });

  it("tracks promoted steps for promotion contribution", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        promoted_at: "2024-01-01T00:00:00Z",
        review_status: "approved",
        steps_json: [
          makeStep("schema", "completed"),
          makeStep("implementation", "completed"),
        ],
      }),
      makeRun({
        template_key: "simple_crm_saas",
        promoted_at: null,
        review_status: "pending",
        steps_json: [
          makeStep("schema", "completed"),
          makeStep("implementation", "failed"),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const schema = result.globalMetrics.find((m) => m.taskKind === "schema")!;
    expect(schema.promotedSteps).toBe(1);
    expect(schema.promotedStepRate).toBe(50); // 1 promoted / 2 total

    const impl = result.globalMetrics.find((m) => m.taskKind === "implementation")!;
    expect(impl.promotedSteps).toBe(1);
    // failed step in non-promoted run doesn't count as promoted
    expect(impl.promotedStepRate).toBe(50);
  });

  it("captures fallback reasons (top 3, deduplicated)", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [
          makeStep("blueprint", "completed", {
            fallbackUsed: true,
            fallbackFromProvider: "gemini",
            fallbackReason: "rate_limit_exceeded",
          }),
          makeStep("blueprint", "completed", {
            fallbackUsed: true,
            fallbackFromProvider: "gemini",
            fallbackReason: "rate_limit_exceeded",
          }),
          makeStep("blueprint", "completed", {
            fallbackUsed: true,
            fallbackFromProvider: "gemini",
            fallbackReason: "timeout",
          }),
        ],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const bp = result.globalMetrics.find((m) => m.taskKind === "blueprint")!;
    expect(bp.fallbackReasons).toContain("rate_limit_exceeded");
    expect(bp.fallbackReasons).toContain("timeout");
    expect(bp.fallbackReasons.length).toBeLessThanOrEqual(3);
  });

  it("handles zero tokens gracefully", () => {
    const runs: GenerationRunInput[] = [
      makeRun({
        template_key: "simple_crm_saas",
        steps_json: [makeStep("schema", "completed")],
      }),
    ];
    const result = buildProviderScoreboard(runs);
    const schema = result.globalMetrics.find((m) => m.taskKind === "schema")!;
    expect(schema.totalTokens).toBe(0);
    expect(schema.totalCostUsd).toBe(0);
    expect(schema.avgCostPerStep).toBe(0);
  });
});
