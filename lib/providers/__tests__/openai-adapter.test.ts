import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIAdapter } from "../openai";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OpenAIAdapter", () => {
  const adapter = new OpenAIAdapter();
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-openai-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  it("has correct providerId and model", () => {
    expect(adapter.providerId).toBe("openai");
    expect(adapter.defaultModel).toBe("gpt-4o");
  });

  it("isAvailable returns true when key set", () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when key missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(adapter.isAvailable()).toBe(false);
  });

  it("throws when API key missing", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(adapter.generate({ prompt: "test", taskKind: "blueprint" }))
      .rejects.toThrow("OPENAI_API_KEY is not configured");
  });

  it("calls OpenAI API with Bearer auth", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "openai response" } }],
        usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
      }),
    });

    const result = await adapter.generate({ prompt: "hello", taskKind: "blueprint" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-openai-key",
        }),
      })
    );
    expect(result.provider).toBe("openai");
    expect(result.text).toBe("openai response");
    expect(result.inputTokens).toBe(8);
    expect(result.outputTokens).toBe(12);
    expect(result.totalTokens).toBe(20);
  });

  it("includes system message when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: {},
      }),
    });

    await adapter.generate({ prompt: "test", taskKind: "blueprint", system: "You are helpful" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful" });
    expect(body.messages[1]).toEqual({ role: "user", content: "test" });
  });

  it("omits system message when not provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" } }],
        usage: {},
      }),
    });

    await adapter.generate({ prompt: "test", taskKind: "blueprint" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    });

    await expect(adapter.generate({ prompt: "test", taskKind: "blueprint" }))
      .rejects.toThrow("OpenAI API error: 401");
  });
});
