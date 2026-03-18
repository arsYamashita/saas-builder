# Idea Discovery Engine

A **standalone, self-contained module** for discovering SaaS ideas from multiple data sources using AI-assisted analysis and ranking.

## Key Features

- **Multi-source ingestion**: Twitter/X, Reddit, Qiita, Hatena Bookmark (with hooks for Note, Yahoo Chiebukuro)
- **Built-in rate limiting**: Respects API quotas automatically
- **AI-powered filtering**: Quick filter (Gemini) + deep analysis (Claude)
- **Cross-source deduplication**: Jaccard similarity + Levenshtein distance
- **Template matching**: Identifies both matched templates and market gaps
- **Smart ranking**: Urgency, confidence, engagement, recency, domain affinity
- **Pluggable storage**: Implement `IdeaStorageAdapter` for your backend
- **Zero dependencies**: Uses only TypeScript + native fetch API

## No SaaS Builder Dependencies

This module is completely self-contained:
- ✅ No imports from `../templates/`, `../providers/`, `../factory/`, etc.
- ✅ No reliance on SaaS Builder internal APIs
- ✅ Usable in any Node.js or browser environment
- ✅ Adapters are abstract; consumers provide implementations

## Architecture

```
┌─────────────────────────────────────────────┐
│   Raw Data Sources                          │
│  (Twitter, Reddit, Qiita, Hatena, etc.)    │
└────────────────┬────────────────────────────┘
                 │ [DataSourceAdapter]
                 ▼
┌─────────────────────────────────────────────┐
│   Raw Ideas (RawIdea[])                     │
│   - minimal transformation                  │
│   - maintains source fidelity                │
└────────────────┬────────────────────────────┘
                 │ [normalizeIdeasBatch + IdeaAnalyzerProvider]
                 ▼
┌─────────────────────────────────────────────┐
│   Quick Filter (NormalizedIdea[])           │
│   - viability assessment                    │
│   - domain + urgency classification          │
└────────────────┬────────────────────────────┘
                 │ [deduplicateNormalizedIdeas]
                 ▼
┌─────────────────────────────────────────────┐
│   Deduped Ideas (NormalizedIdea[])          │
│   - cross-source merging                    │
│   - duplicate removal                       │
└────────────────┬────────────────────────────┘
                 │ [AnalyzedIdea + IdeaAnalyzerProvider]
                 ▼
┌─────────────────────────────────────────────┐
│   Deep Analysis (AnalyzedIdea[])            │
│   - problem statement                       │
│   - target users, features, entities        │
│   - billing model, affiliate potential      │
└────────────────┬────────────────────────────┘
                 │ [TemplateCatalogAdapter]
                 ▼
┌─────────────────────────────────────────────┐
│   Template Matching (DiscoveryFeedItem[])  │
│   - matched templates                       │
│   - gap analysis                            │
│   - ranking scores                          │
└────────────────┬────────────────────────────┘
                 │ [IdeaStorageAdapter]
                 ▼
┌─────────────────────────────────────────────┐
│   Persistence & Report (DiscoveryReport)   │
│   - all intermediate results saved          │
│   - feed items ranked & ready for review    │
└─────────────────────────────────────────────┘
```

## Usage

### 1. Implement Required Adapters

```typescript
// Implement IdeaAnalyzerProvider (AI provider)
class MyAnalyzer implements IdeaAnalyzerProvider {
  async quickFilter(rawText: string, source: DataSourceType): Promise<QuickFilterResult> {
    // Call Gemini or Claude API
    // Return viability assessment
  }

  async deepAnalysis(idea: NormalizedIdea): Promise<NeedsAnalysis> {
    // Call Claude API for structural analysis
    // Return feature requirements, target users, etc.
  }
}

// Implement TemplateCatalogAdapter (template matching)
class MyTemplateCatalog implements TemplateCatalogAdapter {
  listTemplates() {
    // Return all available templates
  }

  matchFeatures(requiredFeatures: string[], roles: string[]): TemplateMatch {
    // Match features to templates
    // Detect gaps
  }
}

// Implement IdeaStorageAdapter (persistence)
class MyStorage implements IdeaStorageAdapter {
  async saveRawIdeas(ideas: RawIdea[]): Promise<void> {
    // Persist to database/file
  }

  async saveNormalizedIdeas(ideas: NormalizedIdea[]): Promise<void> {
    // Persist
  }

  async saveAnalyzedIdeas(ideas: AnalyzedIdea[]): Promise<void> {
    // Persist
  }

  async saveFeedItems(items: DiscoveryFeedItem[]): Promise<void> {
    // Persist
  }

  async loadAnalyzedIdeas(filter?: {
    source?: DataSourceType;
    domain?: string;
    since?: string;
  }): Promise<AnalyzedIdea[]> {
    // Load with optional filters
  }

  async loadFeedItems(limit?: number): Promise<DiscoveryFeedItem[]> {
    // Load top feed items
  }
}
```

### 2. Configure Data Sources

```typescript
import {
  DEFAULT_DATA_SOURCE_CONFIGS,
  DataSourceConfig,
} from "@/lib/idea-discovery";

// Use defaults and override as needed
const dataSourceConfigs: DataSourceConfig[] = [
  {
    ...DEFAULT_DATA_SOURCE_CONFIGS.twitter,
    apiKey: process.env.TWITTER_BEARER_TOKEN,
    keywords: ["SaaS", "startup", "automation"],
  },
  {
    ...DEFAULT_DATA_SOURCE_CONFIGS.reddit,
    keywords: ["SaaS", "startups", "japandev"],
  },
  DEFAULT_DATA_SOURCE_CONFIGS.qiita,
  DEFAULT_DATA_SOURCE_CONFIGS.hatena,
];
```

### 3. Create and Run Engine

```typescript
import { DiscoveryEngine, type DiscoveryEngineConfig } from "@/lib/idea-discovery";

const config: DiscoveryEngineConfig = {
  dataSourceConfigs,
  provider: new MyAnalyzer(),
  templateCatalog: new MyTemplateCatalog(),
  storage: new MyStorage(),
  targetDomains: ["project_management", "crm", "marketing"],
  dedupThreshold: 0.75,
  maxIdeasPerRun: 500,
};

const engine = new DiscoveryEngine(config);

// Run the full pipeline
const report = await engine.run();

console.log(`Discovered: ${report.topIdeas.length} top ideas`);
console.log(`Gaps detected: ${report.gapAnalysis.length} new template opportunities`);
```

## Type System

### Input Types

- **DataSourceConfig**: Configuration for each data source
- **IdeaAnalyzerProvider**: AI provider for quick filter + deep analysis
- **TemplateCatalogAdapter**: Template catalog query interface
- **IdeaStorageAdapter**: Persistence backend

### Processing Types

- **RawIdea**: Unprocessed idea from data source
- **NormalizedIdea**: After quick filter (RawIdea + QuickFilterResult)
- **AnalyzedIdea**: After deep analysis (NormalizedIdea + NeedsAnalysis)
- **DiscoveryFeedItem**: Ranked, matchable idea (AnalyzedIdea + TemplateMatch + scores)

### Output Types

- **DiscoveryReport**: Aggregated results with top ideas and gap analysis

## Constants & Defaults

### Thresholds

```typescript
CONFIDENCE_THRESHOLDS = {
  quickFilterMinimum: 60,     // Quick filter must exceed this
  analysisMinimum: 50,        // Deep analysis minimum
  templateMatchMinimum: 70,   // Match confidence minimum
};
```

### Ranking Weights

```typescript
RANKING_WEIGHTS = {
  urgency: 0.3,       // Problem urgency
  confidence: 0.25,   // AI confidence in classification
  engagement: 0.2,    // Source engagement metrics
  recency: 0.15,      // How recent the idea is
  templateMatch: 0.1, // Existing template affinity
};
```

### Default Keywords & Domains

- **DEFAULT_JA_KEYWORDS**: Japanese market keywords (困っている, プロジェクト管理, etc.)
- **DEFAULT_EN_KEYWORDS**: English market keywords
- **DEFAULT_TARGET_DOMAINS**: Common SaaS domains (project_management, crm, etc.)
- **DEFAULT_DATA_SOURCE_CONFIGS**: Pre-configured adapters for all sources

## Error Handling

All adapters gracefully handle:
- Network errors → logged, continues with other sources
- Rate limits → automatic backoff, graceful degradation
- Parsing errors → logged, skipped idea
- Analysis timeouts → logged, treated as filtered

## Performance Notes

- **Rate limiting**: Built into all adapters (configurable requestsPerMinute)
- **Parallel analysis**: Batch normalization with configurable concurrency (default: 5)
- **Deduplication**: O(n²) similarity checking; appropriate for 100-500 ideas per run
- **Memory**: All processing in-memory; suitable for typical discovery runs

## Testing Integration

All types and adapters are fully testable:
- Mock `IdeaAnalyzerProvider` for unit tests
- Mock `TemplateCatalogAdapter` for matching tests
- Mock `IdeaStorageAdapter` for persistence tests
- Use small keyword sets to minimize API calls

## Files

```
lib/idea-discovery/
├── core/
│   ├── types.ts             # Type definitions
│   └── constants.ts         # Defaults & thresholds
├── ingestion/
│   ├── data-source-adapter.ts
│   ├── raw-idea-normalizer.ts
│   ├── deduplication.ts
│   └── sources/
│       ├── twitter-adapter.ts
│       ├── reddit-adapter.ts
│       ├── qiita-adapter.ts
│       ├── hatena-adapter.ts
│       ├── note-adapter.ts
│       └── yahoo-chiebukuro-adapter.ts
├── engine.ts                # Main orchestrator
├── index.ts                 # Public API exports
└── README.md                # This file
```

## License

Same as parent project.
