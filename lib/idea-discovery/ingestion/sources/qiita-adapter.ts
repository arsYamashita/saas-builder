/**
 * Qiita Adapter
 *
 * Fetches articles from Qiita (Japanese tech knowledge platform).
 * Searches by tags/keywords, extracts likes and stock count.
 * Public API - no authentication required for basic access.
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";

interface QiitaArticle {
  id: string;
  title: string;
  body: string;
  url: string;
  created_at: string;
  updated_at: string;
  likes_count: number;
  stocks_count: number;
  user: {
    id: string;
    name: string;
    profile_image_url: string;
  };
  tags: Array<{ name: string; versions: unknown[] }>;
}

export class QiitaAdapter extends DataSourceAdapter {
  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    const ideas: RawIdea[] = [];

    for (const keyword of this.config.keywords.slice(0, 5)) {
      try {
        const articles = await this.searchArticles(keyword);
        ideas.push(...articles);

        if (ideas.length >= this.config.maxResultsPerRun) {
          break;
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    return ideas.slice(0, this.config.maxResultsPerRun);
  }

  private async searchArticles(keyword: string): Promise<RawIdea[]> {
    // Qiita API v2 articles search
    const url = new URL(`${this.config.baseUrl}/articles`);
    url.searchParams.append("query", `title:"${keyword}" OR body:"${keyword}"`);
    url.searchParams.append("per_page", "100");
    url.searchParams.append("sort", "likes");

    const response = await this.fetchWithRateLimit(url.toString());
    const articles: QiitaArticle[] = await this.parseJson(response);

    return articles.map((article) => {
      // Extract first 500 chars of body as rawText
      const rawText = (article.title + " " + article.body).substring(0, 500);
      const tagNames = article.tags.map((t) => t.name);

      return {
        id: this.generateId(article.id),
        source: "qiita",
        sourceUrl: article.url,
        sourceId: article.id,
        rawText: rawText,
        author: article.user.name,
        authorEngagement: {
          likes: article.likes_count,
          score: article.stocks_count, // Qiita uses "stocks" as main engagement
        },
        extractedAt: article.created_at,
        language: "ja",
        tags: [...tagNames, keyword],
        metadata: {
          articleTitle: article.title,
          stocksCount: article.stocks_count,
          userId: article.user.id,
          tags: tagNames,
        },
      };
    });
  }

  protected handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429")) {
      console.warn("[Qiita] Rate limit exceeded. Backing off.");
    } else if (message.includes("403")) {
      console.warn("[Qiita] Forbidden. Check API token if using authenticated endpoints.");
    } else {
      super.handleError(error);
    }
  }
}
