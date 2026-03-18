/**
 * Idea Discovery Engine — Main Export
 *
 * Re-exports all public APIs for clean imports.
 * Types are re-exported from ./core/types for unified access.
 */

// ── Core Types ───────────────────────────────────────────
export type {
  RawIdea,
  NormalizedIdea,
  AnalyzedIdea,
  QuickFilterResult,
  NeedsAnalysis,
  TemplateMatch,
  DiscoveryFeedItem,
  DiscoveryReport,
  NewTemplateProposal,
  DataSourceType,
  DataSourceConfig,
  IdeaAnalyzerProvider,
  TemplateCatalogAdapter,
  IdeaStorageAdapter,
} from "./core/types";

// ── Analysis Layer ───────────────────────────────────────

// Idea Analyzer (Gemini quick filter)
export { GeminiIdeaAnalyzer, MockIdeaAnalyzer } from "./analysis/idea-analyzer";

// Needs Analyzer (Claude deep analysis)
export {
  ClaudeNeedsAnalyzer,
  MockNeedsAnalyzer,
} from "./analysis/needs-analyzer";

// Domain Classifier
export {
  classifyDomain,
  getMatchingDomains,
  type SaaSDomain,
} from "./analysis/domain-classifier";

// Urgency Scorer
export {
  scoreUrgency,
  getUrgencyLevel,
  describeUrgencyScore,
} from "./analysis/urgency-scorer";

// Gap Detector
export {
  detectGaps,
  generateGapReport,
  type GapAnalysis,
} from "./analysis/gap-detector";

// ── Matching Layer ───────────────────────────────────────

// Template Matcher
export {
  matchTemplate,
  generateMatchReport,
  getBestMatch,
} from "./matching/template-matcher";

// Feature Extractor
export {
  extractFeatures,
  getFeatureCounts,
  hasFeature,
  getAllFeatures,
  type FeatureKey,
} from "./matching/feature-extractor";

// ── Storage Layer ────────────────────────────────────────

// JSON Storage
export { JsonStorageAdapter } from "./storage/json-storage-adapter";

// Memory Storage
export { MemoryStorageAdapter } from "./storage/memory-storage-adapter";

// ── Feed Layer ───────────────────────────────────────────

// Feed Generator
export {
  generateDiscoveryFeed,
  summarizeFeedItem,
  getFeedStatistics,
} from "./discovery-feed/feed-generator";

// Feed Ranker
export {
  rankFeedItems,
  generateRankingReport,
  getPriorityBuckets,
  type RankingConfig,
} from "./discovery-feed/feed-ranker";

// Feed Filter
export {
  filterFeedItems,
  filterCritical,
  filterHigh,
  filterWithTemplateMatches,
  filterWithoutTemplateMatches,
  filterBySource,
  filterRecent,
  filterHighUrgency,
  filterTemplateGaps,
  filterReadyForImplementation,
  filterNeedingValidation,
  searchFeed,
  getFilterStatistics,
  type FeedFilterOptions,
} from "./discovery-feed/feed-filter";
