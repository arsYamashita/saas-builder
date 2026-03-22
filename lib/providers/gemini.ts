/**
 * Gemini Provider Adapter
 *
 * Wraps the existing gemini-request logic as a ProviderAdapter.
 * Preserves the existing Claude fallback behavior when GEMINI_API_KEY is missing
 * or Gemini returns 429/503.
 */

import type {
  ProviderAdapter,
  GenerationRequest,
  ProviderRawResult,
} from "./provider-interface";

const GEMINI_MODEL = "gemini-2.0-flash";

export class GeminiAdapter implements ProviderAdapter {
  readonly providerId = "gemini" as const;
  readonly defaultModel = GEMINI_MODEL;

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async generate(request: GenerationRequest): Promise<ProviderRawResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const start = Date.now();

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: request.prompt }] }],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      throw new Error(`Gemini API error: ${status} ${text}`);
    }

    const json = await response.json();
    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || "")
        .join("\n") ?? "";

    // Extract token usage from Gemini API response
    const inputTokens: number | undefined = json?.usageMetadata?.promptTokenCount;
    const outputTokens: number | undefined = json?.usageMetadata?.candidatesTokenCount;
    const totalTokens: number | undefined = json?.usageMetadata?.totalTokenCount;

    return {
      provider: "gemini",
      model: GEMINI_MODEL,
      text,
      raw: json,
      durationMs: Date.now() - start,
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }
}
