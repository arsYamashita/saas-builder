/**
 * Idea Discovery Engine - Main Orchestrator
 *
 * Coordinates the complete idea discovery pipeline:
 *   1. Fetch raw ideas from multiple data sources
 *   2. Normalize and quick-filter (AI-assisted)
 *   3. Deduplicate cross-source duplicates
 *   4. Deep analysis (Claude)
 *   5. Template matching
 *   6. Ranking and feed generation
 *   7. Persistence
 *
 * All components are self-contained; no SaaS Builder dependencies.
 */

import type {
  DataSourceConfig,
  DataSourceType,
  RawIdea,
  NormalizedIdea,
  AnalyzedIdea,
  DiscoveryFeedItem,
  DiscoveryReport,
  IdeaAnalyzerProvider,
  TemplateCatalogAdapter,
  IdeaStorageAdapter,
} from "./core/types";
import { DEFAULT_DATA_SOURCE_CONFIGS, RANKING_WEIGHTS, DEFAULT_TARGET_DOMAINS } from "./core/constants";
import { fetchFromAllSources } from "./ingestion/data-source-adapter";
import { normalizeIdeasBatch } from "./ingestion/raw-idea-normalizer";
import { deduplicateNormalizedIdeas } from "./ingestion/deduplication";

// ── Discovery Engine Configuration ──────────────────────────────────────

export interface DiscoveryEngineConfig {
  dataSourceConfigs: DataSourceConfig[];
  provider: IdeaAnalyzerProvider;
  templateCatalog: TemplateCatalogAdapter;
  storage: IdeaStorageAdapter;
  targetDomains?: string[];
  dedupThreshold?: number; // 0-1, default 0.75
  maxIdeasPerRun?: number; // default 500
}

// ── Engine State ────────────────────────────────────────────────────────

interface EngineRunState {
  startedAt: string;
  rawIdeasCount: number;
  normalizedCount: number;
  filteredOutCount: number;
  deduplicatedCount: number;
  analyzedCount: number;
  matchedCount: number;
  gapsFound: number;
}

// ── Discovery Engine ────────────────────────────────────────────────────

export class DiscoveryEngine {
  private config: DiscoveryEngineConfig;

  constructor(config: DiscoveryEngineConfig) {
    // Merge provided configs with defaults
    this.config = {
      ...config,
      dataSourceConfigs: config.dataSourceConfigs.length > 0 ? config.dataSourceConfigs : this.getDefaultConfigs(),
      targetDomains: config.targetDomains || DEFAULT_TARGET_DOMAINS,
      dedupThreshold: config.dedupThreshold ?? 0.75,
      maxIdeasPerRun: config.maxIdeasPerRun ?? 500,
    };
  }

  /**
   * Run full discovery pipeline.
   */
  async run(): Promise<DiscoveryReport> {
    const state: EngineRunState = {
      startedAt: new Date().toISOString(),
      rawIdeasCount: 0,
      normalizedCount: 0,
      filteredOutCount: 0,
      deduplicatedCount: 0,
      analyzedCount: 0,
      matchedCount: 0,
      gapsFound: 0,
    };

    console.log("[Discovery Engine] Starting pipeline...");

    // Step 1: Fetch raw ideas
    console.log("[Discovery Engine] Step 1: Fetching from data sources...");
    const rawIdeas = await this.fetchRawIdeas();
    state.rawIdeasCount = rawIdeas.length;
    console.log(`  Fetched ${rawIdeas.length} raw ideas`);

    if (rawIdeas.length === 0) {
      console.warn("[Discovery Engine] No ideas fetched. Aborting pipeline.");
      return this.buildEmptyReport(state);
    }

    // Step 2: Normalize and quick-filter
    console.log("[Discovery Engine] Step 2: Normalizing and quick-filtering...");
    const normalized = await this.normalizeIdeas(rawIdeas);
    state.normalizedCount = normalized.length;
    state.filteredOutCount = rawIdeas.length - normalized.length;
    console.log(`  Normalized: ${normalized.length}, Filtered out: ${state.filteredOutCount}`);

    if (normalized.length === 0) {
      console.warn("[Discovery Engine] No ideas passed normalization. Aborting pipeline.");
      return this.buildEmptyReport(state);
    }

    // Step 3: Deduplicate
    console.log("[Discovery Engine] Step 3: Deduplicating cross-source duplicates...");
    const { deduplicated, mergeSummary } = await this.deduplicateIdeas(normalized);
    state.deduplicatedCount = normalized.length - deduplicated.length;
    console.log(
      `  Deduplicated: removed ${state.deduplicatedCount} duplicates (${mergeSummary.length} merge groups)`,
    );

    // Step 4: Deep analysis
    console.log("[Discovery Engine] Step 4: Deep analysis...");
    const analyzed = await this.analyzeIdeas(deduplicated);
    state.analyzedCount = analyzed.length;
    console.log(`  Analyzed: ${analyzed.length}`);

    // Step 5: Template matching
    console.log("[Discovery Engine] Step 5: Template matching...");
    const feedItems = await this.matchTemplatesAndRank(analyzed);
    state.matchedCount = feedItems.filter((f) => f.templateMatch.type === "matched").length;
    state.gapsFound = feedItems.filter((f) => f.templateMatch.type === "gap_detected").length;
    console.log(
      `  Matched: ${state.matchedCount}, Gaps detected: ${state.gapsFound}, No match: ${feedItems.length - state.matchedCount - state.gapsFound}`,
    );

    // Step 6: Persist
    console.log("[Discovery Engine] Step 6: Persisting...");
    await this.persistResults(rawIdeas, normalized, deduplicated, analyzed, feedItems);
    console.log("  Persistence complete");

    // Step 7: Build report
    console.log("[Discovery Engine] Pipeline complete.");
    return this.buildReport(feedItems, state);
  }

  private getDefaultConfigs(): DataSourceConfig[] {
    return Object.values(DEFAULT_DATA_SOURCE_CONFIGS).filter((c) => c.enabled);
  }

  private async fetchRawIdeas(): Promise<RawIdea[]> {
    const enabledConfigs = this.config.dataSourceConfigs.filter((c) => c.enabled);
    const allIdeas = await fetchFromAllSources(enabledConfigs);

    // Apply max limit
    return allIdeas.slice(0, this.config.maxIdeasPerRun);
  }

  private async normalizeIdeas(rawIdeas: RawIdea[]): Promise<NormalizedIdea[]> {
    return normalizeIdeasBatch(rawIdeas, this.config.provider, { validate: true, maxParallel: 5 });
  }

  private async deduplicateIdeas(
    normalized: NormalizedIdea[],
  ): Promise<{
    deduplicated: NormalizedIdea[];
    mergeSummary: Array<{ kept: string; removed: string[]; reason: string }>;
  }> {
    const { deduplicated, mergeSummary } = deduplicateNormalizedIdeas(
      normalized,
      this.config.dedupThreshold,
    );
    return { deduplicated, mergeSummary };
  }

  private async analyzeIdeas(ideas: NormalizedIdea[]): Promise<AnalyzedIdea[]> {
    const analyzed: AnalyzedIdea[] = [];

    for (const idea of ideas) {
      try {
        const needsAnalysis = await this.config.provider.deepAnalysis(idea);

        const analyzed_idea: AnalyzedIdea = {
          ...idea,
          needsAnalysis,
          status: "analyzed",
          analyzedAt: new Date().toISOString(),
        };

        analyzed.push(analyzed_idea);
      } catch (error) {
        console.error(`Failed to analyze idea ${idea.id}:`, error);
      }
    }

    return analyzed;
  }

  private async matchTemplatesAndRank(analyzed: AnalyzedIdea[]): Promise<DiscoveryFeedItem[]> {
    const feedItems: DiscoveryFeedItem[] = [];

    for (const idea of analyzed) {
      const templateMatch = this.config.templateCatalog.matchFeatures(
        idea.needsAnalysis.requiredFeatures,
        idea.needsAnalysis.suggestedRoles,
      );

      const feedItem: DiscoveryFeedItem = {
        ideaId: idea.id,
        idea,
        templateMatch,
        rankingScore: this.calculateRankingScore(idea),
        rankingReason: this.generateRankingReason(idea),
        urgencyScore: this.scoreUrgency(idea.quickFilter.urgency),
        domainAffinity: this.calculateDomainAffinity(idea, this.config.targetDomains || []),
        createdAt: new Date().toISOString(),
      };

      feedItems.push(feedItem);
    }

    // Sort by ranking score descending
    feedItems.sort((a, b) => b.rankingScore - a.rankingScore);

    return feedItems;
  }

  private calculateRankingScore(idea: AnalyzedIdea): number {
    const urgencyScore = this.scoreUrgency(idea.quickFilter.urgency);
    const confidenceScore = idea.quickFilter.confidence;
    const engagementScore = this.scoreEngagement(idea);
    const recencyScore = this.scoreRecency(idea.extractedAt);

    // Weighted combination
    const score =
      urgencyScore * RANKING_WEIGHTS.urgency +
      confidenceScore * RANKING_WEIGHTS.confidence +
      engagementScore * RANKING_WEIGHTS.engagement +
      recencyScore * RANKING_WEIGHTS.recency;

    return Math.round(Math.min(score, 100));
  }

  private generateRankingReason(idea: AnalyzedIdea): string {
    const reasons: string[] = [];

    if (idea.quickFilter.confidence > 80) reasons.push("High confidence");
    if (idea.quickFilter.urgency === "high") reasons.push("High urgency");

    const engagement = this.scoreEngagement(idea);
    if (engagement > 70) reasons.push("High engagement");

    const recency = this.scoreRecency(idea.extractedAt);
    if (recency > 70) reasons.push("Recent");

    if (idea.needsAnalysis.affiliateEnabled) reasons.push("Affiliate opportunity");

    return reasons.length > 0 ? reasons.join("; ") : "Balanced profile";
  }

  private scoreUrgency(urgency: string): number {
    switch (urgency) {
      case "high":
        return 100;
      case "medium":
        return 60;
      case "low":
        return 30;
      default:
        return 50;
    }
  }

  private scoreEngagement(idea: AnalyzedIdea): number {
    const engagement = idea.authorEngagement;
    const metrics: number[] = [];

    if (engagement.likes) metrics.push(Math.min(engagement.likes / 100, 100));
    if (engagement.retweets) metrics.push(Math.min(engagement.retweets / 50, 100));
    if (engagement.comments) metrics.push(Math.min(engagement.comments / 50, 100));
    if (engagement.bookmarks) metrics.push(Math.min(engagement.bookmarks / 100, 100));
    if (engagement.score) metrics.push(Math.min(engagement.score / 100, 100));

    return metrics.length > 0 ? Math.round(metrics.reduce((a, b) => a + b) / metrics.length) : 50;
  }

  private scoreRecency(extractedAt: string): number {
    const extractedDate = new Date(extractedAt);
    const now = new Date();
    const ageMs = now.getTime() - extractedDate.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    // Exponential decay with 7-day half-life
    const decayFactor = Math.pow(0.5, ageDays / 7);
    return Math.round(decayFactor * 100);
  }

  private calculateDomainAffinity(idea: AnalyzedIdea, targetDomains: string[]): number {
    const ideaDomain = idea.quickFilter.domain.toLowerCase();
    const hasMatch = targetDomains.some((d) => ideaDomain.includes(d.toLowerCase()));
    return hasMatch ? 100 : 30;
  }

  private async persistResults(
    rawIdeas: RawIdea[],
    normalized: NormalizedIdea[],
    deduplicated: NormalizedIdea[],
    analyzed: AnalyzedIdea[],
    feedItems: DiscoveryFeedItem[],
  ): Promise<void> {
    try {
      await this.config.storage.saveRawIdeas(rawIdeas);
      await this.config.storage.saveNormalizedIdeas(normalized);
      await this.config.storage.saveAnalyzedIdeas(analyzed);
      await this.config.storage.saveFeedItems(feedItems);
    } catch (error) {
      console.error("Persistence error:", error);
      throw error;
    }
  }

  private buildReport(feedItems: DiscoveryFeedItem[], state: EngineRunState): DiscoveryReport {
    const topIdeas = feedItems.slice(0, 10);
    const gaps = feedItems
      .filter((f) => f.templateMatch.type === "gap_detected")
      .slice(0, 5)
      .map((f) => f.templateMatch.suggestedNewTemplate)
      .filter((t) => t !== null) as Array<{ domain: string; description: string; estimatedEntityCount: number; estimatedComplexity: "simple" | "medium" | "complex"; whyNew: string; relatedTemplates: string[] }>;

    // Count by source and domain
    const bySource: Record<DataSourceType, number> = {
      twitter: 0,
      hatena: 0,
      qiita: 0,
      reddit: 0,
      note: 0,
      yahoo_chiebukuro: 0,
    };

    const byDomain: Record<string, number> = {};

    for (const item of feedItems) {
      const source = item.idea.source as DataSourceType;
      bySource[source]++;

      const domain = item.idea.quickFilter.domain;
      byDomain[domain] = (byDomain[domain] || 0) + 1;
    }

    return {
      totalScraped: state.rawIdeasCount,
      totalFiltered: state.filteredOutCount,
      totalAnalyzed: state.analyzedCount,
      totalMatched: state.matchedCount,
      totalGaps: state.gapsFound,
      topIdeas,
      gapAnalysis: gaps,
      bySource,
      byDomain,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildEmptyReport(state: EngineRunState): DiscoveryReport {
    return {
      totalScraped: state.rawIdeasCount,
      totalFiltered: state.filteredOutCount,
      totalAnalyzed: 0,
      totalMatched: 0,
      totalGaps: 0,
      topIdeas: [],
      gapAnalysis: [],
      bySource: { twitter: 0, hatena: 0, qiita: 0, reddit: 0, note: 0, yahoo_chiebukuro: 0 },
      byDomain: {},
      generatedAt: new Date().toISOString(),
    };
  }
}
