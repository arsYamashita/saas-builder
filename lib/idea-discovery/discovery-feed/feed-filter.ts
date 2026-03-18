/**
 * Feed Filter — Filter discovery feed items by various criteria
 *
 * Provides flexible filtering by source, urgency, ranking score,
 * template match status, and custom predicates.
 */

import type { DiscoveryFeedItem, DataSourceType } from "../core/types";

// ── Filter Configuration ────────────────────────────────

export interface FeedFilterOptions {
  sources?: DataSourceType[];
  minRankingScore?: number;
  maxRankingScore?: number;
  minUrgency?: number;
  dateRange?: {
    from: Date;
    to: Date;
  };
  templateMatchType?: "matched" | "gap_detected" | "no_match";
  customPredicate?: (item: DiscoveryFeedItem) => boolean;
}

// ── Main Filter Function ────────────────────────────────

export function filterFeedItems(
  items: DiscoveryFeedItem[],
  options: FeedFilterOptions
): DiscoveryFeedItem[] {
  return items.filter((item) => {
    // Source filter
    if (options.sources && options.sources.length > 0) {
      if (!options.sources.includes(item.idea.source)) {
        return false;
      }
    }

    // Ranking score filters
    if (
      options.minRankingScore !== undefined &&
      item.rankingScore < options.minRankingScore
    ) {
      return false;
    }

    if (
      options.maxRankingScore !== undefined &&
      item.rankingScore > options.maxRankingScore
    ) {
      return false;
    }

    // Urgency filter
    if (
      options.minUrgency !== undefined &&
      item.urgencyScore < options.minUrgency
    ) {
      return false;
    }

    // Date range filter
    if (options.dateRange) {
      const createdAt = new Date(item.createdAt);
      if (
        createdAt < options.dateRange.from ||
        createdAt > options.dateRange.to
      ) {
        return false;
      }
    }

    // Template match type filter
    if (
      options.templateMatchType &&
      item.templateMatch.type !== options.templateMatchType
    ) {
      return false;
    }

    // Custom predicate
    if (options.customPredicate && !options.customPredicate(item)) {
      return false;
    }

    return true;
  });
}

// ── Common Filter Presets ────────────────────────────────

export function filterCritical(items: DiscoveryFeedItem[]): DiscoveryFeedItem[] {
  return filterFeedItems(items, { minRankingScore: 75 });
}

export function filterHigh(items: DiscoveryFeedItem[]): DiscoveryFeedItem[] {
  return filterFeedItems(items, {
    minRankingScore: 50,
    maxRankingScore: 74,
  });
}

export function filterBySource(
  items: DiscoveryFeedItem[],
  source: DataSourceType
): DiscoveryFeedItem[] {
  return filterFeedItems(items, { sources: [source] });
}

export function filterWithTemplateMatches(
  items: DiscoveryFeedItem[]
): DiscoveryFeedItem[] {
  return filterFeedItems(items, { templateMatchType: "matched" });
}

export function filterWithoutTemplateMatches(
  items: DiscoveryFeedItem[]
): DiscoveryFeedItem[] {
  return filterFeedItems(items, { templateMatchType: "no_match" });
}

export function filterTemplateGaps(
  items: DiscoveryFeedItem[]
): DiscoveryFeedItem[] {
  return filterFeedItems(items, { templateMatchType: "gap_detected" });
}

export function filterRecent(
  items: DiscoveryFeedItem[],
  days: number = 7
): DiscoveryFeedItem[] {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return filterFeedItems(items, {
    dateRange: { from, to: now },
  });
}

export function filterHighUrgency(
  items: DiscoveryFeedItem[]
): DiscoveryFeedItem[] {
  return filterFeedItems(items, { minUrgency: 75 });
}

export function filterReadyForImplementation(
  items: DiscoveryFeedItem[]
): DiscoveryFeedItem[] {
  return filterFeedItems(items, {
    templateMatchType: "matched",
    minRankingScore: 60,
  });
}

export function filterNeedingValidation(
  items: DiscoveryFeedItem[]
): DiscoveryFeedItem[] {
  return filterFeedItems(items, {
    templateMatchType: "no_match",
    minRankingScore: 30,
    maxRankingScore: 60,
  });
}

// ── Filter Statistics ────────────────────────────────────

export function getFilterStatistics(
  items: DiscoveryFeedItem[],
  filtered: DiscoveryFeedItem[]
): {
  total: number;
  filtered: number;
  percentage: number;
  avgRankingScore: number;
  avgUrgency: number;
} {
  const count = filtered.length || 1;
  let totalRanking = 0;
  let totalUrgency = 0;

  for (const item of filtered) {
    totalRanking += item.rankingScore;
    totalUrgency += item.urgencyScore;
  }

  return {
    total: items.length,
    filtered: filtered.length,
    percentage: Math.round((filtered.length / items.length) * 100),
    avgRankingScore: Math.round(totalRanking / count),
    avgUrgency: Math.round(totalUrgency / count),
  };
}

// ── Multi-filter Search ──────────────────────────────────

export function searchFeed(
  items: DiscoveryFeedItem[],
  query: string
): DiscoveryFeedItem[] {
  const lowerQuery = query.toLowerCase();

  return items.filter(
    (item) =>
      item.idea.id.toLowerCase().includes(lowerQuery) ||
      item.idea.rawText.toLowerCase().includes(lowerQuery) ||
      item.idea.source.toLowerCase().includes(lowerQuery) ||
      item.templateMatch.reasons.some((reason) =>
        reason.toLowerCase().includes(lowerQuery)
      )
  );
}
