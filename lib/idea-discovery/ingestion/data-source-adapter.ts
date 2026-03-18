/**
 * Data Source Adapter - Abstract Base & Factory
 *
 * Provides:
 *   1. Abstract base for all data source adapters
 *   2. Factory function to instantiate adapters
 *   3. Built-in rate limiting and retry logic
 *   4. Error handling and logging hooks
 */

import type { DataSourceConfig, DataSourceType, RawIdea } from "../core/types";

// ── Rate Limiter ────────────────────────────────────────────────────────

/**
 * Simple sliding window rate limiter.
 * Ensures adapter respects requestsPerMinute quota.
 */
class RateLimiter {
  private timestamps: number[] = [];
  private maxRequests: number;
  private windowMs: number = 60000; // 1 minute

  constructor(requestsPerMinute: number) {
    this.maxRequests = requestsPerMinute;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();

    // Remove old timestamps outside the window
    this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      // Calculate wait time: time until oldest timestamp leaves the window
      const oldestTs = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldestTs) + 100; // +100ms buffer

      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return this.waitIfNeeded(); // Recursive check after waiting
      }
    }

    this.timestamps.push(now);
  }

  reset(): void {
    this.timestamps = [];
  }
}

// ── Abstract Adapter Base ───────────────────────────────────────────────

/**
 * Abstract base class for all data source adapters.
 * Handles rate limiting, error handling, and common patterns.
 */
export abstract class DataSourceAdapter {
  protected config: DataSourceConfig;
  protected rateLimiter: RateLimiter;

  constructor(config: DataSourceConfig) {
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit.requestsPerMinute);
  }

  /**
   * Main entry point: fetch and return raw ideas from this source.
   * Subclasses implement their specific logic in fetchIdeas().
   */
  async fetch(): Promise<RawIdea[]> {
    if (!this.config.enabled) {
      return [];
    }

    try {
      const ideas = await this.fetchIdeas();
      return ideas;
    } catch (error) {
      this.handleError(error);
      return [];
    }
  }

  /**
   * Implemented by subclasses. Contains source-specific fetch logic.
   */
  protected abstract fetchIdeas(): Promise<RawIdea[]>;

  /**
   * Template method for making rate-limited HTTP requests.
   */
  protected async fetchWithRateLimit(url: string, options?: RequestInit): Promise<Response> {
    await this.rateLimiter.waitIfNeeded();

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Idea-Discovery-Engine/1.0",
        ...((options?.headers as Record<string, string>) || {}),
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  /**
   * Parse JSON response with error handling.
   */
  protected async parseJson<T>(response: Response): Promise<T> {
    try {
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Log and handle errors. Subclasses can override for custom handling.
   */
  protected handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${this.config.type}] Error: ${message}`);
  }

  /**
   * Generate unique idea ID combining source and sourceId.
   */
  protected generateId(sourceId: string): string {
    return `${this.config.type}:${sourceId}:${Date.now()}`;
  }

  /**
   * Validate URL is properly formed before fetching.
   */
  protected validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

// ── Factory ─────────────────────────────────────────────────────────────

/**
 * Factory function to create adapter instances.
 * Dynamically imports and instantiates appropriate adapter class.
 */
export async function createDataSourceAdapter(
  config: DataSourceConfig,
): Promise<DataSourceAdapter> {
  switch (config.type) {
    case "twitter":
      const { TwitterAdapter } = await import("./sources/twitter-adapter");
      return new TwitterAdapter(config);

    case "reddit":
      const { RedditAdapter } = await import("./sources/reddit-adapter");
      return new RedditAdapter(config);

    case "qiita":
      const { QiitaAdapter } = await import("./sources/qiita-adapter");
      return new QiitaAdapter(config);

    case "hatena":
      const { HatenaAdapter } = await import("./sources/hatena-adapter");
      return new HatenaAdapter(config);

    case "note":
      const { NoteAdapter } = await import("./sources/note-adapter");
      return new NoteAdapter(config);

    case "yahoo_chiebukuro":
      const { YahooChiebukuroAdapter } = await import("./sources/yahoo-chiebukuro-adapter");
      return new YahooChiebukuroAdapter(config);

    default:
      throw new Error(`Unknown data source type: ${(config as unknown as { type: string }).type}`);
  }
}

// ── Batch Fetcher ───────────────────────────────────────────────────────

/**
 * Utility to fetch from multiple adapters concurrently.
 */
export async function fetchFromAllSources(configs: DataSourceConfig[]): Promise<RawIdea[]> {
  const adapters = await Promise.all(configs.map((c) => createDataSourceAdapter(c)));
  const allResults = await Promise.all(adapters.map((a) => a.fetch()));
  return allResults.flat();
}
