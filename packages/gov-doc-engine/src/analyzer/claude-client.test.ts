import { describe, it, expect, vi } from "vitest";
import {
  analyzeDiff,
  AiApiUnavailableError,
  AiUsageLimitExceededError,
  AiResponseParseError,
  AiRefusalError,
  type ClaudeMessagesClient,
  type ClaudeMessageResponse,
} from "./claude-client";
import { InMemoryTenantUsageGuard } from "./usage-guard";
import { FailureThresholdTracker, InMemoryAlertSink } from "./alerts";
import type { DiffAnalysisRequest } from "./schema";

// このテストファイルは実 Claude API を一切呼ばない。ClaudeMessagesClient は
// すべてテスト用のフェイク/モックであり、ネットワークにもコストにも触れない。

function makeRequest(overrides: Partial<DiffAnalysisRequest> = {}): DiffAnalysisRequest {
  return {
    tenantId: "tenant-1",
    sourceId: "mirasapo-plus-subsidy-search",
    sourceUrl: "https://mirasapo-plus.go.jp/subsidy/",
    previousText: "ものづくり補助金のみ掲載",
    currentText: "ものづくり補助金 + IT導入補助金2026 通常枠が追加",
    ...overrides,
  };
}

function makeClient(response: ClaudeMessageResponse): ClaudeMessagesClient {
  return { messages: { create: vi.fn().mockResolvedValue(response) } };
}

const VALID_EXTRACTION = {
  isRelevant: true,
  subsidyName: "IT導入補助金2026（通常枠）",
  targetIndustries: ["全業種"],
  amount: { min: 50_000, max: 4_500_000, unit: "JPY", description: "補助率1/2以内" },
  applicationDeadline: { date: "2026-08-28", description: null },
  summary: "IT導入補助金2026 通常枠が新設された。",
  sourceUrl: "https://mirasapo-plus.go.jp/subsidy/",
  confidence: "high",
};

function makeDeps(client: ClaudeMessagesClient | null) {
  return {
    client,
    usageGuard: new InMemoryTenantUsageGuard(1_000_000),
    alertSink: new InMemoryAlertSink(),
    failureTracker: new FailureThresholdTracker(60, 3),
  };
}

describe("analyzeDiff", () => {
  it("returns a validated SubsidyExtraction on success and finalizes usage to the actual token count", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(VALID_EXTRACTION) }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    });
    const deps = makeDeps(client);

    const result = await analyzeDiff(makeRequest(), deps);

    expect(result.subsidyName).toBe("IT導入補助金2026（通常枠）");
    expect(result.amount.max).toBe(4_500_000);
    // 予約 8000 (DEFAULT_ESTIMATED_TOKENS_PER_REQUEST) -> 実測 1500 に補正
    expect(deps.usageGuard.getUsed("tenant-1")).toBe(1500);
    expect(deps.alertSink.failures).toHaveLength(0);
  });

  it("throws AiApiUnavailableError and alerts when client is null (ANTHROPIC_API_KEY missing)", async () => {
    const deps = makeDeps(null);
    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow(AiApiUnavailableError);
    expect(deps.alertSink.failures).toHaveLength(1);
    expect(deps.alertSink.failures[0].reason).toBe("api_key_missing");
  });

  it("throws AiUsageLimitExceededError when the tenant is over budget, without calling Claude at all", async () => {
    const client = makeClient({ stop_reason: "end_turn", content: [], usage: { input_tokens: 0, output_tokens: 0 } });
    const deps = makeDeps(client);
    await deps.usageGuard.reserve("tenant-1", 999_999); // exhaust the tenant's budget first

    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow(AiUsageLimitExceededError);
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("releases the reservation and alerts on a Claude call error", async () => {
    const client: ClaudeMessagesClient = {
      messages: { create: vi.fn().mockRejectedValue(new Error("network down")) },
    };
    const deps = makeDeps(client);

    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow("network down");
    expect(deps.usageGuard.getUsed("tenant-1")).toBe(0); // reservation released, no residual charge
    expect(deps.alertSink.failures.map((f) => f.reason)).toContain("call_error");
  });

  it("throws AiRefusalError and alerts on stop_reason: refusal", async () => {
    const client = makeClient({ stop_reason: "refusal", content: [], usage: { input_tokens: 100, output_tokens: 0 } });
    const deps = makeDeps(client);

    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow(AiRefusalError);
    expect(deps.alertSink.failures.map((f) => f.reason)).toContain("refusal");
  });

  it("throws AiResponseParseError and alerts on invalid JSON in the response", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not json" }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = makeDeps(client);

    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow(AiResponseParseError);
    expect(deps.alertSink.failures.map((f) => f.reason)).toContain("json_parse_error");
  });

  it("throws AiResponseParseError and alerts when the JSON fails Zod schema validation", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ isRelevant: "yes-not-a-boolean" }) }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = makeDeps(client);

    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow(AiResponseParseError);
    expect(deps.alertSink.failures.map((f) => f.reason)).toContain("json_parse_error");
  });

  it("triggers a threshold-exceeded alert after 3 failures within the window (silent degradation guard)", async () => {
    const deps = makeDeps(null);
    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow();
    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow();
    await expect(analyzeDiff(makeRequest(), deps)).rejects.toThrow();
    expect(deps.alertSink.thresholdExceededEvents).toHaveLength(1);
  });

  it("uses resolveClaudeModel()'s default model id when deps.model is not overridden", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(VALID_EXTRACTION) }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = makeDeps(client);

    await analyzeDiff(makeRequest(), deps);

    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-8" }),
    );
  });

  it("respects an explicit deps.model override (no hardcoded model id downstream)", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(VALID_EXTRACTION) }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = { ...makeDeps(client), model: "claude-sonnet-5" };

    await analyzeDiff(makeRequest(), deps);

    expect(client.messages.create).toHaveBeenCalledWith(expect.objectContaining({ model: "claude-sonnet-5" }));
  });
});
