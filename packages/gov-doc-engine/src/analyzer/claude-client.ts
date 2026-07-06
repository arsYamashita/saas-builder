import Anthropic from "@anthropic-ai/sdk";
import { resolveClaudeModel } from "../config/models";
import { buildUserPrompt, SYSTEM_INSTRUCTIONS } from "./prompt";
import { SUBSIDY_OUTPUT_JSON_SCHEMA } from "./output-schema";
import { SubsidyExtractionSchema, type SubsidyExtraction, type DiffAnalysisRequest } from "./schema";
import { recordAiFailure, type AlertSink, type FailureThresholdTracker } from "./alerts";
import { DEFAULT_ESTIMATED_TOKENS_PER_REQUEST, type TenantUsageGuard } from "./usage-guard";

const PIPELINE_NAME = "gov-doc-engine.subsidy-extraction";

export class AiApiUnavailableError extends Error {}
export class AiUsageLimitExceededError extends Error {}
export class AiResponseParseError extends Error {}
export class AiRefusalError extends Error {}

/** claude-api スキルが要求する最小限のレスポンス形。実 SDK の型に依存しない。 */
export interface ClaudeMessageResponse {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    /**
     * cache_control 使用時、Anthropic はキャッシュ書き込み/読み出しトークンを
     * input_tokens (非キャッシュ分のみ) とは別勘定で返す。これらを実測合算に
     * 含めないと finalize の払い戻しが過多になり、テナントが月次上限を
     * 実質すり抜けられる (Codex P2 指摘)。SDK/プロバイダによっては欠落・null に
     * なり得るため optional/null-safe に扱う。
     */
    cache_creation_input_tokens?: number | null;
    cache_read_input_tokens?: number | null;
  };
}

/**
 * 実測トークンの合算。プロンプト総量 =
 * input_tokens(非キャッシュ分) + cache_creation + cache_read、これに output_tokens を加える。
 * cache フィールドは optional/null-safe（未提供なら 0 扱い）。
 */
export function totalTokensFromUsage(usage: ClaudeMessageResponse["usage"]): number {
  return (
    usage.input_tokens +
    usage.output_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0)
  );
}

/**
 * Anthropic SDK バージョンへの結合を1箇所（createAnthropicClaudeClient）に閉じ込めるための
 * 最小インターフェイス。テストではこの形を満たす plain object を注入し、実 SDK を
 * インスタンス化しない（= 実 Claude API 課金呼び出しはテストで発生しない）。
 */
export interface ClaudeMessagesClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system?: Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
      messages: Array<{ role: "user"; content: string }>;
      output_config?: {
        effort?: "low" | "medium" | "high" | "max";
        format?: { type: "json_schema"; schema: Record<string, unknown> };
      };
    }): Promise<ClaudeMessageResponse>;
  };
}

/**
 * 実 Anthropic SDK を ClaudeMessagesClient に適合させるファクトリ。
 * SDK バージョン差異による型の結合はここに閉じ込め、呼び出し側は narrow interface
 * のみを意識すればよいようにする。
 */
export function createAnthropicClaudeClient(apiKey: string): ClaudeMessagesClient {
  const sdk = new Anthropic({ apiKey });
  return {
    messages: {
      create: (params) =>
        sdk.messages.create(
          params as Anthropic.MessageCreateParamsNonStreaming,
        ) as unknown as Promise<ClaudeMessageResponse>,
    },
  };
}

/**
 * 環境変数から Claude クライアントを構築する。ANTHROPIC_API_KEY が未設定なら null を返す。
 * null の場合のアラート送出は analyzeDiff() 側が担う（ここでは投げない）。
 */
export function createClaudeClientFromEnv(
  env: Record<string, string | undefined> = process.env,
): ClaudeMessagesClient | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return createAnthropicClaudeClient(apiKey);
}

export interface AnalyzeDiffDeps {
  /** null の場合 ANTHROPIC_API_KEY 未設定として扱い、アラートを出して呼び出しをスキップする。 */
  client: ClaudeMessagesClient | null;
  usageGuard: TenantUsageGuard;
  alertSink: AlertSink;
  failureTracker: FailureThresholdTracker;
  model?: string;
  now?: () => Date;
}

/**
 * 差分 → 構造化 JSON 抽出のメイン関数。KB教訓3件をすべてこの関数の実行パスに内蔵する:
 *   1. llm_api_unbounded_text_input: DiffAnalysisRequestSchema が入力長を検証済み
 *      (呼び出し元が request を DiffAnalysisRequestSchema.parse() してから渡す前提)
 *   2. claude_api_user_cost_limit_missing: usageGuard.reserve/finalize/release
 *   3. ai_api_silent_degradation_no_alert: recordAiFailure を全失敗経路で呼ぶ
 *      (APIキー不在 / 呼び出し失敗 / refusal / JSON パース失敗)
 */
export async function analyzeDiff(
  request: DiffAnalysisRequest,
  deps: AnalyzeDiffDeps,
): Promise<SubsidyExtraction> {
  const now = deps.now ?? (() => new Date());

  if (!deps.client) {
    await recordAiFailure(
      deps.alertSink,
      deps.failureTracker,
      { pipeline: PIPELINE_NAME, reason: "api_key_missing" },
      now(),
    );
    throw new AiApiUnavailableError("ANTHROPIC_API_KEY is not configured — gov-doc-engine cannot call Claude");
  }

  const estimatedTokens = DEFAULT_ESTIMATED_TOKENS_PER_REQUEST;
  // reserve() は予約時の期間バケットキーを保持する Reservation を返す。
  // finalize/release にこのハンドルを渡すことで、UTC日/月境界を跨いだ補正が
  // 必ず予約時のバケットに当たる (Codex review 2026-07-06 P2 on PR #39)。
  const reservation = await deps.usageGuard.reserve(request.tenantId, estimatedTokens);
  if (!reservation) {
    throw new AiUsageLimitExceededError(`Tenant ${request.tenantId} exceeded its monthly Claude usage budget`);
  }

  const model = deps.model ?? resolveClaudeModel();

  let response: ClaudeMessageResponse;
  try {
    response = await deps.client.messages.create({
      model,
      max_tokens: 2048,
      // 抽出タスクなので低コストの effort で十分。
      output_config: { effort: "low", format: { type: "json_schema", schema: SUBSIDY_OUTPUT_JSON_SCHEMA } },
      // system prompt は全呼び出しで不変 → cache_control でキャッシュしコストを抑える。
      system: [{ type: "text", text: SYSTEM_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildUserPrompt(request) }],
    });
  } catch (err) {
    await deps.usageGuard.release(reservation);
    await recordAiFailure(
      deps.alertSink,
      deps.failureTracker,
      { pipeline: PIPELINE_NAME, reason: "call_error", detail: err instanceof Error ? err.message : String(err) },
      now(),
    );
    throw err;
  }

  // 呼び出し自体は成功した（トークンは実際に消費された）ので、パース結果に関わらず先に確定させる。
  // cache_creation/cache_read も含めた総量で確定する (Codex P2: input+output のみだと過小計上)。
  const actualTokens = totalTokensFromUsage(response.usage);
  await deps.usageGuard.finalize(reservation, actualTokens);

  if (response.stop_reason === "refusal") {
    await recordAiFailure(deps.alertSink, deps.failureTracker, { pipeline: PIPELINE_NAME, reason: "refusal" }, now());
    throw new AiRefusalError("Claude declined the request (stop_reason: refusal)");
  }

  const textBlock = response.content.find((b) => b.type === "text" && typeof b.text === "string");
  if (!textBlock?.text) {
    await recordAiFailure(
      deps.alertSink,
      deps.failureTracker,
      { pipeline: PIPELINE_NAME, reason: "json_parse_error", detail: "no text content in Claude response" },
      now(),
    );
    throw new AiResponseParseError("Claude response contained no text content");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(textBlock.text);
  } catch (err) {
    await recordAiFailure(
      deps.alertSink,
      deps.failureTracker,
      { pipeline: PIPELINE_NAME, reason: "json_parse_error", detail: err instanceof Error ? err.message : String(err) },
      now(),
    );
    throw new AiResponseParseError("Claude response was not valid JSON");
  }

  const parsed = SubsidyExtractionSchema.safeParse(parsedJson);
  if (!parsed.success) {
    await recordAiFailure(
      deps.alertSink,
      deps.failureTracker,
      { pipeline: PIPELINE_NAME, reason: "json_parse_error", detail: parsed.error.message },
      now(),
    );
    throw new AiResponseParseError(`Claude response failed schema validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
