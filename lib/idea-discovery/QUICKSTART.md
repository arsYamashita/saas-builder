# Idea Discovery Engine - Quick Start Guide

## 5-Minute Setup

### 1. Import the Engine

```typescript
import {
  DiscoveryEngine,
  type DiscoveryEngineConfig,
  type IdeaAnalyzerProvider,
  type TemplateCatalogAdapter,
  type IdeaStorageAdapter,
  DEFAULT_DATA_SOURCE_CONFIGS,
} from "@/lib/idea-discovery";
```

### 2. Implement Three Adapters

#### AI Provider (Gemini + Claude)
```typescript
class MyAnalyzer implements IdeaAnalyzerProvider {
  async quickFilter(rawText, source) {
    // Call Gemini API
    // Return: { viable, domain, urgency, confidence, ... }
  }

  async deepAnalysis(idea) {
    // Call Claude API
    // Return: { problemStatement, targetUsers, requiredFeatures, ... }
  }
}
```

#### Template Catalog
```typescript
class MyCatalog implements TemplateCatalogAdapter {
  listTemplates() {
    // Return all templates from your database
    return [
      { key: "pm_v2", domain: "project_management", features: [...], roles: [...] },
      // ...
    ];
  }

  matchFeatures(requiredFeatures, roles) {
    // Find matching template or detect gap
    // Return: { type: "matched" | "gap_detected" | "no_match", ... }
  }
}
```

#### Storage (Database)
```typescript
class MyStorage implements IdeaStorageAdapter {
  async saveRawIdeas(ideas) { /* persist */ }
  async saveNormalizedIdeas(ideas) { /* persist */ }
  async saveAnalyzedIdeas(ideas) { /* persist */ }
  async saveFeedItems(items) { /* persist */ }
  async loadAnalyzedIdeas(filter) { /* retrieve */ }
  async loadFeedItems(limit) { /* retrieve */ }
}
```

### 3. Create Engine & Run

```typescript
const engine = new DiscoveryEngine({
  dataSourceConfigs: [
    { ...DEFAULT_DATA_SOURCE_CONFIGS.reddit, enabled: true },
    { ...DEFAULT_DATA_SOURCE_CONFIGS.qiita, enabled: true },
    { ...DEFAULT_DATA_SOURCE_CONFIGS.hatena, enabled: true },
  ],
  provider: new MyAnalyzer(),
  templateCatalog: new MyCatalog(),
  storage: new MyStorage(),
  targetDomains: ["project_management", "crm", "marketing"],
  dedupThreshold: 0.75,
  maxIdeasPerRun: 500,
});

const report = await engine.run();

console.log(`Discovered: ${report.topIdeas.length} top ideas`);
console.log(`Gaps: ${report.gapAnalysis.length} new template opportunities`);
```

---

## Data Flow

```
Raw Ideas (Twitter, Reddit, Qiita, Hatena)
    ↓
Normalize + Quick Filter (Gemini)
    ↓
Deduplicate (cross-source)
    ↓
Deep Analysis (Claude)
    ↓
Template Matching
    ↓
Ranking & Feed Generation
    ↓
Persistence & Report
```

---

## Key Types

### Input
- **DataSourceConfig**: Source settings (keywords, rate limit, auth)
- **IdeaAnalyzerProvider**: AI provider (Gemini + Claude)
- **TemplateCatalogAdapter**: Template matching
- **IdeaStorageAdapter**: Persistence backend

### Output
- **DiscoveryReport**: Statistics + top ideas + gap analysis

```typescript
{
  totalScraped: 450,
  totalFiltered: 120,
  totalAnalyzed: 330,
  totalMatched: 280,
  totalGaps: 50,
  topIdeas: [...],      // Top 10 ranked ideas
  gapAnalysis: [...],   // New template opportunities
  bySource: {...},      // Count by data source
  byDomain: {...},      // Count by domain
}
```

---

## Configuration Examples

### Minimal (Reddit + Qiita only)
```typescript
const engine = new DiscoveryEngine({
  dataSourceConfigs: [
    DEFAULT_DATA_SOURCE_CONFIGS.reddit,
    DEFAULT_DATA_SOURCE_CONFIGS.qiita,
  ],
  provider: myAnalyzer,
  templateCatalog: myCatalog,
  storage: myStorage,
});
```

### Full (All sources enabled)
```typescript
const engine = new DiscoveryEngine({
  dataSourceConfigs: Object.values(DEFAULT_DATA_SOURCE_CONFIGS),
  provider: myAnalyzer,
  templateCatalog: myCatalog,
  storage: myStorage,
});
```

### Custom Keywords
```typescript
const config = DEFAULT_DATA_SOURCE_CONFIGS.reddit;
const engine = new DiscoveryEngine({
  dataSourceConfigs: [
    {
      ...config,
      keywords: ["my", "custom", "keywords"],
    },
  ],
  // ... other config
});
```

---

## Environment Variables

```bash
# Optional - Twitter adapter uses this if apiKey not provided in config
TWITTER_BEARER_TOKEN=your_token_here

# Your AI provider keys - use in adapter implementation
GEMINI_API_KEY=your_gemini_key
CLAUDE_API_KEY=your_claude_key
```

---

## Rate Limits (Built-in)

| Source | Limit | Notes |
|--------|-------|-------|
| Twitter | 15 req/min | Configurable |
| Reddit | 30 req/min | Public API, no auth |
| Qiita | 60 req/min | Japanese tech platform |
| Hatena | 30 req/min | Japanese bookmarks |
| Note | 20 req/min | Creator platform |
| Yahoo Chiebukuro | 10 req/min | Japanese Q&A |

Automatic backoff on 429 (rate limit) errors.

---

## Example Output

```
[Discovery Engine] Starting pipeline...
[Discovery Engine] Step 1: Fetching from data sources...
  Fetched 450 raw ideas
[Discovery Engine] Step 2: Normalizing and quick-filtering...
  Normalized: 330, Filtered out: 120
[Discovery Engine] Step 3: Deduplicating cross-source duplicates...
  Deduplicated: removed 45 duplicates (23 merge groups)
[Discovery Engine] Step 4: Deep analysis...
  Analyzed: 285
[Discovery Engine] Step 5: Template matching...
  Matched: 210, Gaps detected: 45, No match: 30
[Discovery Engine] Step 6: Persisting...
  Persistence complete
[Discovery Engine] Pipeline complete.

Report:
  Discovered: 10 top ideas
  Gaps: 5 new template opportunities
  Top by domain: project_management (45), crm (28), marketing (19)
```

---

## Testing with Mocks

```typescript
class MockAnalyzer implements IdeaAnalyzerProvider {
  async quickFilter(rawText) {
    return {
      viable: rawText.length > 50,
      domain: "project_management",
      urgency: "medium",
      confidence: 75,
      // ...
    };
  }

  async deepAnalysis(idea) {
    return {
      problemStatement: "Test problem",
      targetUsers: "Test users",
      requiredFeatures: ["feature1", "feature2"],
      // ... all required fields
    };
  }
}

class MockStorage implements IdeaStorageAdapter {
  private data = { raw: [], normalized: [], analyzed: [], feed: [] };

  async saveRawIdeas(ideas) { this.data.raw = ideas; }
  async saveNormalizedIdeas(ideas) { this.data.normalized = ideas; }
  async saveAnalyzedIdeas(ideas) { this.data.analyzed = ideas; }
  async saveFeedItems(items) { this.data.feed = items; }
  async loadAnalyzedIdeas() { return this.data.analyzed; }
  async loadFeedItems(limit) { return this.data.feed.slice(0, limit); }
}

// Run with mocks
const engine = new DiscoveryEngine({
  dataSourceConfigs: [
    { ...DEFAULT_DATA_SOURCE_CONFIGS.reddit, maxResultsPerRun: 10 },
  ],
  provider: new MockAnalyzer(),
  templateCatalog: new MockCatalog(),
  storage: new MockStorage(),
});

const report = await engine.run();
```

---

## Error Handling

Engine handles errors gracefully:

- **Network errors**: Logged, continues with other sources
- **Rate limits**: Automatic backoff
- **Parsing errors**: Logged, skipped idea
- **Analysis timeouts**: Logged, treated as filtered
- **Storage errors**: Logged, propagated (fails hard)

No crashes; always completes report even with partial failures.

---

## Extending the Engine

### Add Custom Data Source

```typescript
import { DataSourceAdapter } from "@/lib/idea-discovery";

export class MySourceAdapter extends DataSourceAdapter {
  protected async fetchIdeas(): Promise<RawIdea[]> {
    // Your implementation
  }
}
```

Then register in factory:
```typescript
// in data-source-adapter.ts createDataSourceAdapter()
case "my_source":
  const { MySourceAdapter } = await import("./sources/my-source-adapter");
  return new MySourceAdapter(config);
```

---

## Performance Notes

- **Typical run (100 ideas)**: 5-10 minutes
  - Fetching: ~30s (rate-limited)
  - Analysis: 2-3 min (AI calls)
  - Dedup: ~10s
  - Persistence: ~5s

- **Memory**: 5-10 MB for typical run
- **Suitable for**: Background jobs, not real-time

---

## Next Steps

1. Implement three adapters (Analyzer, Catalog, Storage)
2. Set environment variables
3. Run `engine.run()`
4. Review report and feed items
5. (Optional) Queue ideas for human review

See `/lib/idea-discovery/examples/basic-usage.ts` for full runnable example.
