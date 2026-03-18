/**
 * SaaS Builder Storage Adapter
 *
 * Implements IdeaStorageAdapter using SaaS Builder's data/ directory pattern.
 * Persists ideas in JSON files organized by stage.
 */

import type {
  IdeaStorageAdapter,
  RawIdea,
  NormalizedIdea,
  AnalyzedIdea,
  DiscoveryFeedItem,
  DataSourceType,
} from "../core/types";
import { promises as fs } from "fs";
import { dirname } from "path";

const DATA_DIR = "./data/idea-discovery";

export class SaaSBuilderStorageAdapter implements IdeaStorageAdapter {
  private dataDir: string;

  constructor(dataDir: string = DATA_DIR) {
    this.dataDir = dataDir;
  }

  /**
   * Persist raw ideas from data sources.
   */
  async saveRawIdeas(ideas: RawIdea[]): Promise<void> {
    await this.ensureDir();
    const path = `${this.dataDir}/raw-ideas.json`;
    await fs.writeFile(path, JSON.stringify(ideas, null, 2), "utf-8");
  }

  /**
   * Persist ideas after quick filter.
   */
  async saveNormalizedIdeas(ideas: NormalizedIdea[]): Promise<void> {
    await this.ensureDir();
    const path = `${this.dataDir}/normalized-ideas.json`;
    await fs.writeFile(path, JSON.stringify(ideas, null, 2), "utf-8");
  }

  /**
   * Persist ideas after deep analysis.
   */
  async saveAnalyzedIdeas(ideas: AnalyzedIdea[]): Promise<void> {
    await this.ensureDir();
    const path = `${this.dataDir}/analyzed-ideas.json`;
    await fs.writeFile(path, JSON.stringify(ideas, null, 2), "utf-8");
  }

  /**
   * Persist ranked, discoverable feed items.
   */
  async saveFeedItems(items: DiscoveryFeedItem[]): Promise<void> {
    await this.ensureDir();
    const path = `${this.dataDir}/feed-items.json`;
    await fs.writeFile(path, JSON.stringify(items, null, 2), "utf-8");
  }

  /**
   * Load analyzed ideas with optional filtering.
   */
  async loadAnalyzedIdeas(filter?: {
    source?: DataSourceType;
    domain?: string;
    since?: string; // ISO 8601
  }): Promise<AnalyzedIdea[]> {
    try {
      const path = `${this.dataDir}/analyzed-ideas.json`;
      const content = await fs.readFile(path, "utf-8");
      let ideas: AnalyzedIdea[] = JSON.parse(content);

      // Apply filters
      if (filter) {
        if (filter.source) {
          ideas = ideas.filter((i) => i.source === filter.source);
        }
        if (filter.domain) {
          ideas = ideas.filter(
            (i) =>
              i.quickFilter.domain.toLowerCase() ===
              filter.domain!.toLowerCase(),
          );
        }
        if (filter.since) {
          const sinceDate = new Date(filter.since);
          ideas = ideas.filter((i) => new Date(i.analyzedAt) >= sinceDate);
        }
      }

      return ideas;
    } catch (error) {
      // File doesn't exist yet
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Load top-ranked feed items.
   */
  async loadFeedItems(limit?: number): Promise<DiscoveryFeedItem[]> {
    try {
      const path = `${this.dataDir}/feed-items.json`;
      const content = await fs.readFile(path, "utf-8");
      let items: DiscoveryFeedItem[] = JSON.parse(content);

      // Sort by ranking score descending
      items.sort((a, b) => b.rankingScore - a.rankingScore);

      // Apply limit
      if (limit && limit > 0) {
        items = items.slice(0, limit);
      }

      return items;
    } catch (error) {
      // File doesn't exist yet
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }
  }

  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        return;
      }
      throw error;
    }
  }
}

/**
 * Factory function for easy instantiation.
 */
export function createSaaSBuilderStorageAdapter(
  dataDir?: string,
): SaaSBuilderStorageAdapter {
  return new SaaSBuilderStorageAdapter(dataDir);
}
