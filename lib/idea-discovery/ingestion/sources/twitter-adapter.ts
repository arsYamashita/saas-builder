/**
 * Twitter/X Adapter
 *
 * Fetches tweets using Twitter API v2.
 * Searches for keywords, extracts engagement metrics, returns RawIdea[].
 *
 * Requires: TWITTER_BEARER_TOKEN environment variable or config.apiKey
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";

interface TwitterSearchResult {
  id: string;
  text: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    bookmark_count: number;
  };
  created_at: string;
  author_id: string;
}

interface TwitterUserResponse {
  username: string;
}

interface TwitterApiResponse {
  data?: TwitterSearchResult[];
  includes?: {
    users?: Array<{ id: string; username: string }>;
  };
  meta?: {
    result_count: number;
  };
}

export class TwitterAdapter extends DataSourceAdapter {
  private bearerToken: string;
  private userCache: Map<string, string> = new Map(); // authorId -> username

  constructor(config: DataSourceConfig) {
    super(config);
    this.bearerToken = config.apiKey || process.env.TWITTER_BEARER_TOKEN || "";

    if (!this.bearerToken) {
      console.warn("[Twitter] No bearer token provided. Twitter adapter will return empty results.");
    }
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    if (!this.bearerToken) {
      return [];
    }

    const ideas: RawIdea[] = [];

    for (const keyword of this.config.keywords.slice(0, 5)) {
      // Limit to 5 keywords per run
      try {
        const tweets = await this.searchTweets(keyword);
        ideas.push(...tweets);

        // Respect max results
        if (ideas.length >= this.config.maxResultsPerRun) {
          break;
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    return ideas.slice(0, this.config.maxResultsPerRun);
  }

  private async searchTweets(keyword: string): Promise<RawIdea[]> {
    // Twitter API v2 search endpoint
    const url = new URL("https://api.twitter.com/2/tweets/search/recent");
    url.searchParams.append("query", keyword);
    url.searchParams.append("max_results", "100");
    url.searchParams.append("tweet.fields", "public_metrics,created_at,author_id");
    url.searchParams.append("expansions", "author_id");
    url.searchParams.append("user.fields", "username");

    const response = await this.fetchWithRateLimit(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });

    const data: TwitterApiResponse = await this.parseJson(response);

    if (!data.data) {
      return [];
    }

    // Build username map
    const userMap = new Map<string, string>();
    if (data.includes?.users) {
      for (const user of data.includes.users) {
        userMap.set(user.id, user.username);
      }
    }

    // Convert to RawIdea[]
    const ideas: RawIdea[] = data.data.map((tweet) => {
      const authorId = tweet.author_id;
      const username = userMap.get(authorId) || "unknown";

      return {
        id: this.generateId(tweet.id),
        source: "twitter",
        sourceUrl: `https://twitter.com/${username}/status/${tweet.id}`,
        sourceId: tweet.id,
        rawText: tweet.text,
        author: username,
        authorEngagement: {
          likes: tweet.public_metrics.like_count,
          retweets: tweet.public_metrics.retweet_count,
          comments: tweet.public_metrics.reply_count,
          bookmarks: tweet.public_metrics.bookmark_count,
        },
        extractedAt: tweet.created_at,
        language: this.detectLanguage(tweet.text),
        tags: [keyword],
        metadata: {
          tweetId: tweet.id,
          authorId: authorId,
        },
      };
    });

    return ideas;
  }

  private detectLanguage(text: string): "ja" | "en" {
    // Simple heuristic: check for Japanese characters
    const japaneseCharPattern = /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g;
    const matches = text.match(japaneseCharPattern) || [];
    return matches.length > text.length * 0.2 ? "ja" : "en";
  }

  protected handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429")) {
      console.warn("[Twitter] Rate limit exceeded. Backing off.");
    } else {
      super.handleError(error);
    }
  }
}
