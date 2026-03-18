/**
 * Idea Discovery Engine — Main Orchestrator
 *
 * Coordinates all components: ingestion, analysis, matching, and feed generation.
 * Fully dependency-injected for testing and flexibility.
 * Standalone — no SaaS Builder internal dependencies.
 */

import type {
  RawIdea,
  NormalizedIdea,
  AnalyzedIdea,
  DiscoveryFeedItem,
  DiscoveryReport,
  NewTemplateProposal,
  DataSourceConfig,
  DataSourceType,
  IdeaAnalyzerProvider,
  TemplateCatalogAdapter,
  IdeaStorageAdapter,
  TemplateMatch,
} from "./types";

import { classifyDomain } from "../analysis/domain-classifier";
import { scoreUrgency } from "../analysis/urgency-scorer";
import { detectGaps } from "../analysis/gap-detector";
import { matchTemplate, getBestMatch, type TemplateMatchResult } from "../matching/template-matcher";
import { extractFeatures } from "../matching/feature-extractor";
import { generateDiscoveryFeed, getFeedStatistics } from "../discovery-feed/feed-generator";
import { rankFeedItems, getPriorityBuckets } from "../discovery-feed/feed-ranker";
import {
  filterCritical,
  filterWithoutTemplateMatches,
} from "../discovery-feed/feed-filter";
import { deduplicateNormalizedIdeas } from "../ingestion/deduplication";

// ── Engine Configuration ────────────────────────────────

export interface DiscoveryEngineConfig {
  /** Min confidence threshold for quick filter pass (0-100) */
  minQuickFilterConfidence?: number;
  /** Min feature extraction count to proceed with analysis */
  minFeaturesDetected?: number;
  /** Max analyses to run in parallel (default: 5) */
  maxParallelAnalyses?: number;
}

const DEFAULT_CONFIG: Required<DiscoveryEngineConfig> = {
  minQuickFilterConfidence: 50,
  minFeaturesDetected: 1,
  maxParallelAnalyses: 5,
};

// ── Idea Discovery Engine ────────────────────────────────

export class IdeaDiscoveryEngine {
  private dataSourceConfigs: DataSourceConfig[];
  private analyzer: IdeaAnalyzerProvider;
  private templateCatalog: TemplateCatalogAdapter;
  private storage: IdeaStorageAdapter;
  private config: Required<DiscoveryEngineConfig>;

  constructor(
    dataSourceConfigs: DataSourceConfig[],
    analyzer: IdeaAnalyzerProvider,
    templateCatalog: TemplateCatalogAdapter,
    storage: IdeaStorageAdapter,
    config?: DiscoveryEngineConfig,
  ) {
    this.dataSourceConfigs = dataSourceConfigs;
    this.analyzer = analyzer;
    this.templateCatalog = templateCatalog;
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Full Pipeline Execution ──────────────────────────

  async runDiscovery(): Promise<DiscoveryReport> {
    // 1. Ingest raw ideas from all sources
    const rawIdeas = await this.ingest();

    // 2. Quick-filter with Gemini
    const normalized = await this.quickFilter(rawIdeas);

    // 3. Deduplicate across sources
    const { deduplicated: unique } = deduplicateNormalizedIdeas(normalized);

    // 4. Deep analysis with Claude
    const analyzed = await this.deepAnalyze(unique);

    // 5. Template matching
    const matchMap = await this.matchTemplates(analyzed);

    // 6. Generate feed
    const feedItems = generateDiscoveryFeed(analyzed);

    // Enrich feed items with template matches
    for (const item of feedItems) {
      const matches = matchMap.get(item.ideaId);
      if (matches && matches.length > 0) {
        const best = getBestMatch(matches);
        if (best) {
          item.templateMatch = {
            type: best.confidence >= 70 ? "matched" : best.confidence >= 30 ? "gap_detected" : "no_match",
            templateKey: best.templateKey,
            confidence: best.confidence,
            reasons: best.featureOverlap.map((f: string) => `Matched feature: ${f}`),
            suggestedNewTemplate: null,
          };
        }
      }
    }

    // 7. Rank feed
    const rankedFeed = rankFeedItems(feedItems);

    // 8. Store results
    await this.storage.saveRawIdeas(rawIdeas);
    await this.storage.saveNormalizedIdeas(normalized);
    await this.storage.saveAnalyzedIdeas(analyzed);
    await this.storage.saveFeedItems(rankedFeed);

    // 9. Generate report
    return this.buildReport(rawIdeas, normalized, analyzed, rankedFeed);
  }

  // ── 1. Ingestion ─────────────────────────────────────

  async ingest(): Promise<RawIdea[]> {
    // Engine doesn't know about specific adapters; consumers
    // should call their adapters and pass results, or override this.
    // By default, return empty (real adapters are external).
    return [];
  }

  // ── 2. Quick Filter ──────────────────────────────────

  async quickFilter(rawIdeas: RawIdea[]): Promise<NormalizedIdea[]> {
    const results: NormalizedIdea[] = [];

    for (const raw of rawIdeas) {
      try {
        const qf = await this.analyzer.quickFilter(raw.rawText, raw.source);

        if (!qf.viable || qf.confidence < this.config.minQuickFilterConfidence) {
          continue;
        }

        const normalized: NormalizedIdea = {
          ...raw,
          quickFilter: qf,
          status: "normalized",
          normalizedAt: new Date().toISOString(),
        };
        results.push(normalized);
      } catch (error) {
        // Skip on error, continue with other ideas
      }
    }

    return results;
  }

  // ── 3. Deep Analysis ─────────────────────────────────

  async deepAnalyze(normalized: NormalizedIdea[]): Promise<AnalyzedIdea[]> {
    const analyzed: AnalyzedIdea[] = [];
    const batches = this.createBatches(normalized, this.config.maxParallelAnalyses);

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map((idea) => this.analyzeOne(idea)),
      );
      for (const r of results) {
        if (r !== null) analyzed.push(r);
      }
    }

    return analyzed;
  }

  private async analyzeOne(idea: NormalizedIdea): Promise<AnalyzedIdea | null> {
    try {
      // Check feature count
      const features = extractFeatures(idea.rawText);
      if (features.length < this.config.minFeaturesDetected) {
        return null;
      }

      // Deep analysis
      const needsAnalysis = await this.analyzer.deepAnalysis(idea);

      const analyzed: AnalyzedIdea = {
        ...idea,
        needsAnalysis,
        status: "analyzed",
        analyzedAt: new Date().toISOString(),
      };

      return analyzed;
    } catch {
      return null;
    }
  }

  // ── 4. Template Matching ─────────────────────────────

  async matchTemplates(
    analyzed: AnalyzedIdea[],
  ): Promise<Map<string, TemplateMatchResult[]>> {
    const matchMap = new Map<string, TemplateMatchResult[]>();

    for (const idea of analyzed) {
      try {
        const matches = await matchTemplate(idea.needsAnalysis, this.templateCatalog);
        matchMap.set(idea.id, matches);
      } catch {
        matchMap.set(idea.id, []);
      }
    }

    return matchMap;
  }

  // ── 5. Report ────────────────────────────────────────

  private buildReport(
    rawIdeas: RawIdea[],
    normalized: NormalizedIdea[],
    analyzed: AnalyzedIdea[],
    feedItems: DiscoveryFeedItem[],
  ): DiscoveryReport {
    const gapItems = filterWithoutTemplateMatches(feedItems);
    const matched = feedItems.filter(
      (f) => f.templateMatch.type === "matched",
    );

    // Build source counts
    const bySource: Record<DataSourceType, number> = {
      twitter: 0, hatena: 0, qiita: 0, reddit: 0, note: 0, yahoo_chiebukuro: 0,
    };
    for (const idea of rawIdeas) {
      bySource[idea.source] = (bySource[idea.source] || 0) + 1;
    }

    // Build domain counts
    const byDomain: Record<string, number> = {};
    for (const idea of analyzed) {
      const domain = classifyDomain(idea.rawText) ?? "unknown";
      byDomain[domain] = (byDomain[domain] || 0) + 1;
    }

    // Gap proposals
    const gapAnalysis: NewTemplateProposal[] = gapItems
      .slice(0, 5)
      .filter((item) => item.urgencyScore >= 50)
      .map((item) => ({
        domain: item.idea?.needsAnalysis?.requiredFeatures?.[0] ?? "general",
        description: item.idea?.needsAnalysis?.problemStatement ?? "Gap detected",
        estimatedEntityCount: item.idea?.needsAnalysis?.coreEntities?.length ?? 3,
        estimatedComplexity: "medium" as const,
        whyNew: `High urgency gap (score: ${item.urgencyScore})`,
        relatedTemplates: item.templateMatch?.templateKey
          ? [item.templateMatch.templateKey]
          : [],
      }));

    return {
      totalScraped: rawIdeas.length,
      totalFiltered: normalized.length,
      totalAnalyzed: analyzed.length,
      totalMatched: matched.length,
      totalGaps: gapItems.length,
      topIdeas: feedItems.slice(0, 10),
      gapAnalysis,
      bySource,
      byDomain,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Utility ──────────────────────────────────────────

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }
}
