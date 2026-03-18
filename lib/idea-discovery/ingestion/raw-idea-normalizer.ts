/**
 * Raw Idea Normalizer
 *
 * Standardizes RawIdea across all sources.
 * Applies quick filter to classify viability.
 * Returns NormalizedIdea for downstream analysis.
 */

import type { RawIdea, NormalizedIdea, QuickFilterResult, IdeaAnalyzerProvider } from "../core/types";
import { CONFIDENCE_THRESHOLDS } from "../core/constants";

/**
 * Normalize raw ideas using AI provider's quick-filter.
 */
export async function normalizeIdeas(
  rawIdeas: RawIdea[],
  provider: IdeaAnalyzerProvider,
): Promise<{
  normalized: NormalizedIdea[];
  filtered: RawIdea[];
}> {
  const normalized: NormalizedIdea[] = [];
  const filtered: RawIdea[] = [];

  for (const idea of rawIdeas) {
    try {
      const quickFilter = await provider.quickFilter(idea.rawText, idea.source);

      // Apply confidence threshold
      if (quickFilter.confidence < CONFIDENCE_THRESHOLDS.quickFilterMinimum || !quickFilter.viable) {
        filtered.push(idea);
        continue;
      }

      const normalized_idea: NormalizedIdea = {
        ...idea,
        quickFilter,
        status: "normalized",
        normalizedAt: new Date().toISOString(),
      };

      normalized.push(normalized_idea);
    } catch (error) {
      // On analysis error, treat as filtered
      console.error(`Failed to normalize idea ${idea.id}:`, error);
      filtered.push(idea);
    }
  }

  return { normalized, filtered };
}

/**
 * Basic text cleaning (preprocessing before AI analysis).
 * Removes URLs, excessive whitespace, handles encoding.
 */
export function cleanRawText(text: string): string {
  let cleaned = text;

  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "[URL]");

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Handle common entities
  cleaned = cleaned.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

  return cleaned;
}

/**
 * Extract potential domain from raw text heuristically.
 * Useful for early categorization before full AI analysis.
 */
export function extractDomainHints(text: string): string[] {
  const hints: string[] = [];
  const lowerText = text.toLowerCase();

  // Domain keywords mapping
  const domainKeywords: Record<string, string[]> = {
    project_management: ["プロジェクト", "project", "task", "管理", "deadlines"],
    crm: ["顧客", "customer", "crm", "営業", "sales"],
    accounting: ["会計", "accounting", "invoice", "請求", "expense"],
    marketing: ["マーケティング", "marketing", "campaign", "広告", "ads"],
    hr: ["人事", "hr", "employee", "採用", "recruitment"],
    collaboration: ["コラボレーション", "collaboration", "team", "チーム", "communication"],
    analytics: ["分析", "analytics", "data", "insight", "dashboard"],
    e_commerce: ["eコマース", "ecommerce", "shop", "store", "商品"],
  };

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        hints.push(domain);
        break; // One match per domain
      }
    }
  }

  return Array.from(new Set(hints)); // Remove duplicates
}

/**
 * Score engagement levels (0-100).
 * Normalizes across different metrics from different sources.
 */
export function scoreEngagement(idea: RawIdea): number {
  const engagement = idea.authorEngagement;

  // Collect available metrics
  const metrics: number[] = [];

  if (engagement.likes !== undefined) metrics.push(Math.min(engagement.likes / 100, 100));
  if (engagement.retweets !== undefined) metrics.push(Math.min(engagement.retweets / 50, 100));
  if (engagement.comments !== undefined) metrics.push(Math.min(engagement.comments / 50, 100));
  if (engagement.bookmarks !== undefined) metrics.push(Math.min(engagement.bookmarks / 100, 100));
  if (engagement.score !== undefined) metrics.push(Math.min(engagement.score / 100, 100));

  if (metrics.length === 0) return 50; // Default neutral score

  // Average the normalized metrics
  const avgScore = metrics.reduce((a, b) => a + b, 0) / metrics.length;
  return Math.round(avgScore);
}

/**
 * Recency score (0-100).
 * Recently extracted ideas score higher.
 * Half-life: 7 days.
 */
export function scoreRecency(extractedAt: string): number {
  const extractedDate = new Date(extractedAt);
  const now = new Date();
  const ageMs = now.getTime() - extractedDate.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  // Exponential decay with 7-day half-life
  const halfLife = 7;
  const decayFactor = Math.pow(0.5, ageDays / halfLife);

  return Math.round(decayFactor * 100);
}

/**
 * Validation check before normalization.
 * Returns true if idea meets minimum standards.
 */
export function validateRawIdea(idea: RawIdea): boolean {
  // Must have minimal fields
  if (!idea.id || !idea.source || !idea.sourceId || !idea.rawText) {
    return false;
  }

  // Text must have meaningful content (> 10 chars)
  if (idea.rawText.trim().length < 10) {
    return false;
  }

  // Author should exist (or be marked as unknown)
  if (!idea.author || idea.author === "") {
    return false;
  }

  return true;
}

/**
 * Batch normalize with filtering and validation.
 */
export async function normalizeIdeasBatch(
  rawIdeas: RawIdea[],
  provider: IdeaAnalyzerProvider,
  options?: {
    validate?: boolean;
    maxParallel?: number;
  },
): Promise<NormalizedIdea[]> {
  const { validate = true, maxParallel = 5 } = options || {};

  // Validation pass
  let toProcess = rawIdeas;
  if (validate) {
    toProcess = rawIdeas.filter((idea) => validateRawIdea(idea));
  }

  // Parallel normalization with concurrency limit
  const results: NormalizedIdea[] = [];

  for (let i = 0; i < toProcess.length; i += maxParallel) {
    const batch = toProcess.slice(i, i + maxParallel);
    const batchResults = await Promise.all(
      batch.map(async (idea) => {
        try {
          const quickFilter = await provider.quickFilter(idea.rawText, idea.source);
          if (!quickFilter.viable || quickFilter.confidence < CONFIDENCE_THRESHOLDS.quickFilterMinimum) {
            return null;
          }

          return {
            ...idea,
            quickFilter,
            status: "normalized" as const,
            normalizedAt: new Date().toISOString(),
          };
        } catch (error) {
          console.error(`Normalization failed for ${idea.id}:`, error);
          return null;
        }
      }),
    );

    results.push(...batchResults.filter((r) => r !== null));
  }

  return results;
}
