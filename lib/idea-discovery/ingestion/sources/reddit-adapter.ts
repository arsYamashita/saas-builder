/**
 * Reddit Adapter
 *
 * Fetches hot posts from Reddit using the JSON API.
 * Searches subreddits: SaaS, startups, japandev, entrepreneur, business.
 * Extracts score and comment count as engagement metrics.
 *
 * Reddit JSON API is public and doesn't require authentication for basic reads.
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  created_utc: number;
  score: number;
  num_comments: number;
  author: string;
  subreddit: string;
  thumbnail: string;
}

interface RedditListing {
  data: {
    children: Array<{
      data: RedditPost;
    }>;
  };
}

export class RedditAdapter extends DataSourceAdapter {
  private subreddits = ["SaaS", "startups", "japandev", "entrepreneur", "business", "indiehackers"];

  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    const ideas: RawIdea[] = [];

    for (const subreddit of this.subreddits.slice(0, 3)) {
      try {
        const posts = await this.fetchHotPosts(subreddit);
        ideas.push(...posts);

        if (ideas.length >= this.config.maxResultsPerRun) {
          break;
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    return ideas.slice(0, this.config.maxResultsPerRun);
  }

  private async fetchHotPosts(subreddit: string): Promise<RawIdea[]> {
    // Reddit JSON API endpoint
    const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=100`;

    const response = await this.fetchWithRateLimit(url, {
      headers: {
        Accept: "application/json",
      },
    });

    const data: RedditListing = await this.parseJson(response);

    if (!data.data?.children) {
      return [];
    }

    return data.data.children.map((child) => {
      const post = child.data;
      const createdDate = new Date(post.created_utc * 1000).toISOString();

      // Combine title and text for rawText
      const rawText = (post.title + " " + post.selftext).substring(0, 500);

      return {
        id: this.generateId(post.id),
        source: "reddit",
        sourceUrl: `https://reddit.com${this.getPostUrl(post)}`,
        sourceId: post.id,
        rawText: rawText,
        author: post.author,
        authorEngagement: {
          likes: post.score,
          comments: post.num_comments,
          score: post.score,
        },
        extractedAt: createdDate,
        language: this.detectLanguage(rawText),
        tags: [subreddit, post.subreddit],
        metadata: {
          subreddit: post.subreddit,
          postTitle: post.title,
          numComments: post.num_comments,
          upvoteRatio: post.score,
        },
      };
    });
  }

  private getPostUrl(post: RedditPost): string {
    // Construct post URL from subreddit and ID
    return `/r/${post.subreddit}/comments/${post.id}`;
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
      console.warn("[Reddit] Rate limit exceeded. Backing off.");
    } else {
      super.handleError(error);
    }
  }
}
