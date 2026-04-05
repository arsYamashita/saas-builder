/**
 * Groq Provider Adapter
 *
 * Wraps Groq API calls with exponential backoff for 429 rate-limit errors.
 * Falls back gracefully when GROQ_API_KEY is absent.
 */

import type {
  ProviderAdapter,
  GenerationRequest,
  ProviderRawResult,
} from "./provider-interface";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

async function withExponentialBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isRateLimit = message.includes("429") || message.toLowerCase().includes("rate_limit");

      if (!isRateLimit || attempt === MAX_RETRIES) throw err;

      // Honour Retry-After when available
      const retryAfterMs =
        err instanceof Error && "headers" in err
          ? parseInt(String((err as { headers?: { "retry-after"?: string } }).headers?.["retry-after"] ?? "0")) * 1000
          : 0;

      const delayMs = retryAfterMs || Math.min(INITIAL_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
      console.warn(`[Groq] Rate limit hit. Retry ${attempt + 1}/${MAX_RETRIES} after ${delayMs}ms`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Should never reach here
  throw new Error("[Groq] Max retries exceeded");
}

export class GroqAdapter implements ProviderAdapter {
  readonly providerId = "groq" as const;
  readonly defaultModel = GROQ_MODEL;

  isAvailable(): boolean {
    return !!process.env.GROQ_API_KEY;
  }

  async generate(request: GenerationRequest): Promise<ProviderRawResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const start = Date.now();

    const messages: Array<{ role: string; content: string }> = [];
    if (request.system) {
      messages.push({ role: "system", content: request.system });
    }
    messages.push({ role: "user", content: request.prompt });

    const raw = await withExponentialBackoff(async () => {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          max_tokens: request.maxTokens ?? 8192,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Groq API error: ${response.status} ${text}`);
      }

      return response.json() as Promise<{
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      }>;
    });

    const text = raw.choices?.[0]?.message?.content ?? "";
    const inputTokens = raw.usage?.prompt_tokens;
    const outputTokens = raw.usage?.completion_tokens;
    const totalTokens =
      inputTokens != null && outputTokens != null ? inputTokens + outputTokens : undefined;

    return {
      provider: "groq",
      model: GROQ_MODEL,
      text,
      raw,
      durationMs: Date.now() - start,
      inputTokens,
      outputTokens,
      totalTokens,
    };
  }
}
