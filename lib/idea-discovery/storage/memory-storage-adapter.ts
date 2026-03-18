/**
 * Memory Storage Adapter — In-memory storage for testing
 *
 * Stores all ideas in memory, organized by date.
 * Perfect for unit tests and development.
 */

import type {
  RawIdea,
  NormalizedIdea,
  AnalyzedIdea,
  DiscoveryFeedItem,
  IdeaStorageAdapter,
  DataSourceType,
} from "../core/types";

// ── Date key helper ─────────────────────────────────────

function getDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ── Memory Storage Adapter ──────────────────────────────

export class MemoryStorageAdapter implements IdeaStorageAdapter {
  private rawIdeasByDate: Map<string, RawIdea[]> = new Map();
  private normalizedIdeasByDate: Map<string, NormalizedIdea[]> = new Map();
  private analyzedIdeasByDate: Map<string, AnalyzedIdea[]> = new Map();
  private discoveryFeedByDate: Map<string, DiscoveryFeedItem[]> = new Map();

  // ── Raw Ideas ────────────────────────────────────────

  async saveRawIdeas(ideas: RawIdea[], date?: Date): Promise<void> {
    const key = getDateKey(date);
    this.rawIdeasByDate.set(key, [...ideas]);
  }

  async loadRawIdeas(date?: Date): Promise<RawIdea[]> {
    const key = getDateKey(date);
    return [...(this.rawIdeasByDate.get(key) || [])];
  }

  // ── Normalized Ideas ────────────────────────────────

  async saveNormalizedIdeas(
    ideas: NormalizedIdea[],
    date?: Date
  ): Promise<void> {
    const key = getDateKey(date);
    this.normalizedIdeasByDate.set(key, [...ideas]);
  }

  async loadNormalizedIdeas(date?: Date): Promise<NormalizedIdea[]> {
    const key = getDateKey(date);
    return [...(this.normalizedIdeasByDate.get(key) || [])];
  }

  // ── Analyzed Ideas ──────────────────────────────────

  async saveAnalyzedIdeas(ideas: AnalyzedIdea[], date?: Date): Promise<void> {
    const key = getDateKey(date);
    this.analyzedIdeasByDate.set(key, [...ideas]);
  }

  async loadAnalyzedIdeas(filter?: {
    source?: DataSourceType;
    domain?: string;
    since?: string;
  }): Promise<AnalyzedIdea[]> {
    const allIdeas: AnalyzedIdea[] = [];

    for (const ideas of Array.from(this.analyzedIdeasByDate.values())) {
      allIdeas.push(...ideas);
    }

    if (!filter) {
      return allIdeas;
    }

    return allIdeas.filter((idea) => {
      if (filter.source && idea.source !== filter.source) {
        return false;
      }
      if (filter.domain && !idea.id.includes(filter.domain)) {
        return false;
      }
      if (filter.since && idea.analyzedAt < filter.since) {
        return false;
      }
      return true;
    });
  }

  // ── Discovery Feed ──────────────────────────────────

  async saveFeedItems(
    items: DiscoveryFeedItem[],
    date?: Date
  ): Promise<void> {
    const key = getDateKey(date);
    this.discoveryFeedByDate.set(key, [...items]);
  }

  async loadFeedItems(limit?: number): Promise<DiscoveryFeedItem[]> {
    const allItems: DiscoveryFeedItem[] = [];

    for (const items of Array.from(this.discoveryFeedByDate.values())) {
      allItems.push(...items);
    }

    const sorted = allItems.sort((a, b) => b.rankingScore - a.rankingScore);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  // ── Testing utilities ────────────────────────────────

  /** Clear all stored data */
  clear(): void {
    this.rawIdeasByDate.clear();
    this.normalizedIdeasByDate.clear();
    this.analyzedIdeasByDate.clear();
    this.discoveryFeedByDate.clear();
  }

  /** Get all dates that have data */
  getAllDates(): string[] {
    const dates = new Set<string>();

    for (const key of Array.from(this.rawIdeasByDate.keys())) {
      dates.add(key);
    }
    for (const key of Array.from(this.normalizedIdeasByDate.keys())) {
      dates.add(key);
    }
    for (const key of Array.from(this.analyzedIdeasByDate.keys())) {
      dates.add(key);
    }
    for (const key of Array.from(this.discoveryFeedByDate.keys())) {
      dates.add(key);
    }

    return Array.from(dates).sort();
  }

  /** Get statistics about stored data */
  getStats(): {
    totalRawIdeas: number;
    totalNormalizedIdeas: number;
    totalAnalyzedIdeas: number;
    totalFeedItems: number;
    datesWithData: number;
  } {
    let totalRaw = 0;
    let totalNormalized = 0;
    let totalAnalyzed = 0;
    let totalFeed = 0;

    for (const ideas of Array.from(this.rawIdeasByDate.values())) {
      totalRaw += ideas.length;
    }
    for (const ideas of Array.from(this.normalizedIdeasByDate.values())) {
      totalNormalized += ideas.length;
    }
    for (const ideas of Array.from(this.analyzedIdeasByDate.values())) {
      totalAnalyzed += ideas.length;
    }
    for (const items of Array.from(this.discoveryFeedByDate.values())) {
      totalFeed += items.length;
    }

    return {
      totalRawIdeas: totalRaw,
      totalNormalizedIdeas: totalNormalized,
      totalAnalyzedIdeas: totalAnalyzed,
      totalFeedItems: totalFeed,
      datesWithData: this.getAllDates().length,
    };
  }
}
