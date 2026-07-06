import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectDiff } from "../collector/diff";
import { loadWatcherConfigFromYaml } from "../collector/config-loader";
import type { WatcherConfig } from "../collector/types";
import { DiffAnalysisRequestSchema } from "../analyzer/schema";
import { analyzeDiff, type ClaudeMessagesClient } from "../analyzer/claude-client";
import { InMemoryTenantUsageGuard } from "../analyzer/usage-guard";
import { FailureThresholdTracker, InMemoryAlertSink } from "../analyzer/alerts";
import { loadFixture } from "../test-utils/fixtures";

// このテストは gov-doc-engine の MVP スコープ (助成金検知) の
// 「収集層(差分検知) → 解析層(Claude構造化抽出)」を fixture ベースで通しで検証する
// E2E テスト。実サイトへのアクセス・実 Claude API 呼び出しは一切行わない
// (Claude 呼び出しはすべて canned JSON を返すフェイククライアントに差し替える)。

const here = dirname(fileURLToPath(import.meta.url));
const sourcesYamlPath = join(here, "..", "collector", "sources.yaml");
const config: WatcherConfig = loadWatcherConfigFromYaml(readFileSync(sourcesYamlPath, "utf8"));

function findSource(id: string) {
  const source = config.sources.find((s) => s.id === id);
  if (!source) throw new Error(`fixture setup error: source ${id} not found in sources.yaml`);
  return source;
}

function makeClientReturning(json: unknown): ClaudeMessagesClient {
  return {
    messages: {
      create: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify(json) }],
        usage: { input_tokens: 1500, output_tokens: 400 },
      }),
    },
  };
}

function freshDeps(client: ClaudeMessagesClient) {
  return {
    client,
    usageGuard: new InMemoryTenantUsageGuard(),
    alertSink: new InMemoryAlertSink(),
    failureTracker: new FailureThresholdTracker(),
  };
}

describe("E2E: 差分検知 → 構造化 JSON 抽出 (助成金検知 MVP)", () => {
  it("mirasapo-plus: detects the new IT導入補助金 entry and extracts industries/amount/deadline", async () => {
    const source = findSource("mirasapo-plus-subsidy-search");
    const before = loadFixture("mirasapo-plus-before.html");
    const after = loadFixture("mirasapo-plus-after.html");

    const diff = detectDiff({ previousHtml: before, currentHtml: after, selector: source.selector });
    expect(diff.changed).toBe(true);

    const request = DiffAnalysisRequestSchema.parse({
      tenantId: "tenant-mirasapo",
      sourceId: source.id,
      sourceUrl: source.url,
      previousText: diff.previousNormalized,
      currentText: diff.currentNormalized,
    });

    const canned = {
      isRelevant: true,
      subsidyName: "IT導入補助金2026（通常枠）",
      targetIndustries: ["全業種（中小企業・小規模事業者）"],
      amount: { min: 50_000, max: 4_500_000, unit: "JPY", description: "補助率1/2以内" },
      applicationDeadline: { date: "2026-08-28", description: null },
      summary: "IT導入補助金2026（通常枠）が新規掲載された。対象は中小企業・小規模事業者全業種。",
      sourceUrl: source.url,
      confidence: "high",
    };

    const deps = freshDeps(makeClientReturning(canned));
    const result = await analyzeDiff(request, deps);

    expect(result.isRelevant).toBe(true);
    expect(result.subsidyName).toBe("IT導入補助金2026（通常枠）");
    expect(result.targetIndustries).toContain("全業種（中小企業・小規模事業者）");
    expect(result.amount.max).toBe(4_500_000);
    expect(result.applicationDeadline.date).toBe("2026-08-28");
    expect(deps.alertSink.failures).toHaveLength(0);
  });

  it("jnet21: detects and extracts the new 事業承継・引継ぎ補助金 entry", async () => {
    const source = findSource("jnet21-subsidy-info");
    const before = loadFixture("jnet21-before.html");
    const after = loadFixture("jnet21-after.html");
    const diff = detectDiff({ previousHtml: before, currentHtml: after, selector: source.selector });
    expect(diff.changed).toBe(true);

    const request = DiffAnalysisRequestSchema.parse({
      tenantId: "tenant-jnet21",
      sourceId: source.id,
      sourceUrl: source.url,
      previousText: diff.previousNormalized,
      currentText: diff.currentNormalized,
    });

    const canned = {
      isRelevant: true,
      subsidyName: "事業承継・引継ぎ補助金（専門家活用枠）",
      targetIndustries: ["全業種（M&Aを実施予定の中小企業）"],
      amount: { min: null, max: 6_000_000, unit: "JPY", description: null },
      applicationDeadline: { date: "2026-09-18", description: null },
      summary: "事業承継・引継ぎ補助金（専門家活用枠）が新規掲載された。",
      sourceUrl: source.url,
      confidence: "medium",
    };

    const deps = freshDeps(makeClientReturning(canned));
    const result = await analyzeDiff(request, deps);

    expect(result.subsidyName).toBe("事業承継・引継ぎ補助金（専門家活用枠）");
    expect(result.amount.max).toBe(6_000_000);
    expect(result.applicationDeadline.date).toBe("2026-09-18");
  });

  it("mhlw: detects and extracts the new 業務改善助成金 entry", async () => {
    const source = findSource("mhlw-subsidy-notice");
    const before = loadFixture("mhlw-before.html");
    const after = loadFixture("mhlw-after.html");
    const diff = detectDiff({ previousHtml: before, currentHtml: after, selector: source.selector });
    expect(diff.changed).toBe(true);

    const request = DiffAnalysisRequestSchema.parse({
      tenantId: "tenant-mhlw",
      sourceId: source.id,
      sourceUrl: source.url,
      previousText: diff.previousNormalized,
      currentText: diff.currentNormalized,
    });

    const canned = {
      isRelevant: true,
      subsidyName: "業務改善助成金",
      targetIndustries: ["中小企業・小規模事業者（全業種）"],
      amount: { min: null, max: 6_000_000, unit: "JPY", description: null },
      applicationDeadline: { date: "2027-01-31", description: null },
      summary: "業務改善助成金が新規掲載された。",
      sourceUrl: source.url,
      confidence: "high",
    };

    const deps = freshDeps(makeClientReturning(canned));
    const result = await analyzeDiff(request, deps);

    expect(result.subsidyName).toBe("業務改善助成金");
    expect(result.applicationDeadline.date).toBe("2027-01-31");
  });

  it("no-change fixture: detectDiff reports changed=false so the (costly) analysis step can be skipped", () => {
    const source = findSource("mirasapo-plus-subsidy-search");
    const before = loadFixture("mirasapo-plus-before.html");
    const diff = detectDiff({ previousHtml: before, currentHtml: before, selector: source.selector });
    expect(diff.changed).toBe(false);
  });
});
