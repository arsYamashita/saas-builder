/**
 * Claude Provider Adapter
 *
 * Wraps the existing claude-request logic as a ProviderAdapter.
 */

import type {
  ProviderAdapter,
  GenerationRequest,
  ProviderRawResult,
} from "./provider-interface";
import { MODELS, assertValidModel } from "@/lib/ai/models";

// 2026-07-06 (指示書2026-07-06_031): 直書きされていた "claude-sonnet-4-5"
// (旧世代モデルID) を共通定数 MODELS.sonnet に置換。
const CLAUDE_MODEL = MODELS.sonnet;
assertValidModel(CLAUDE_MODEL); // モジュール読み込み時にサイレント劣化を検知

export class ClaudeAdapter implements ProviderAdapter {
  readonly providerId = "claude" as const;
  readonly defaultModel = CLAUDE_MODEL;

  isAvailable(): boolean {
    return !!process.env.CLAUDE_API_KEY;
  }

  async generate(request: GenerationRequest): Promise<ProviderRawResult> {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    const start = Date.now();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: request.maxTokens ?? 32768,
        system:
          request.system ??
          "You are a senior SaaS architect and engineer.",
        messages: [{ role: "user", content: request.prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error: ${response.status} ${text}`);
    }

    const json = await response.json();
    const text =
      json?.content
        ?.filter((item: { type?: string }) => item.type === "text")
        ?.map((item: { text?: string }) => item.text || "")
        ?.join("\n") ?? "";

    // Extract token usage from Anthropic API response
    const inputTokens: number | undefined = json?.usage?.input_tokens;
    const outputTokens: number | undefined = json?.usage?.output_tokens;
    const totalTokens =
      inputTokens != null && outputTokens != null
        ? inputTokens + outputTokens
        : undefined;

    return {
      provider: "claude",
      model: CLAUDE_MODEL,
      text,
      raw: json,
      durationMs: Date.now() - start,
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }
}
