/**
 * Unified AI client — switch between Anthropic Claude and Google Gemini
 * via the `provider` field. Keeps the call-site provider-agnostic.
 *
 * Env vars:
 *   - ANTHROPIC_API_KEY (or CLAUDE_API_KEY as alias)
 *   - GEMINI_API_KEY
 */
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  balanced: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-6',
  gemini_fast: 'gemini-2.5-flash',
  gemini_pro: 'gemini-2.5-pro',
} as const;

export type ModelKey = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelKey];

export type Provider = 'anthropic' | 'gemini';

export interface GenerateTextParams {
  provider: Provider;
  model: string;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateTextResult {
  text: string;
  usage: Usage;
  provider: Provider;
  model: string;
}

export interface StreamTextChunk {
  text: string;
  done: boolean;
}

// ---------- Lazy singletons ----------

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Missing ANTHROPIC_API_KEY (or CLAUDE_API_KEY) for Anthropic provider'
    );
  }
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (_gemini) return _gemini;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY for Gemini provider');
  }
  _gemini = new GoogleGenerativeAI(apiKey);
  return _gemini;
}

// Backward-compat: existing callers used the raw Anthropic singleton.
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, prop) {
    return (getAnthropic() as unknown as Record<string | symbol, unknown>)[
      prop as string
    ];
  },
});

// ---------- generateText ----------

export async function generateText(
  params: GenerateTextParams
): Promise<GenerateTextResult> {
  const { provider, model, prompt, system, maxTokens = 4096, temperature } = params;

  if (provider === 'anthropic') {
    const client = getAnthropic();
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return {
      text,
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      },
      provider,
      model,
    };
  }

  if (provider === 'gemini') {
    const client = getGemini();
    const genModel = client.getGenerativeModel({
      model,
      ...(system ? { systemInstruction: system } : {}),
    });
    const res = await genModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      },
    });
    const text = res.response.text();
    const meta = res.response.usageMetadata;
    return {
      text,
      usage: {
        inputTokens: meta?.promptTokenCount ?? 0,
        outputTokens: meta?.candidatesTokenCount ?? 0,
      },
      provider,
      model,
    };
  }

  throw new Error(`Unknown provider: ${provider satisfies never}`);
}

// ---------- streamText ----------

export async function* streamText(
  params: GenerateTextParams
): AsyncGenerator<StreamTextChunk, void, unknown> {
  const { provider, model, prompt, system, maxTokens = 4096, temperature } = params;

  if (provider === 'anthropic') {
    const client = getAnthropic();
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    });
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { text: event.delta.text, done: false };
      }
    }
    yield { text: '', done: true };
    return;
  }

  if (provider === 'gemini') {
    const client = getGemini();
    const genModel = client.getGenerativeModel({
      model,
      ...(system ? { systemInstruction: system } : {}),
    });
    const res = await genModel.generateContentStream({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(temperature !== undefined ? { temperature } : {}),
      },
    });
    for await (const chunk of res.stream) {
      const text = chunk.text();
      if (text) yield { text, done: false };
    }
    yield { text: '', done: true };
    return;
  }

  throw new Error(`Unknown provider: ${provider satisfies never}`);
}
