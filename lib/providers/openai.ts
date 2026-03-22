/**
 * OpenAI Provider Adapter (stub)
 *
 * Placeholder for future OpenAI integration.
 * Implements the same ProviderAdapter interface.
 */

import type {
  ProviderAdapter,
  GenerationRequest,
  ProviderRawResult,
} from "./provider-interface";

const OPENAI_MODEL = "gpt-4o";

export class OpenAIAdapter implements ProviderAdapter {
  readonly providerId = "openai" as const;
  readonly defaultModel = OPENAI_MODEL;

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generate(request: GenerationRequest): Promise<ProviderRawResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const start = Date.now();

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: request.maxTokens ?? 16384,
        messages: [
          ...(request.system
            ? [{ role: "system" as const, content: request.system }]
            : []),
          { role: "user" as const, content: request.prompt },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${text}`);
    }

    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content ?? "";

    // Extract token usage from OpenAI API response
    const inputTokens: number | undefined = json?.usage?.prompt_tokens;
    const outputTokens: number | undefined = json?.usage?.completion_tokens;
    const totalTokens: number | undefined = json?.usage?.total_tokens;

    return {
      provider: "openai",
      model: OPENAI_MODEL,
      text,
      raw: json,
      durationMs: Date.now() - start,
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }
}
