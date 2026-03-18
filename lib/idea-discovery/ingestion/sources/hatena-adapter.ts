/**
 * Hatena Bookmark Adapter
 *
 * Fetches popular bookmarks from はてなブックマーク (Hatena Bookmark).
 * Uses RSS-based scraping of public API.
 * Extracts bookmark count as main engagement metric.
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";

interface HatenaRSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  comments: number;
  category: string;
}

interface HatenaRSSFeed {
  items: HatenaRSSItem[];
}

export class HatenaAdapter extends DataSourceAdapter {
  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    const ideas: RawIdea[] = [];

    // Hatena Bookmark common categories
    const categories = ["business", "tech", "social", "general"];

    for (const category of categories.slice(0, 3)) {
      try {
        const bookmarks = await this.fetchHotentries(category);
        ideas.push(...bookmarks);

        if (ideas.length >= this.config.maxResultsPerRun) {
          break;
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    return ideas.slice(0, this.config.maxResultsPerRun);
  }

  private async fetchHotentries(category: string): Promise<RawIdea[]> {
    // Hatena Bookmark hot entries RSS endpoint
    const url = `${this.config.baseUrl}/hotentry.rss?mode=${category}`;

    const response = await this.fetchWithRateLimit(url);
    const text = await response.text();

    // Simple XML parsing (no external dependency)
    const items = this.parseRSSFeed(text);

    return items.map((item) => {
      // Extract bookmark count from description
      const bookmarkMatch = item.description.match(/(\d+)\s*users/);
      const bookmarkCount = bookmarkMatch ? parseInt(bookmarkMatch[1], 10) : 0;

      return {
        id: this.generateId(item.link.substring(item.link.length - 20)),
        source: "hatena",
        sourceUrl: item.link,
        sourceId: item.link,
        rawText: (item.title + " " + item.description).substring(0, 500),
        author: "hatena_user", // Hatena RSS doesn't include original author
        authorEngagement: {
          bookmarks: bookmarkCount,
          comments: item.comments,
          score: bookmarkCount,
        },
        extractedAt: item.pubDate,
        language: "ja",
        tags: [category, item.category],
        metadata: {
          category: category,
          hatenaCategory: item.category,
          bookmarkUrl: `${this.config.baseUrl}/entry/${this.extractDomain(item.link)}/${this.extractPath(item.link)}`,
        },
      };
    });
  }

  private parseRSSFeed(xml: string): HatenaRSSItem[] {
    const items: HatenaRSSItem[] = [];

    // Match item blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];

      const titleMatch = itemXml.match(/<title>([^<]+)<\/title>/);
      const linkMatch = itemXml.match(/<link>([^<]+)<\/link>/);
      const descMatch = itemXml.match(/<description>([^<]*)<\/description>/);
      const pubDateMatch = itemXml.match(/<pubDate>([^<]+)<\/pubDate>/);
      const categoryMatch = itemXml.match(/<category>([^<]+)<\/category>/);
      const commentsMatch = itemXml.match(/<comments>(\d+)<\/comments>/);

      if (titleMatch && linkMatch) {
        items.push({
          title: this.unescapeXml(titleMatch[1]),
          link: this.unescapeXml(linkMatch[1]),
          description: descMatch ? this.unescapeXml(descMatch[1]) : "",
          pubDate: pubDateMatch ? pubDateMatch[1] : new Date().toISOString(),
          category: categoryMatch ? categoryMatch[1] : "general",
          comments: commentsMatch ? parseInt(commentsMatch[1], 10) : 0,
        });
      }
    }

    return items;
  }

  private unescapeXml(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return "unknown";
    }
  }

  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return "/";
    }
  }

  protected handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429")) {
      console.warn("[Hatena] Rate limit exceeded. Backing off.");
    } else {
      super.handleError(error);
    }
  }
}
