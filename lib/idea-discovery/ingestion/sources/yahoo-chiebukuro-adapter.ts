/**
 * Yahoo Chiebukuro Adapter (chiebukuro.yahoo.co.jp)
 *
 * Fetches Q&A from Yahoo Chiebukuro (Japanese Q&A platform).
 * Yahoo Chiebukuro provides a search page with server-rendered HTML.
 * This adapter scrapes the search results page.
 *
 * Strategy:
 *   - Search URL: https://chiebukuro.yahoo.co.jp/search?p={keyword}&type=tag
 *   - Parse HTML to extract question titles, body snippets, answer counts
 *   - Rate limited (5 req/min default) to be very respectful
 *
 * Note: This scrapes HTML and may break if Yahoo changes their markup.
 */

import { DataSourceAdapter } from "../data-source-adapter";
import type { DataSourceConfig, RawIdea } from "../../core/types";
import { DEFAULT_JA_KEYWORDS } from "../../core/constants";

interface ChiebukuroQuestion {
  id: string;
  title: string;
  body: string;
  url: string;
  answerCount: number;
  viewCount: number;
  date: string;
  category: string;
}

export class YahooChiebukuroAdapter extends DataSourceAdapter {
  constructor(config: DataSourceConfig) {
    super(config);
  }

  protected async fetchIdeas(): Promise<RawIdea[]> {
    const ideas: RawIdea[] = [];
    const keywords = DEFAULT_JA_KEYWORDS.slice(0, 4);

    for (const keyword of keywords) {
      if (ideas.length >= this.config.maxResultsPerRun) break;

      try {
        const questions = await this.searchQuestions(keyword);
        for (const question of questions) {
          if (ideas.length >= this.config.maxResultsPerRun) break;
          ideas.push(this.toRawIdea(question, keyword));
        }
      } catch (error) {
        this.handleError(error);
      }
    }

    return ideas;
  }

  private async searchQuestions(keyword: string): Promise<ChiebukuroQuestion[]> {
    const baseUrl = this.config.baseUrl || "https://chiebukuro.yahoo.co.jp";
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `${baseUrl}/search?p=${encodedKeyword}&type=tag&order=1`;

    try {
      const response = await this.fetchWithRateLimit(url, {
        headers: {
          Accept: "text/html",
          "Accept-Language": "ja",
          "User-Agent": "Idea-Discovery-Engine/1.0",
        },
      });

      const html = await response.text();
      return this.parseSearchResults(html);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("403") || msg.includes("503")) {
        console.warn(`[Yahoo Chiebukuro] Blocked for "${keyword}". Skipping.`);
        return [];
      }
      throw error;
    }
  }

  /**
   * Parse Yahoo Chiebukuro search results HTML.
   * Extracts question titles, URLs, and metadata from the search result page.
   */
  private parseSearchResults(html: string): ChiebukuroQuestion[] {
    const questions: ChiebukuroQuestion[] = [];

    // Match question links with titles
    // Pattern: <a class="..." href="/q/{questionId}...">{title}</a>
    const questionPattern = /<a[^>]*href="(\/q\/\d+[^"]*)"[^>]*class="[^"]*ClapLi_titleLink[^"]*"[^>]*>([^<]+)<\/a>/g;
    let match;

    while ((match = questionPattern.exec(html)) !== null) {
      const path = match[1];
      const title = this.unescapeHtml(match[2].trim());
      const idMatch = path.match(/\/q\/(\d+)/);
      if (!idMatch) continue;

      questions.push({
        id: idMatch[1],
        title,
        body: "", // Body requires individual page fetch
        url: `https://detail.chiebukuro.yahoo.co.jp${path}`,
        answerCount: 0,
        viewCount: 0,
        date: new Date().toISOString(),
        category: "",
      });
    }

    // Fallback: try alternate HTML pattern (Yahoo UI changes frequently)
    if (questions.length === 0) {
      const altPattern = /<a[^>]*href="https?:\/\/detail\.chiebukuro\.yahoo\.co\.jp\/qa\/question_detail\/q(\d+)[^"]*"[^>]*>([^<]+)<\/a>/g;
      while ((match = altPattern.exec(html)) !== null) {
        const id = match[1];
        const title = this.unescapeHtml(match[2].trim());
        if (title.length < 5) continue; // Skip short fragments

        questions.push({
          id,
          title,
          body: "",
          url: `https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q${id}`,
          answerCount: 0,
          viewCount: 0,
          date: new Date().toISOString(),
          category: "",
        });
      }
    }

    // Try extracting answer counts from nearby HTML
    for (const q of questions) {
      const answerPattern = new RegExp(
        `q${q.id}[^}]*?(\\d+)\\s*件の回答`,
      );
      const answerMatch = html.match(answerPattern);
      if (answerMatch) {
        q.answerCount = parseInt(answerMatch[1], 10);
      }
    }

    return questions.slice(0, 10); // Max 10 per search
  }

  private toRawIdea(question: ChiebukuroQuestion, searchKeyword: string): RawIdea {
    const text = [question.title, question.body].filter(Boolean).join(" ");

    return {
      id: this.generateId(question.id),
      source: "yahoo_chiebukuro",
      sourceUrl: question.url,
      sourceId: question.id,
      rawText: text.substring(0, 500),
      author: "chiebukuro_user",
      authorEngagement: {
        comments: question.answerCount,
        score: question.answerCount * 5 + question.viewCount,
      },
      extractedAt: question.date,
      language: "ja",
      tags: [searchKeyword, question.category].filter(Boolean),
      metadata: {
        platform: "yahoo_chiebukuro",
        questionId: question.id,
        answerCount: question.answerCount,
        searchKeyword,
      },
    };
  }

  private unescapeHtml(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/");
  }

  protected handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429") || message.includes("Too Many")) {
      console.warn("[Yahoo Chiebukuro] Rate limit reached. Backing off.");
    } else if (message.includes("403") || message.includes("503")) {
      console.warn("[Yahoo Chiebukuro] Access blocked. May need to adjust scraping strategy.");
    } else {
      super.handleError(error);
    }
  }
}
