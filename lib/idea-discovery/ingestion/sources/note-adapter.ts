/**
 * Note Adapter (note.com)
 *
 * Fetches articles from note.com (Japanese creator platform).
 * note.com provides an undocumented public JSON API for search.
 * We use the public search endpoint with SaaS-related keywords.
 *
 * Strategy:
 *   - Search API: https://note.com/api/v3/searches?q={keyword}
 *   - Rate limited (10 req/min default) to be respectful
 *
 * Note: Uses undocumented endpoints that may change without notice.
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";
import { DEFAULT_JA_KEYWORDS } from "../../core/constants";

interface NoteSearchResult {
  data?: {
    notes?: NoteArticle[];
  };
}

interface NoteArticle {
  id: number;
  key: string;
  name: string;
  body?: string;
  description?: string;
  likeCount: number;
  commentCount?: number;
  user?: {
    urlname: string;
    nickname: string;
  };
  publishAt?: string;
  createdAt?: string;
  hashtags?: Array<{ hashtag: { name: string } }>;
}

export class NoteAdapter extends DataSourceAdapter {
  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    const ideas: RawIdea[] = [];
    const keywords = DEFAULT_JA_KEYWORDS.slice(0, 5);

    for (const keyword of keywords) {
      if (ideas.length >= this.config.maxResultsPerRun) break;

      try {
        const articles = await this.searchNotes(keyword);
        for (const article of articles) {
          if (ideas.length >= this.config.maxResultsPerRun) break;
          ideas.push(this.toRawIdea(article, keyword));
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    return ideas;
  }

  private async searchNotes(keyword: string): Promise<NoteArticle[]> {
    const baseUrl = this.config.baseUrl || "https://note.com";
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `${baseUrl}/api/v3/searches?q=${encodedKeyword}&size=10&start=0&sort=new&noteOnly=true`;

    try {
      const response = await this.fetchWithRateLimit(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Idea-Discovery-Engine/1.0",
        },
      });

      const data = await this.parseJson<NoteSearchResult>(response);
      return data?.data?.notes || [];
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("Failed to parse JSON")) {
        console.warn(`[Note] Search for "${keyword}" returned non-JSON. Skipping.`);
        return [];
      }
      throw error;
    }
  }

  private toRawIdea(article: NoteArticle, searchKeyword: string): RawIdea {
    const noteUrl = article.user?.urlname
      ? `https://note.com/${article.user.urlname}/n/${article.key}`
      : `https://note.com/n/${article.key}`;

    const text = [
      article.name,
      article.description || "",
      article.body?.substring(0, 300) || "",
    ]
      .filter(Boolean)
      .join(" ");

    const tags = (article.hashtags || [])
      .map((h) => h.hashtag?.name)
      .filter(Boolean) as string[];

    return {
      id: this.generateId(String(article.id)),
      source: "note",
      sourceUrl: noteUrl,
      sourceId: String(article.id),
      rawText: text.substring(0, 500),
      author: article.user?.nickname || article.user?.urlname || "note_user",
      authorEngagement: {
        likes: article.likeCount || 0,
        comments: article.commentCount || 0,
        score: article.likeCount || 0,
      },
      extractedAt: article.publishAt || article.createdAt || new Date().toISOString(),
      language: "ja",
      tags: [searchKeyword, ...tags],
      metadata: {
        platform: "note.com",
        noteKey: article.key,
        searchKeyword,
      },
    };
  }

  protected handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429") || message.includes("Too Many")) {
      console.warn("[Note] Rate limit reached. Backing off.");
    } else if (message.includes("403")) {
      console.warn("[Note] Access forbidden. note.com may have changed their API.");
    } else {
      super.handleError(error);
    }
  }
}
