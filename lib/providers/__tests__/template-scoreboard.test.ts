import { describe, it, expect } from "vitest";
import { buildScoreboard } from "../template-scoreboard";

describe("buildScoreboard", () => {
  const templateLabels = [
    { templateKey: "mca", label: "MCA Template" },
    { templateKey: "rsv", label: "RSV Template" },
  ];

  it("returns all templates even with no runs", () => {
    const scoreboard = buildScoreboard([], [], templateLabels);
    expect(scoreboard.templates).toHaveLength(2);
    expect(scoreboard.templates[0].totalRuns).toBe(0);
    expect(scoreboard.templates[0].greenRate).toBe(0);
  });

  it("calculates green rate correctly", () => {
    const runs = [
      { template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
      { template_key: "mca", status: "completed", review_status: "approved", reviewed_at: "2024-01-01", promoted_at: null, baseline_tag: null },
      { template_key: "mca", status: "failed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
    ];
    const scoreboard = buildScoreboard(runs, [], templateLabels);
    const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
    expect(mca.totalRuns).toBe(3);
    expect(mca.completedRuns).toBe(2);
    expect(mca.greenRate).toBe(67);
    expect(mca.approvedRuns).toBe(1);
  });

  it("tracks latest baseline tag", () => {
    const runs = [
      { template_key: "mca", status: "completed", review_status: "approved", reviewed_at: "2024-01-01", promoted_at: "2024-01-02", baseline_tag: "baseline/mca-v1" },
      { template_key: "mca", status: "completed", review_status: "approved", reviewed_at: "2024-02-01", promoted_at: "2024-02-02", baseline_tag: "baseline/mca-v2" },
    ];
    const scoreboard = buildScoreboard(runs, [], templateLabels);
    const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
    expect(mca.latestBaselineTag).toBe("baseline/mca-v2");
    expect(mca.promotedRuns).toBe(2);
  });

  it("includes generatedAt timestamp", () => {
    const scoreboard = buildScoreboard([], [], templateLabels);
    expect(scoreboard.generatedAt).toBeTruthy();
  });

  it("calculates promotion rate as promoted/approved", () => {
    const runs = [
      { id: "r1", template_key: "mca", status: "completed", review_status: "approved", reviewed_at: "2024-01-01", promoted_at: "2024-01-02", baseline_tag: "baseline/mca-v1" },
      { id: "r2", template_key: "mca", status: "completed", review_status: "approved", reviewed_at: "2024-02-01", promoted_at: null, baseline_tag: null },
      { id: "r3", template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
    ];
    const scoreboard = buildScoreboard(runs, [], templateLabels);
    const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
    expect(mca.approvedRuns).toBe(2);
    expect(mca.promotedRuns).toBe(1);
    expect(mca.promotionRate).toBe(50);
  });

  it("returns 0 promotion rate when no approved runs", () => {
    const runs = [
      { template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
    ];
    const scoreboard = buildScoreboard(runs, [], templateLabels);
    const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
    expect(mca.promotionRate).toBe(0);
  });

  it("includes blueprint review status per template", () => {
    const bpStatuses = [
      { project_template_key: "mca", review_status: "approved" },
      { project_template_key: "rsv", review_status: "pending" },
    ];
    const scoreboard = buildScoreboard([], [], templateLabels, bpStatuses);
    const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
    const rsv = scoreboard.templates.find((t) => t.templateKey === "rsv")!;
    expect(mca.blueprintReviewStatus).toBe("approved");
    expect(rsv.blueprintReviewStatus).toBe("pending");
  });

  it("returns null blueprint status when no data", () => {
    const scoreboard = buildScoreboard([], [], templateLabels);
    const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
    expect(mca.blueprintReviewStatus).toBeNull();
  });

  describe("quality metrics", () => {
    it("calculates quality pass rate from linked quality runs", () => {
      const runs = [
        { id: "run-1", template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
        { id: "run-2", template_key: "mca", status: "completed", review_status: "approved", reviewed_at: "2024-01-01", promoted_at: null, baseline_tag: null },
        { id: "run-3", template_key: "rsv", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
      ];
      const qualityRuns = [
        { generation_run_id: "run-1", status: "passed" },
        { generation_run_id: "run-2", status: "failed" },
        { generation_run_id: "run-3", status: "passed" },
      ];
      const scoreboard = buildScoreboard(runs, qualityRuns, templateLabels);
      const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;
      const rsv = scoreboard.templates.find((t) => t.templateKey === "rsv")!;

      expect(mca.qualityTotalRuns).toBe(2);
      expect(mca.qualityPassedRuns).toBe(1);
      expect(mca.qualityPassRate).toBe(50);

      expect(rsv.qualityTotalRuns).toBe(1);
      expect(rsv.qualityPassedRuns).toBe(1);
      expect(rsv.qualityPassRate).toBe(100);
    });

    it("returns 0 quality metrics when no quality runs exist", () => {
      const runs = [
        { id: "run-1", template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
      ];
      const scoreboard = buildScoreboard(runs, [], templateLabels);
      const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;

      expect(mca.qualityTotalRuns).toBe(0);
      expect(mca.qualityPassedRuns).toBe(0);
      expect(mca.qualityPassRate).toBe(0);
    });

    it("handles multiple quality runs per generation run", () => {
      const runs = [
        { id: "run-1", template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
      ];
      const qualityRuns = [
        { generation_run_id: "run-1", status: "failed" },
        { generation_run_id: "run-1", status: "failed" },
        { generation_run_id: "run-1", status: "passed" },
      ];
      const scoreboard = buildScoreboard(runs, qualityRuns, templateLabels);
      const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;

      expect(mca.qualityTotalRuns).toBe(3);
      expect(mca.qualityPassedRuns).toBe(1);
      expect(mca.qualityPassRate).toBe(33);
    });

    it("ignores quality runs with no matching generation run", () => {
      const runs = [
        { id: "run-1", template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
      ];
      const qualityRuns = [
        { generation_run_id: "run-1", status: "passed" },
        { generation_run_id: "run-unknown", status: "passed" },
      ];
      const scoreboard = buildScoreboard(runs, qualityRuns, templateLabels);
      const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;

      expect(mca.qualityTotalRuns).toBe(1);
      expect(mca.qualityPassedRuns).toBe(1);
      expect(mca.qualityPassRate).toBe(100);
    });

    it("works with runs that have no id (backward compat)", () => {
      const runs = [
        { template_key: "mca", status: "completed", review_status: "pending", reviewed_at: null, promoted_at: null, baseline_tag: null },
      ];
      const qualityRuns = [
        { generation_run_id: "run-1", status: "passed" },
      ];
      const scoreboard = buildScoreboard(runs, qualityRuns, templateLabels);
      const mca = scoreboard.templates.find((t) => t.templateKey === "mca")!;

      expect(mca.qualityTotalRuns).toBe(0);
      expect(mca.qualityPassRate).toBe(0);
    });
  });
});
