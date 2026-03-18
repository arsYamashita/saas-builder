/**
 * JSON Storage Adapter — File-based storage implementation
 *
 * Stores ideas as JSON files organized by date.
 * Thread-safe writes with directory creation.
 */

import type {
  RawIdea,
  NormalizedIdea,
  AnalyzedIdea,
  DiscoveryFeedItem,
  IdeaStorageAdapter,
  DataSourceType,
} from "../core/types";
import { promises as fs } from "fs";

// ── JSON Storage Adapter ────────────────────────────────

export class JsonStorageAdapter implements IdeaStorageAdapter {
  private baseDir: string;

  constructor(baseDir: string = "./idea-discovery-storage") {
    this.baseDir = baseDir;
  }

  // ── Storage Path Generation ──────────────────────────

  private getDateDir(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${this.baseDir}/${year}-${month}-${day}`;
  }

  // ── Ensure directory exists ──────────────────────────

  private async ensureDir(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  // ── Raw Ideas ────────────────────────────────────────

  async saveRawIdeas(ideas: RawIdea[], date?: Date): Promise<void> {
    const dir = this.getDateDir(date);
    await this.ensureDir(dir);

    const filePath = `${dir}/raw.json`;
    const data = JSON.stringify(ideas, null, 2);
    await fs.writeFile(filePath, data, "utf-8");
  }

  async loadRawIdeas(date?: Date): Promise<RawIdea[]> {
    const dir = this.getDateDir(date);
    const filePath = `${dir}/raw.json`;

    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as RawIdea[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  // ── Normalized Ideas ────────────────────────────────

  async saveNormalizedIdeas(
    ideas: NormalizedIdea[],
    date?: Date
  ): Promise<void> {
    const dir = this.getDateDir(date);
    await this.ensureDir(dir);

    const filePath = `${dir}/normalized.json`;
    const data = JSON.stringify(ideas, null, 2);
    await fs.writeFile(filePath, data, "utf-8");
  }

  async loadNormalizedIdeas(date?: Date): Promise<NormalizedIdea[]> {
    const dir = this.getDateDir(date);
    const filePath = `${dir}/normalized.json`;

    try {
      const data = await fs.readFile(filePath, "utf-8");
      return JSON.parse(data) as NormalizedIdea[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  // ── Analyzed Ideas ──────────────────────────────────

  async saveAnalyzedIdeas(ideas: AnalyzedIdea[], date?: Date): Promise<void> {
    const dir = this.getDateDir(date);
    await this.ensureDir(dir);

    const filePath = `${dir}/analyzed.json`;
    const data = JSON.stringify(ideas, null, 2);
    await fs.writeFile(filePath, data, "utf-8");
  }

  async loadAnalyzedIdeas(filter?: {
    source?: DataSourceType;
    domain?: string;
    since?: string;
  }): Promise<AnalyzedIdea[]> {
    const allIdeas: AnalyzedIdea[] = [];

    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const filePath = `${this.baseDir}/${entry.name}/analyzed.json`;
          try {
            const data = await fs.readFile(filePath, "utf-8");
            const ideas = JSON.parse(data) as AnalyzedIdea[];

            // Apply filters if provided
            if (filter) {
              const filtered = ideas.filter((idea) => {
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
              allIdeas.push(...filtered);
            } else {
              allIdeas.push(...ideas);
            }
          } catch {
            // Skip if file doesn't exist
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return allIdeas;
  }

  // ── Discovery Feed ──────────────────────────────────

  async saveFeedItems(
    items: DiscoveryFeedItem[],
    date?: Date
  ): Promise<void> {
    const dir = this.getDateDir(date);
    await this.ensureDir(dir);

    const filePath = `${dir}/feed.json`;
    const data = JSON.stringify(items, null, 2);
    await fs.writeFile(filePath, data, "utf-8");
  }

  async loadFeedItems(limit?: number): Promise<DiscoveryFeedItem[]> {
    const allItems: DiscoveryFeedItem[] = [];

    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const filePath = `${this.baseDir}/${entry.name}/feed.json`;
          try {
            const data = await fs.readFile(filePath, "utf-8");
            const items = JSON.parse(data) as DiscoveryFeedItem[];
            allItems.push(...items);
          } catch {
            // Skip if file doesn't exist
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    // Sort by ranking score descending and limit if specified
    const sorted = allItems.sort((a, b) => b.rankingScore - a.rankingScore);
    return limit ? sorted.slice(0, limit) : sorted;
  }
}
