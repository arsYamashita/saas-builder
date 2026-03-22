import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiAdapter } from "../gemini";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GeminiAdapter", () => {
  const adapter = new GeminiAdapter();
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-gemini-key";
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it("has correct providerId and model", () => {
    expect(adapter.providerId).toBe("gemini");
    expect(adapter.defaultModel).toContain("gemini");
  });

  it("isAvailable returns true when key set", () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it("isAvailable returns false when key missing", () => {
    delete process.env.GEMINI_API_KEY;
    expect(adapter.isAvailable()).toBe(false);
  });

  it("throws when API key missing", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(adapter.generate({ prompt: "test", taskKind: "blueprint" }))
      .rejects.toThrow("GEMINI_API_KEY is not configured");
  });

  it("calls Gemini API with key in URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "gemini response" }] } }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 15, totalTokenCount: 20 },
      }),
    });

    const result = await adapter.generate({ prompt: "hello", taskKind: "blueprint" });

    expect(mockFetch.mock.calls[0][0]).toContain("generativelanguage.googleapis.com");
    expect(mockFetch.mock.calls[0][0]).toContain("key=test-gemini-key");
    expect(result.provider).toBe("gemini");
    expect(result.text).toBe("gemini response");
    expect(result.inputTokens).toBe(5);
    expect(result.outputTokens).toBe(15);
    expect(result.totalTokens).toBe(20);
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "service unavailable",
    });

    await expect(adapter.generate({ prompt: "test", taskKind: "blueprint" }))
      .rejects.toThrow("Gemini API error: 503");
  });
});
