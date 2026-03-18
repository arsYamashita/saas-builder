/**
 * Idea Discovery Engine - Core Type Definitions
 *
 * Standalone type definitions with no external dependencies.
 * All types are self-contained and can be imported independently.
 */

// ── Data Source Types ───────────────────────────────────────────────────

export type DataSourceType = "twitter" | "hatena" | "qiita" | "reddit" | "note" | "yahoo_chiebukuro";

// ── Raw Idea ────────────────────────────────────────────────────────────

/**
 * RawIdea represents an unprocessed idea extracted directly from a data source.
 * Minimal transformation; maintains source fidelity.
 */
export interface RawIdea {
  id: string;
  source: DataSourceType;
  sourceUrl: string;
  sourceId: string;
  rawText: string;
  author: string;
  authorEngagement: {
    likes?: number;
    retweets?: number;
    comments?: number;
    bookmarks?: number;
    score?: number;
  };
  extractedAt: string; // ISO 8601
  language: "ja" | "en";
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ── Quick Filter Result (Gemini) ────────────────────────────────────────

/**
 * QuickFilterResult is Gemini's first-pass viability assessment.
 * Fast, confidence-based filtering to eliminate non-viable ideas early.
 */
export interface QuickFilterResult {
  viable: boolean;
  domain: string;
  targetUserType: string;
  urgency: "low" | "medium" | "high";
  confidence: number; // 0-100
  reason: string;
  quickTag: string; // category tag for quick routing
}

// ── Normalized Idea ─────────────────────────────────────────────────────

/**
 * NormalizedIdea is a RawIdea that has passed quick filter.
 * Ready for deep analysis.
 */
export interface NormalizedIdea extends RawIdea {
  quickFilter: QuickFilterResult;
  status: "raw" | "normalized" | "filtered_out" | "analyzed" | "matched";
  normalizedAt: string; // ISO 8601
}

// ── Needs Analysis (Claude) ─────────────────────────────────────────────

/**
 * NeedsAnalysis is Claude's deep structural assessment of a normalized idea.
 * Identifies problem statement, target users, required features, entities, etc.
 */
export interface NeedsAnalysis {
  problemStatement: string;
  targetUsers: string;
  mainUseCases: string[];
  requiredFeatures: string[];
  coreEntities: string[];
  suggestedRoles: string[];
  billingModel: "subscription" | "one_time" | "hybrid" | "none";
  affiliateEnabled: boolean;
  matchedTemplateKey: string | null;
  matchConfidence: number; // 0-100
  gapIdentified: string | null;
  suggestedNewTemplate: NewTemplateProposal | null;
  assumptions: string[];
}

// ── New Template Proposal ───────────────────────────────────────────────

/**
 * Proposed template structure when no existing template matches an idea.
 */
export interface NewTemplateProposal {
  domain: string;
  description: string;
  estimatedEntityCount: number;
  estimatedComplexity: "simple" | "medium" | "complex";
  whyNew: string;
  relatedTemplates: string[]; // keys of similar existing templates
}

// ── Analyzed Idea ───────────────────────────────────────────────────────

/**
 * AnalyzedIdea is a NormalizedIdea that has completed Claude deep analysis.
 * Contains full structural understanding and template matching intent.
 */
export interface AnalyzedIdea extends NormalizedIdea {
  needsAnalysis: NeedsAnalysis;
  analyzedAt: string; // ISO 8601
}

// ── Template Match Result ───────────────────────────────────────────────

/**
 * Result of attempting to match an analyzed idea to existing templates.
 */
export interface TemplateMatch {
  type: "matched" | "gap_detected" | "no_match";
  templateKey: string | null;
  confidence: number; // 0-100
  reasons: string[];
  suggestedNewTemplate: NewTemplateProposal | null;
}

// ── Discovery Feed Item ─────────────────────────────────────────────────

/**
 * A ranked, discoverable idea ready for review.
 * Combines analyzed idea with match results and ranking scores.
 */
export interface DiscoveryFeedItem {
  ideaId: string;
  idea: AnalyzedIdea;
  templateMatch: TemplateMatch;
  rankingScore: number; // 0-100
  rankingReason: string;
  urgencyScore: number; // 0-100
  domainAffinity: number; // 0-100 (how well it fits target domains)
  createdAt: string; // ISO 8601
}

// ── Discovery Report ────────────────────────────────────────────────────

/**
 * Aggregated report of a discovery run.
 * Includes statistics, top ideas, gap analysis, and source breakdown.
 */
export interface DiscoveryReport {
  totalScraped: number;
  totalFiltered: number;
  totalAnalyzed: number;
  totalMatched: number;
  totalGaps: number;
  topIdeas: DiscoveryFeedItem[];
  gapAnalysis: NewTemplateProposal[];
  bySource: Record<DataSourceType, number>;
  byDomain: Record<string, number>;
  generatedAt: string; // ISO 8601
}

// ── Data Source Configuration ───────────────────────────────────────────

/**
 * Configuration for a single data source adapter.
 * Each adapter is instantiated with one of these.
 */
export interface DataSourceConfig {
  type: DataSourceType;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  rateLimit: {
    requestsPerMinute: number;
  };
  keywords: string[];
  maxResultsPerRun: number;
}

// ── AI Provider Interface ───────────────────────────────────────────────

/**
 * Generic interface for AI providers that perform idea analysis.
 * Decouples the discovery engine from specific provider implementations.
 */
export interface IdeaAnalyzerProvider {
  /**
   * Quick-filter raw idea text.
   * Fast, confidence-based classification.
   */
  quickFilter(rawText: string, source: DataSourceType): Promise<QuickFilterResult>;

  /**
   * Deep structural analysis of a normalized idea.
   * Identifies features, entities, billing models, template matches.
   */
  deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis>;
}

// ── Template Catalog Adapter ────────────────────────────────────────────

/**
 * Interface for querying and matching against template catalog.
 * Implemented by consumers (e.g., SaaS Builder).
 * Allows discovery engine to remain independent of template storage.
 */
export interface TemplateCatalogAdapter {
  /**
   * List all available templates.
   */
  listTemplates(): {
    key: string;
    domain: string;
    features: string[];
    roles: string[];
  }[];

  /**
   * Attempt to match required features and roles against catalog.
   * Returns match result with confidence and gap analysis.
   */
  matchFeatures(requiredFeatures: string[], roles: string[]): TemplateMatch;
}

// ── Storage Adapter ─────────────────────────────────────────────────────

/**
 * Interface for persisting and retrieving ideas.
 * Implemented by consumers (e.g., database, JSON file, in-memory).
 * Allows discovery engine to remain agnostic to storage backend.
 */
export interface IdeaStorageAdapter {
  /**
   * Persist raw ideas from data sources.
   */
  saveRawIdeas(ideas: RawIdea[]): Promise<void>;

  /**
   * Persist ideas after quick filter.
   */
  saveNormalizedIdeas(ideas: NormalizedIdea[]): Promise<void>;

  /**
   * Persist ideas after deep analysis.
   */
  saveAnalyzedIdeas(ideas: AnalyzedIdea[]): Promise<void>;

  /**
   * Persist ranked, discoverable feed items.
   */
  saveFeedItems(items: DiscoveryFeedItem[]): Promise<void>;

  /**
   * Load analyzed ideas with optional filtering.
   */
  loadAnalyzedIdeas(filter?: {
    source?: DataSourceType;
    domain?: string;
    since?: string; // ISO 8601
  }): Promise<AnalyzedIdea[]>;

  /**
   * Load top-ranked feed items.
   */
  loadFeedItems(limit?: number): Promise<DiscoveryFeedItem[]>;
}
