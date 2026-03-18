# SaaS Builder Idea Discovery Integration

This directory contains integration adapters that bridge the standalone idea-discovery module with SaaS Builder's infrastructure.

## Files

### 1. saas-builder-template-adapter.ts
Implements `TemplateCatalogAdapter` using SaaS Builder's template catalog.
- Maps SaaS Builder templates to the generic interface
- Uses template-recommendation.ts for matching
- Calculates feature overlap and confidence scores

### 2. saas-builder-ai-adapter.ts
Implements `IdeaAnalyzerProvider` using SaaS Builder's provider system.
- Uses Gemini for `quickFilter()` (fast classification)
- Uses Claude for `deepAnalysis()` (detailed structural analysis)
- Falls back gracefully on provider errors

### 3. saas-builder-storage-adapter.ts
Implements `IdeaStorageAdapter` using SaaS Builder's data/ directory pattern.
- Persists ideas in JSON files organized by stage
- Loads analyzed ideas with optional filtering
- Loads ranked feed items with sorting

### 4. saas-builder-factory.ts
Factory function that creates a fully configured IdeaDiscoveryEngine.
```typescript
const engine = createSaaSBuilderDiscoveryEngine({
  maxIdeasPerRun: 500,
  dedupThreshold: 0.75,
  targetDomains: ["membership", "crm", "reservation"]
});
const report = await engine.run();
```

## Usage

### In Code
```typescript
import { createSaaSBuilderDiscoveryEngine } from "@/lib/idea-discovery/integrations/saas-builder-factory";

const engine = createSaaSBuilderDiscoveryEngine();
const report = await engine.run();
```

### Environment Variables Required
- `GEMINI_API_KEY` - Google Gemini API key for quick filtering
- `ANTHROPIC_API_KEY` - Claude API key for deep analysis

## Data Flow

1. **Raw Ideas** - Fetched from multiple data sources (Twitter, Qiita, Reddit, etc.)
2. **Quick Filter** - Gemini classifies viability and extracts domain/urgency (stored in raw-ideas.json)
3. **Normalization** - Filter ideas pass quick filter (stored in normalized-ideas.json)
4. **Deduplication** - Remove cross-source duplicates
5. **Deep Analysis** - Claude performs structural analysis (stored in analyzed-ideas.json)
6. **Template Matching** - Match against SaaS Builder templates
7. **Ranking** - Rank by engagement, urgency, recency
8. **Feed** - Produce ranked, discoverable feed items (stored in feed-items.json)

## Persistence

All data is stored in JSON files under `data/idea-discovery/`:
- `raw-ideas.json` - All fetched ideas from data sources
- `normalized-ideas.json` - Ideas that passed quick filter
- `analyzed-ideas.json` - Ideas with deep analysis results
- `feed-items.json` - Ranked, discoverable ideas

## API Endpoints

See `/app/api/idea-discovery/` for API endpoints:
- `GET /api/idea-discovery` - List discovered ideas
- `POST /api/idea-discovery` - Trigger discovery run
- `GET /api/idea-discovery/[ideaId]` - Get idea details
- `POST /api/idea-discovery/[ideaId]` - Create project from idea
- `GET /api/idea-discovery/report` - Get discovery report
