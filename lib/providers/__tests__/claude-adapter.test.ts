import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClaudeAdapter } from "../claude";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ClaudeAdapter", () => {
  const adapter = new ClaudeAdapter();
  const originalKey = process.env.CLAUDE_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLAUDE_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.CLAUDE_API_KEY;
    } else {
      process.env.CLAUDE_API_KEY = originalKey;
    }
  });

  it("has correct providerId and model", () => {
    expect(adapter.providerId).toBe("claude");
    expect(adapter.defaultModel).toContain("claude");
  });

  it("isAvailable returns true when key set", () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when key missing", () => {
    delete process.env.CLAUDE_API_KEY;
    expect(adapter.isAvailable()).toBe(false);
  });

  it("throws when API key missing on generate", async () => {
    delete process.env.CLAUDE_API_KEY;
    await expect(adapter.generate({ prompt: "test", taskKind: "blueprint" }))
      .rejects.toThrow("CLAUDE_API_KEY is not configured");
  });

  it("calls Anthropic API with correct headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "response" }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    });

    const result = await adapter.generate({ prompt: "hello", taskKind: "blueprint" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "test-key",
          "anthropic-version": "2023-06-01",
        }),
      })
    );
    expect(result.provider).toBe("claude");
    expect(result.text).toBe("response");
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.totalTokens).toBe(30);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    });

    await expect(adapter.generate({ prompt: "test", taskKind: "blueprint" }))
      .rejects.toThrow("Claude API error: 429");
  });

  it("uses custom maxTokens and system prompt", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "ok" }],
        usage: {},
      }),
    });

    await adapter.generate({
      prompt: "test",
      taskKind: "blueprint",
      maxTokens: 1000,
      system: "custom system",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(1000);
    expect(body.system).toBe("custom system");
  });

  it("concatenates multiple text blocks", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "part1" },
          { type: "text", text: "part2" },
        ],
        usage: {},
      }),
    });

    const result = await adapter.generate({ prompt: "test", taskKind: "blueprint" });
    expect(result.text).toBe("part1\npart2");
  });
});
