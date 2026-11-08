import { describe, it, expect, vi } from "vitest";
import {
  analyzeDiff,
  totalTokensFromUsage,
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
    // VALID_EXTRACTION の金額(5万〜450万)・締切(2026年8月28日)を本文に含めることで
    // 数値グラウンディングが通り、confidence 据え置き・アラート0件になる。
    currentText:
      "ものづくり補助金 + IT導入補助金2026 通常枠が追加。補助額は5万円から450万円、申請期限は2026年8月28日。",
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
    // 後方互換シグネチャ: 第1引数 = 月次上限（移設前の gov-doc-engine と同じ）。
    // 日次上限は options で明示オプトイン — このテストは月次のみ検証する。
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
    expect(deps.usageGuard.getMonthlyUsed("tenant-1")).toBe(1500);
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
    expect(deps.usageGuard.getMonthlyUsed("tenant-1")).toBe(0); // reservation released, no residual charge
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

describe("analyzeDiff numeric grounding (指示書188)", () => {
  // 本文「上限100万円」。amount.max 以外は null / 本文準拠にして、max だけを揺らす。
  function groundingExtraction(overrides: {
    max: number | null;
    date?: string | null;
    sourceUrl?: string;
  }) {
    return {
      isRelevant: true,
      subsidyName: "テスト補助金",
      targetIndustries: ["全業種"],
      amount: { min: null, max: overrides.max, unit: "JPY", description: null },
      applicationDeadline: { date: overrides.date ?? null, description: null },
      summary: "テスト",
      sourceUrl: overrides.sourceUrl ?? "https://example.go.jp/subsidy/",
      confidence: "high",
    };
  }

  function groundingRequest(currentText: string): Partial<DiffAnalysisRequest> {
    return { sourceUrl: "https://example.go.jp/subsidy/", currentText };
  }

  it("(a) downgrades confidence to low and records unsourced_numeric when AI invents a number", async () => {
    // 本文は「上限100万円」(= 1,000,000)。AI は桁を1つ余計に付けて 1,000,000,000 と返す。
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(groundingExtraction({ max: 1_000_000_000 })) }],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = makeDeps(client);

    const result = await analyzeDiff(makeRequest(groundingRequest("補助金の上限100万円")), deps);

    expect(result.confidence).toBe("low");
    expect(result.unsourcedFields).toEqual(["amount.max"]);
    // 抽出そのものは捨てない。
    expect(result.amount.max).toBe(1_000_000_000);
    const unsourced = deps.alertSink.failures.filter((f) => f.reason === "unsourced_numeric");
    expect(unsourced).toHaveLength(1);
    // detail はフィールド名のみ (本文・金額を載せない)。
    expect(unsourced[0].detail).toBe("amount.max");
  });

  it("(b) keeps confidence and leaves unsourcedFields empty when amount and 和暦 date are grounded", async () => {
    // 本文「上限100万円」「令和8年12月25日締切」。AI は max:1,000,000 / date:2026-12-25。
    const client = makeClient({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify(groundingExtraction({ max: 1_000_000, date: "2026-12-25" })),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = makeDeps(client);

    const result = await analyzeDiff(
      makeRequest(groundingRequest("補助金の上限100万円。令和8年12月25日締切。")),
      deps,
    );

    expect(result.confidence).toBe("high");
    expect(result.unsourcedFields).toEqual([]);
    expect(deps.alertSink.failures).toHaveLength(0);
  });

  it("(c) always returns the request's sourceUrl even when the AI reports a different one", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: JSON.stringify(
            groundingExtraction({ max: 1_000_000, sourceUrl: "https://evil.example.com/other" }),
          ),
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10 },
    });
    const deps = makeDeps(client);

    const result = await analyzeDiff(makeRequest(groundingRequest("補助金の上限100万円")), deps);

    expect(result.sourceUrl).toBe("https://example.go.jp/subsidy/");
  });
});

describe("totalTokensFromUsage / cache token accounting (Codex P2: cache分の過小計上防止)", () => {
  it("includes cache_creation and cache_read tokens when present", () => {
    expect(
      totalTokensFromUsage({
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 700,
        cache_read_input_tokens: 1150,
      }),
    ).toBe(2000);
  });

  it("is null-safe / optional-safe when cache fields are absent or null", () => {
    expect(totalTokensFromUsage({ input_tokens: 100, output_tokens: 50 })).toBe(150);
    expect(
      totalTokensFromUsage({
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
      }),
    ).toBe(150);
  });

  it("analyzeDiff finalizes with cache tokens included (regression: cached usage fields present)", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(VALID_EXTRACTION) }],
      // 実測合計 = 200 + 300 + 900 + 1600 = 3000。
      // 旧実装 (input+output のみ) だと 500 と過小計上され、予約8000との差 7500 が
      // 過剰に払い戻されてテナントが月次上限をすり抜けられた。
      usage: {
        input_tokens: 200,
        output_tokens: 300,
        cache_creation_input_tokens: 900,
        cache_read_input_tokens: 1600,
      },
    });
    const deps = makeDeps(client);

    await analyzeDiff(makeRequest(), deps);

    expect(deps.usageGuard.getMonthlyUsed("tenant-1")).toBe(3000);
  });

  it("analyzeDiff still finalizes correctly when cache fields are absent (regression: no cached fields)", async () => {
    const client = makeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(VALID_EXTRACTION) }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    });
    const deps = makeDeps(client);

    await analyzeDiff(makeRequest(), deps);

    expect(deps.usageGuard.getMonthlyUsed("tenant-1")).toBe(1500);
  });
});
